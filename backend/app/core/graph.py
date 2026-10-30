"""Graph intelligence: cyber reachability and operational consequence propagation.

Two different questions, two different graphs:

* *Cyber reachability* — if an attacker controls asset X, which other digital assets could
  they plausibly reach through configured communication paths? Each hop gets a likelihood
  based on protocol semantics, the target's weaknesses and the firewall policy. A path is a
  hypothesis for assessment, never proof that propagation would succeed.
* *Operational consequence* — if a controller is manipulated or a component is lost, which
  substations, zones and essential services lose supply, considering redundancy and backup
  power? Consequences are projected over hours as backup power runs out.
"""

from __future__ import annotations

import heapq
import math
import random
from dataclasses import dataclass, field

from .model import (
    AUTH_WEAKNESS,
    CONTROL_PROTOCOLS,
    MANAGEMENT_PROTOCOLS,
    MATCH_CONFIDENCE,
    Twin,
    attack_vector,
    clamp,
    exploit_score,
)

STATE_RANK = {"ok": 0, "impaired": 1, "degraded": 2, "on_backup": 3, "lost": 4}
POWER_RELATIONS = {"feeds", "supplies", "serves"}
ESSENTIAL_WEIGHT = {"hospital": 1.0, "water": 0.9, "telecom": 0.9, "rail": 0.8, "datacentre": 0.6, "control_centre": 1.0}
STATE_VALUE = {"ok": 0.0, "impaired": 0.08, "degraded": 0.35, "on_backup": 0.45, "lost": 1.0}


# =========================================================================== cyber


@dataclass(frozen=True)
class Hop:
    target: str
    likelihood: float
    edge_id: str
    kind: str  # forward | reverse | adjacent | observed | flat
    basis: str
    detection: float
    protocol: str


def exploitability(twin: Twin, asset_id: str, adjacent: bool) -> tuple[float, str]:
    """Chance an attacker with network access could take control of the asset, with the reason."""
    asset = twin.assets[asset_id]
    best, basis = 0.0, "no known weakness"
    for m in twin.open_matches(asset_id):
        adv = twin.advisories[m["advisory_id"]]
        av = attack_vector(adv)
        if av == "N" or (av == "A" and adjacent):
            score = adv["cvss"] / 10 * (0.45 + 0.55 * exploit_score(adv)) * MATCH_CONFIDENCE[m["status"]]
            if adv["kev"]:
                score *= 1.12
            if score > best:
                best, basis = score, f"{adv['id']} (AV:{av}, {adv['exploit_maturity']} exploit{', KEV' if adv['kev'] else ''})"
    cred = AUTH_WEAKNESS.get(asset.get("auth", "n/a"), 0.0) * 0.7
    if cred > best:
        best, basis = cred, f"{asset.get('auth')} authentication"
    return clamp(best), basis


def _detection(twin: Twin, target: str, monitored_edge: bool) -> float:
    return clamp(0.3 * twin.assets[target].get("monitoring", 0.0) + (0.12 if monitored_edge else 0.0), 0.0, 0.6)


def _edge_hop(twin: Twin, edge: dict, forward: bool) -> Hop | None:
    src, dst = (edge["source"], edge["target"]) if forward else (edge["target"], edge["source"])
    target, source = twin.assets.get(dst), twin.assets.get(src)
    if not target or target["category"] != "cyber" or not source:
        return None
    proto = edge["protocol"]
    natural = forward or edge["bidirectional"]
    if not natural and edge.get("one_way"):
        return None  # unidirectional gateway (data diode): nothing flows back to the initiator
    if natural and proto in CONTROL_PROTOCOLS and not edge["authenticated"]:
        likelihood, basis = 0.85, f"unauthenticated {proto} commands from {src}"
    elif natural:
        likelihood, basis = exploitability(twin, dst, adjacent=False)
        # Engineering hosts and remote-access appliances hold credentials or live sessions for the systems they manage.
        if source.get("type") in {"workstation", "remote_access"} and (proto in MANAGEMENT_PROTOCOLS or proto == "Engineering/TCP"):
            reuse = 0.25 if target.get("auth") == "strong" else 0.65
            if reuse > likelihood:
                likelihood, basis = reuse, f"credential or session reuse from {src} over {proto}"
    else:
        expl, b = exploitability(twin, dst, adjacent=False)
        likelihood, basis = expl * 0.5, f"reverse channel: {dst} initiates {proto}, attacker must exploit {b}"
    if edge["policy"] == "controlled":
        likelihood *= 0.45
        basis += " · constrained by controlled conduit"
    if likelihood <= 0.01:
        return None
    return Hop(dst, round(clamp(likelihood), 4), edge["id"], "forward" if natural else "reverse", basis,
               _detection(twin, dst, edge.get("monitored", False)), proto)


