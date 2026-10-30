"""Resilience analytics: single points of failure, attack-path chokepoints, twin drift and vendor concentration."""

from __future__ import annotations

from collections import defaultdict

import networkx as nx

from .graph import best_paths, cascade, consequence_metrics, consequence_value, observed_edges, traversal_graph
from .model import UNTRUSTED_ZONES, Twin
from .risk import compute

CROWN_JEWEL_TYPES = {"scada", "rtu", "plc"}


def crown_jewels(twin: Twin) -> list[str]:
    """Assets whose compromise reaches physical control: SCADA servers and controllers wired to live equipment."""
    out = []
    for a in twin.assets.values():
        if a["category"] != "cyber" or a["type"] not in CROWN_JEWEL_TYPES:
            continue
        if a["type"] == "scada" and a["zone"] == "dmz":
            continue
        if a["type"] in {"rtu", "plc"} and not any(e["relation"] == "controls" for e in twin.ops_out(a["id"])):
            continue
        out.append(a["id"])
    return out


def _attack_digraph(twin: Twin, min_likelihood: float = 0.1) -> nx.DiGraph:
    g = nx.DiGraph()
    for u, hops in traversal_graph(twin).items():
        for h in hops:
            if h.likelihood < min_likelihood:
                continue
            cuttable = not h.edge_id.startswith("ADJ:")
            prev = g.get_edge_data(u, h.target)
            if prev is None or h.likelihood > prev["likelihood"]:
                g.add_edge(u, h.target, likelihood=h.likelihood, edge_id=h.edge_id, cuttable=cuttable,
                           capacity=1.0 if cuttable else 3.0, kind=h.kind, protocol=h.protocol)
    return g


def _census(g: nx.DiGraph, entries: list[str], jewels: list[str], cutoff: int = 6, cap: int = 20000) -> dict:
    total = 0
    by_entry: dict[str, int] = defaultdict(int)
    mass = 0.0
    targets = [j for j in jewels if j in g]
    for entry in entries:
        if entry not in g or not targets:
            continue
        for path in nx.all_simple_paths(g, entry, targets, cutoff=cutoff):
            total += 1
            by_entry[entry] += 1
            p = 1.0
            for u, v in zip(path, path[1:]):
                p *= g[u][v]["likelihood"]
            mass += p
            if total >= cap:
                break
        if total >= cap:
            break
    return {"paths": total, "capped": total >= cap, "by_entry": dict(by_entry), "likelihood_mass": round(mass, 4), "crown_jewels": jewels}


def attack_path_census(twin: Twin) -> dict:
    """Count candidate attack paths from untrusted networks to crown jewels."""
    return _census(_attack_digraph(twin), twin.entry_ids(), crown_jewels(twin))