def traversal_graph(twin: Twin, mode: str = "configured", extra_edges: list[dict] | None = None) -> dict[str, list[Hop]]:
    """Adjacency list of candidate attacker hops.

    mode: configured (twin edges + same-segment adjacency), observed (also undocumented
    connections seen in events), flat (assume no segmentation between cyber assets).
    """
    key = ("traversal", mode, tuple(sorted(e["id"] for e in extra_edges or [])))
    if key in twin._cache:
        return twin._cache[key]
    graph: dict[str, list[Hop]] = {}
    edges = [e for e in twin.logical_edges() if e["status"] == "active"] + list(extra_edges or [])
    linked: set[tuple[str, str]] = set()
    for e in edges:
        if not (twin.is_operational(e["source"]) and twin.is_operational(e["target"])):
            continue
        for forward in (True, False):
            hop = _edge_hop(twin, e, forward)
            if hop:
                origin = e["source"] if forward else e["target"]
                graph.setdefault(origin, []).append(hop if e.get("kind") != "observed" else Hop(**{**hop.__dict__, "kind": "observed"}))
                linked.add((origin, hop.target))
    zones = twin.zone_members()
    pools: list[list[str]] = list(zones.values()) if mode != "flat" else [twin.cyber_ids()]
    for members in pools:
        live = [m for m in members if twin.is_operational(m) and twin.assets[m]["zone"] != "bench"]
        for u in live:
            for v in live:
                if u == v or (u, v) in linked:
                    continue
                expl, basis = exploitability(twin, v, adjacent=True)
                factor = 0.6 if mode != "flat" else 0.5
                if expl * factor > 0.02:
                    graph.setdefault(u, []).append(Hop(v, round(expl * factor, 4), f"ADJ:{u}>{v}", "adjacent" if mode != "flat" else "flat",
                                                      f"same network segment · {basis}", _detection(twin, v, False), "L2 adjacency"))
    twin._cache[key] = graph
    return graph


def observed_edges(twin: Twin, events: list[dict]) -> list[dict]:
    """Connections seen in network activity that the twin model does not contain (twin drift)."""
    modelled = {(e["source"], e["target"]) for e in twin.cyber_edges.values()}
    modelled |= {(e["target"], e["source"]) for e in twin.cyber_edges.values() if e.get("bidirectional")}
    seen: dict[tuple[str, str], dict] = {}
    for ev in events:
        src, dst = ev.get("source"), ev.get("destination")
        if ev.get("type") != "unexpected_comm" or not src or not dst or (src, dst) in modelled:
            continue
        if src not in twin.assets or dst not in twin.assets:
            continue
        seen[(src, dst)] = {
            "id": f"OBS:{src}>{dst}", "kind": "observed", "source": src, "target": dst, "protocol": (ev.get("protocol") or "TCP").split("/")[0],
            "port": None, "purpose": f"Observed in {ev['id']}", "policy": "allowed", "encrypted": False, "authenticated": False,
            "bidirectional": False, "status": "active", "monitored": False, "event_id": ev["id"],
        }
    return list(seen.values())


@dataclass
class Reach:
    likelihood: float
    hops: int
    parent: str | None
    via: str | None
    kind: str | None
    basis: str | None
    minutes: float


def best_paths(graph: dict[str, list[Hop]], sources: list[str], max_depth: int = 4) -> dict[str, Reach]:
    """Most likely path to every node within max_depth hops (product of hop likelihoods)."""
    best: dict[str, Reach] = {s: Reach(1.0, 0, None, None, None, "initial foothold", 0.0) for s in sources}
    frontier = {s: best[s] for s in sources}
    for depth in range(1, max_depth + 1):
        nxt: dict[str, Reach] = {}
        for u, ru in frontier.items():
            for hop in graph.get(u, []):
                lk = ru.likelihood * hop.likelihood
                if lk < 0.01:
                    continue
                cur = best.get(hop.target)
                if cur is None or lk > cur.likelihood + 1e-9:
                    r = Reach(lk, depth, u, hop.edge_id, hop.kind, hop.basis, ru.minutes + 3 + 7 * (1 - hop.likelihood))
                    best[hop.target] = r
                    nxt[hop.target] = r
        if not nxt:
            break
        frontier = nxt
    return best


def path_to(reach: dict[str, Reach], node: str) -> list[str]:
    path = [node]
    while reach[path[-1]].parent is not None:
        path.append(reach[path[-1]].parent)
    return list(reversed(path))


def entry_reachability(twin: Twin, mode: str = "configured") -> dict[str, Reach]:
    if ("entry_reach", mode) not in twin._cache:
        twin._cache[("entry_reach", mode)] = best_paths(traversal_graph(twin, mode), twin.entry_ids(), max_depth=6)
    return twin._cache[("entry_reach", mode)]


def monte_carlo_reach(graph: dict[str, list[Hop]], seeds: list[str], runs: int, max_depth: int, rng: random.Random) -> list[tuple[set[str], int]]:
    """Stochastic propagation: every hop succeeds with its likelihood and may be detected and contained."""
    out = []
    for _ in range(runs):
        reached = set(seeds)
        frontier = list(seeds)
        detections = 0
        for _depth in range(max_depth):
            nxt = []
            for u in frontier:
                for hop in graph.get(u, []):
                    if hop.target in reached or rng.random() >= hop.likelihood:
                        continue
                    if rng.random() < hop.detection:
                        detections += 1
                        continue
                    reached.add(hop.target)
                    nxt.append(hop.target)
            if not nxt:
                break
            frontier = nxt
        out.append((reached, detections))
    return out


# =========================================================================== operational


@dataclass
class Cascade:
    states: dict[str, dict] = field(default_factory=dict)  # node -> {state, cause}
    projection: list[dict] = field(default_factory=list)  # [{hours, node, state, cause}]

    def state(self, node: str) -> str:
        return self.states.get(node, {}).get("state", "ok")


def _set(states: dict, node: str, state: str, cause: str) -> bool:
    cur = states.get(node, {}).get("state", "ok")
    if STATE_RANK[state] > STATE_RANK[cur]:
        states[node] = {"state": state, "cause": cause}
        return True
    return False


def _power_pass(twin: Twin, states: dict, forced: set[str]) -> None:
    """Fixed-point propagation of supply loss through feeds, supplies and serves."""
    changed = True
    while changed:
        changed = False
        for node_id, node in twin.assets.items():
            if node_id in forced:
                continue
            inbound = [e for e in twin.ops_in(node_id) if e["relation"] in POWER_RELATIONS]
            if not inbound:
                continue
            prim = [e for e in inbound if e["role"] == "primary"]
            back = [e for e in inbound if e["role"] == "backup"]
            if not prim:
                prim, back = back, []

            def supplying(e: dict) -> str:
                s = states.get(e["source"], {}).get("state", "ok")
                return "lost" if s in {"lost", "on_backup"} else ("degraded" if s == "degraded" else "ok")

            p_states = [supplying(e) for e in prim]
            b_states = [supplying(e) for e in back]
            if "ok" in p_states:
                continue
            if "degraded" in p_states:
                changed |= _set(states, node_id, "degraded", "upstream supply degraded")
            elif any(s != "lost" for s in b_states):
                src = next(e["source"] for e, s in zip(back, b_states) if s != "lost")
                changed |= _set(states, node_id, "degraded", f"running on backup supply from {src}")
            elif node.get("backup_hours", 0) > 0:
                changed |= _set(states, node_id, "on_backup", f"grid supply lost, on {node['backup_hours']}h backup power")
            else:
                lost_from = ", ".join(e["source"] for e in prim) or "upstream"
                changed |= _set(states, node_id, "lost", f"supply lost from {lost_from}")