def chokepoints(twin: Twin) -> dict:
    """Minimum edge cut between untrusted entry points and crown jewels (max-flow / min-cut)."""
    g = _attack_digraph(twin)
    jewels = [j for j in crown_jewels(twin) if j in g]
    entries = [e for e in twin.entry_ids() if e in g]
    flow = g.copy()
    for e in entries:
        flow.add_edge("__SRC__", e, capacity=float("inf"))
    for j in jewels:
        flow.add_edge(j, "__SNK__", capacity=float("inf"))
    if not entries or not jewels:
        census = _census(g, entries, jewels)
        return {"cut": [], "before": census, "after": census, "paths_eliminated_pct": 0, "explanation": "No modelled path to crown jewels."}
    cut_value, (reachable, _) = nx.minimum_cut(flow, "__SRC__", "__SNK__")
    cut = []
    for u in reachable:
        for v in flow.successors(u):
            if v not in reachable and u != "__SRC__" and v != "__SNK__":
                d = flow[u][v]
                edge = twin.cyber_edges.get(d["edge_id"], {})
                if not d["cuttable"]:
                    action = f"segment:{twin.assets[v]['zone']}"
                elif d["kind"] == "reverse":
                    action = f"diode:{d['edge_id']}"  # keep the data flow, remove the way back
                else:
                    action = f"disable_path:{d['edge_id']}"
                cut.append({"edge_id": d["edge_id"], "source": u, "target": v, "protocol": d.get("protocol"),
                            "likelihood": d["likelihood"], "cuttable": d["cuttable"], "direction": d["kind"],
                            "purpose": edge.get("purpose", "Same-segment adjacency (needs micro-segmentation)"),
                            "policy": edge.get("policy"), "mitigation": action})
    before = _census(g, entries, jewels)
    pruned = g.copy()
    pruned.remove_edges_from([(c["source"], c["target"]) for c in cut])
    after = _census(pruned, entries, jewels)
    eliminated = 100 * (before["paths"] - after["paths"]) / before["paths"] if before["paths"] else 0
    return {
        "cut": sorted(cut, key=lambda c: -c["likelihood"]),
        "cut_value": cut_value,
        "before": before,
        "after": after,
        "paths_eliminated_pct": round(eliminated, 1),
        "explanation": (f"Removing these {len(cut)} connections severs {eliminated:.0f}% of modelled attack paths from "
                        f"untrusted networks to {len(jewels)} crown-jewel systems."),
    }


def _candidates(twin: Twin) -> list[str]:
    return [a["id"] for a in twin.assets.values()
            if a["type"] in {"substation", "transformer", "gateway", "scada", "rtu", "plc", "switch", "control_centre"}]


def spof(twin: Twin) -> list[dict]:
    """Assets whose loss alone pushes an essential service or zone off normal supply."""
    rows = []
    for node in _candidates(twin):
        a = twin.assets[node]
        result = cascade(twin, forced_lost={node}) if a["category"] == "physical" else cascade(twin, unavailable={node})
        m = consequence_metrics(twin, result)
        value = consequence_value(twin, result)
        severe = [f for f in m["facilities"] if f["state"] in {"lost", "on_backup"}] + [{"id": z} for z in m["zones_lost"]]
        if not severe and not m["zones_degraded"]:
            continue
        rows.append({
            "id": node, "name": a["name"], "type": a["type"], "is_spof": bool(severe),
            "citizens_without_power": m["citizens_without_power"], "essential_services": m["facilities"],
            "zones_lost": m["zones_lost"], "zones_degraded": m["zones_degraded"], "time_to_harm_hours": m["time_to_harm_hours"],
            "consequence": round(value["s_raw"] + value["d_raw"], 3),
            "suggestion": _suggest_alternative(twin, node, m),
        })
    return sorted(rows, key=lambda r: (-r["is_spof"], -r["consequence"]))


def _suggest_alternative(twin: Twin, node: str, metrics: dict) -> dict | None:
    """Propose a hypothetical backup feed for the most exposed downstream service."""
    victims = [f["id"] for f in metrics["facilities"] if f["state"] in {"lost", "on_backup"} and f["id"] != node] + metrics["zones_lost"]
    if not victims:
        return None
    victim = victims[0]
    v = twin.assets[victim]
    current = {e["source"] for e in twin.ops_in(victim)}
    best = None
    for t in twin.assets.values():
        if t["type"] != "transformer" or t["id"] in current or t["site"] == twin.assets[node].get("site") or t["criticality"] >= 5:
            continue
        d = (t["lat"] - v["lat"]) ** 2 + (t["lon"] - v["lon"]) ** 2
        if best is None or d < best[0]:
            best = (d, t["id"])
    if not best:
        return None
    return {"source": best[1], "target": victim, "label": f"Add backup feed {best[1]} → {victim}"}