def _cross_sector(twin: Twin, states: dict, hours: float, projection: list[dict] | None) -> list[str]:
    """Apply water and telecom dependencies. Returns nodes newly affected."""
    touched = []
    for e in twin.ops_edges.values():
        if e["relation"] not in {"water", "comms"}:
            continue
        if states.get(e["source"], {}).get("state") != "lost":
            continue
        dst = e["target"]
        if e["relation"] == "water":
            cause = f"water supply from {e['source']} interrupted"
            if _set(states, dst, "degraded", cause):
                touched.append(dst)
                if projection is not None and hours > 0:
                    projection.append({"hours": hours, "node": dst, "state": "degraded", "cause": cause})
        else:
            cause = f"communications via {e['source']} lost"
            if dst == "CC-001":
                # The control centre loses its wide-area link: operators go blind on every substation without backup telemetry.
                for sub in [a for a in twin.assets.values() if a["type"] == "substation"]:
                    backups = [t for t in twin.ops_in(sub["id"]) if t["relation"] == "telemetry" and t["role"] == "backup"
                               and states.get(t["source"], {}).get("state", "ok") == "ok" and twin.is_operational(t["source"])]
                    if not backups and _set(states, sub["id"], "impaired", "loss of view: SCADA WAN carrier down"):
                        touched.append(sub["id"])
                        if projection is not None and hours > 0:
                            projection.append({"hours": hours, "node": sub["id"], "state": "impaired", "cause": "loss of view: SCADA WAN carrier down"})
            elif _set(states, dst, "degraded", cause):
                touched.append(dst)
                if projection is not None and hours > 0:
                    projection.append({"hours": hours, "node": dst, "state": "degraded", "cause": cause})
    return touched


def cascade(
    twin: Twin,
    compromised: set[str] | frozenset[str] = frozenset(),
    severity: str = "high",
    unavailable: set[str] | frozenset[str] = frozenset(),
    forced_lost: set[str] | frozenset[str] = frozenset(),
    horizon_hours: float = 36.0,
) -> Cascade:
    states: dict[str, dict] = {}
    forced: set[str] = set()
    for c in set(compromised) | set(unavailable):
        hostile = c in compromised
        for e in twin.ops_out(c):
            dst = e["target"]
            if e["relation"] == "controls":
                if hostile and severity == "high":
                    _set(states, dst, "lost", f"manipulation of control via {c} (breakers opened)")
                    forced.add(dst)
                elif hostile and severity == "medium":
                    _set(states, dst, "impaired", f"loss of control via {c}")
                else:
                    _set(states, dst, "impaired", f"loss of {'view' if hostile else 'control'} via {c}")
            elif e["relation"] == "telemetry":
                others = [t for t in twin.ops_in(dst) if t["relation"] == "telemetry" and t["source"] != c
                          and t["source"] not in compromised and t["source"] not in unavailable and twin.is_operational(t["source"])]
                if not others:
                    _set(states, dst, "impaired", f"loss of view: telemetry path {c} {'compromised' if hostile else 'unavailable'}")
    for n in forced_lost:
        _set(states, n, "lost", "component removed for analysis")
        forced.add(n)
    _power_pass(twin, states, forced)
    projection: list[dict] = []
    _cross_sector(twin, states, 0.0, None)

    # Project backup exhaustion over time; each expiry can trigger a second wave.
    queue = [(twin.assets[n]["backup_hours"], n) for n, s in states.items() if s["state"] == "on_backup"]
    heapq.heapify(queue)
    timeline_states = {k: dict(v) for k, v in states.items()}
    while queue:
        hours, node = heapq.heappop(queue)
        if hours > horizon_hours:
            break
        if timeline_states.get(node, {}).get("state") != "on_backup":
            continue
        timeline_states[node] = {"state": "lost", "cause": f"backup power exhausted after {hours:g}h"}
        projection.append({"hours": hours, "node": node, "state": "lost", "cause": f"backup power exhausted after {hours:g}h"})
        if node == "CC-001":
            for hosted in [e["target"] for e in twin.ops_out("CC-001") if e["relation"] == "hosts"]:
                projection.append({"hours": hours, "node": hosted, "state": "lost", "cause": "control centre power lost"})
        before = set(timeline_states)
        _cross_sector(twin, timeline_states, hours, projection)
        for n in set(timeline_states) - before:
            if timeline_states[n]["state"] == "on_backup":
                heapq.heappush(queue, (hours + twin.assets[n]["backup_hours"], n))
    projection.sort(key=lambda p: p["hours"])
    return Cascade(states, projection)