def test_alternative(twin: Twin, source: str, target: str, node: str) -> dict:
    sandbox = twin.clone()
    eid = f"O-HYP-{source}-{target}"
    sandbox.ops_edges[eid] = {"id": eid, "relation": "supplies", "source": source, "target": target, "role": "backup",
                              "capacity": 0.5, "description": "Hypothetical backup feed (what-if)"}
    sandbox.touch()
    a = twin.assets[node]

    def run(t: Twin) -> dict:
        return consequence_metrics(t, cascade(t, forced_lost={node}) if a["category"] == "physical" else cascade(t, unavailable={node}))

    return {"edge": sandbox.ops_edges[eid], "before": run(twin), "after": run(sandbox)}


def drift(twin: Twin, events: list[dict]) -> dict:
    """Where the twin disagrees with reality: shadow connections, stale paths, inventory gaps."""
    shadow = []
    for e in observed_edges(twin, events):
        ev = next((x for x in events if x["id"] == e["event_id"]), {})
        crosses = twin.assets[e["source"]]["zone"] != twin.assets[e["target"]]["zone"]
        shadow.append({**e, "observed_at": ev.get("ts"), "severity": "high" if crosses else "medium", "crosses_zone": crosses,
                       "detail": ev.get("detail"),
                       "recommendation": "Investigate. If legitimate, add it to the model with an owner; otherwise block it."})
    stale = [{"id": e["id"], "source": e["source"], "target": e["target"], "protocol": e["protocol"], "purpose": e["purpose"],
              "last_observed_hours": e.get("last_observed_hours"),
              "recommendation": "Confirm the path is still required; remove it from firewall policy if not."}
             for e in twin.logical_edges() if (e.get("last_observed_hours") or 0) > 168]
    uncertain = []
    for aid in twin.cyber_ids():
        for sw in twin.assets[aid].get("software", []):
            if sw["version"].count(".") < 2 or sw["version"].endswith("x"):
                pot = [m["advisory_id"] for m in twin.matches().get(aid, []) if m["status"] == "potential"]
                uncertain.append({"id": aid, "software": f"{sw['vendor']} {sw['product']}", "recorded_version": sw["version"],
                                  "potential_matches": pot, "recommendation": "Collect the exact build from the device to resolve potential matches."})
    score = max(0, 100 - 12 * len(shadow) - 4 * len(stale) - 5 * len(uncertain))
    return {"fidelity_score": score, "shadow_connections": shadow, "stale_connections": stale, "inventory_uncertainty": uncertain}


def vendors(twin: Twin) -> list[dict]:
    """Supply-chain concentration: what a compromise of each vendor would expose."""
    risk = compute(twin)
    groups: dict[str, list[str]] = defaultdict(list)
    for aid in twin.cyber_ids():
        v = twin.assets[aid].get("vendor")
        if v:
            groups[v].append(aid)
    graph = traversal_graph(twin)
    rows = []
    for vendor, ids in groups.items():
        reach = best_paths(graph, ids, max_depth=2)
        reached = {n for n, r in reach.items() if r.likelihood >= 0.5}
        result = cascade(twin, compromised=reached, severity="high")
        m = consequence_metrics(twin, result)
        rows.append({
            "vendor": vendor, "assets": sorted(ids), "count": len(ids),
            "share_pct": round(100 * len(ids) / len(twin.cyber_ids()), 1),
            "avg_criticality": round(sum(twin.assets[i]["criticality"] for i in ids) / len(ids), 2),
            "open_vulnerabilities": sum(len(twin.open_matches(i)) for i in ids),
            "internet_facing": sum(1 for i in ids if twin.assets[i].get("internet_facing")),
            "remote_access": sum(1 for i in ids if twin.assets[i].get("remote_access") or twin.assets[i]["zone"] in UNTRUSTED_ZONES),
            "risk_mass": round(sum(risk["assets"][i]["score"] for i in ids), 1),
            "compromise_citizens": m["citizens_without_power"],
            "compromise_services": m["essential_services_affected"],
            "compromise_substations": m["substations_affected"],
        })
    return sorted(rows, key=lambda r: (-r["compromise_citizens"], -r["risk_mass"]))