def consequence_value(twin: Twin, result: Cascade) -> dict:
    """Service (S) and dependency (D) value of a cascade, with per-node contributions for explanations.

    Immediate effects count fully; consequences projected hours ahead (backup exhaustion) are
    discounted because operators have time to respond before they materialise.
    """
    s_contrib: dict[str, float] = {}
    d_contrib: dict[str, float] = {}
    for node_id, st in result.states.items():
        node = twin.assets[node_id]
        w = STATE_VALUE[st["state"]]
        if node["type"] == "zone":
            s_contrib[node_id] = node["population"] / 1_000_000 * w
        elif node["type"] in {"facility", "control_centre"}:
            s_contrib[node_id] = ESSENTIAL_WEIGHT.get(node.get("facility_type") or node["type"], 0.6) * w
        elif node["category"] == "physical":
            d_contrib[node_id] = node["criticality"] / 5 * w * 0.5
    for p in result.projection:
        node = twin.assets[p["node"]]
        if p["state"] != "lost" or node["category"] not in {"service", "physical"}:
            continue
        discount = 1 / (1 + p["hours"] / 6)
        base = ESSENTIAL_WEIGHT.get(node.get("facility_type") or node["type"], 0.4)
        s_contrib[f"{p['node']}@{p['hours']:g}h"] = base * (1.0 - STATE_VALUE["on_backup"]) * discount
    return {"s_raw": sum(s_contrib.values()), "d_raw": sum(d_contrib.values()), "s_contrib": s_contrib, "d_contrib": d_contrib}


def consequence_metrics(twin: Twin, result: Cascade) -> dict:
    zones_lost = [n for n, s in result.states.items() if twin.assets[n]["type"] == "zone" and s["state"] == "lost"]
    zones_degraded = [n for n, s in result.states.items() if twin.assets[n]["type"] == "zone" and s["state"] == "degraded"]
    pop = sum(twin.assets[z]["population"] for z in zones_lost) + 0.35 * sum(twin.assets[z]["population"] for z in zones_degraded)
    facilities = []
    for n, s in result.states.items():
        a = twin.assets[n]
        if a["type"] in {"facility", "control_centre"} and s["state"] != "ok":
            exhaustion = next((p["hours"] for p in result.projection if p["node"] == n and p["state"] == "lost"), None)
            facilities.append({
                "id": n, "name": a["name"], "type": a.get("facility_type", a["type"]), "state": s["state"], "cause": s["cause"],
                "backup_hours": a.get("backup_hours"), "time_to_harm_hours": exhaustion if s["state"] == "on_backup" else (0 if s["state"] == "lost" else None),
                "population": a.get("population"), "beds": a.get("beds"),
            })
    on_backup = [f for f in facilities if f["state"] == "on_backup"]
    water = sum(f["population"] or 0 for f in facilities if f["type"] == "water")
    return {
        "citizens_without_power": int(pop),
        "zones_lost": zones_lost,
        "zones_degraded": zones_degraded,
        "essential_services_affected": len(facilities),
        "facilities": sorted(facilities, key=lambda f: (f["time_to_harm_hours"] is None, f["time_to_harm_hours"] or 0)),
        "hospitals_affected": len([f for f in facilities if f["type"] == "hospital"]),
        "hospital_beds_at_risk": sum(f["beds"] or 0 for f in facilities if f["type"] == "hospital"),
        "water_population_at_risk": water,
        "time_to_harm_hours": min((f["time_to_harm_hours"] for f in on_backup if f["time_to_harm_hours"] is not None), default=None),
        "substations_affected": len([n for n in result.states if twin.assets[n]["type"] == "substation"]),
    }
