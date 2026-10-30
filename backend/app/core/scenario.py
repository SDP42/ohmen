"""Scenario Lab: hypothetical incidents run against a sandbox copy of the twin.

The baseline twin is never modified. Results keep three things visibly distinct:
observed evidence, hypothetical attack paths (potential reachability) and potential
operational consequences. Deterministic runs repeat exactly for the same inputs; the
optional Monte Carlo mode samples hop success and detection to express uncertainty.
"""

from __future__ import annotations

import hashlib
import json
import math
import random
import statistics
from collections import Counter

from . import mitigation
from .graph import (
    best_paths,
    cascade,
    consequence_metrics,
    consequence_value,
    monte_carlo_reach,
    observed_edges,
    path_to,
    traversal_graph,
)
from .model import Twin
from .risk import compute, controller_effect

TEMPLATES = [
    {"id": "exploitation", "name": "Vulnerability exploitation", "description": "Hypothetical compromise of a vulnerable asset and the paths it opens.",
     "defaults": {"asset": "GW-001", "severity": "high"}},
    {"id": "unavailability", "name": "Asset unavailability", "description": "A gateway, server or controller stops responding. What do operators lose?",
     "defaults": {"asset": "GW-004", "severity": "medium"}},
    {"id": "isolation", "name": "Network isolation", "description": "Loss of communication between a substation segment and the control centre.",
     "defaults": {"zone": "sub-a", "severity": "medium"}},
    {"id": "suspicious_access", "name": "Suspicious access", "description": "Unusual access activity triggers an investigation of what that foothold could reach.",
     "defaults": {"asset": "ENG-002", "severity": "low"}},
    {"id": "vendor_compromise", "name": "Vendor compromise", "description": "A supplier's firmware or support channel is compromised. Every asset from that vendor becomes a foothold.",
     "defaults": {"vendor": "Voltara Systems", "severity": "high"}},
]
SEVERITY_THRESHOLD = {"low": 0.5, "medium": 0.32, "high": 0.2}

ATTCK = {
    "T0883": ("Initial Access", "Internet Accessible Device"),
    "T0822": ("Initial Access", "External Remote Services"),
    "T0866": ("Initial Access", "Exploitation of Remote Services"),
    "T0862": ("Initial Access", "Supply Chain Compromise"),
    "T0859": ("Initial Access", "Valid Accounts"),
    "T0812": ("Lateral Movement", "Default Credentials"),
    "T0846": ("Discovery", "Remote System Discovery"),
    "T0840": ("Discovery", "Network Connection Enumeration"),
    "T0886": ("Lateral Movement", "Remote Services"),
    "T0843": ("Lateral Movement", "Program Download"),
    "T0869": ("Command and Control", "Standard Application Layer Protocol"),
    "T0878": ("Inhibit Response Function", "Alarm Suppression"),
    "T0814": ("Inhibit Response Function", "Denial of Service"),
    "T0855": ("Impair Process Control", "Unauthorized Command Message"),
    "T0836": ("Impair Process Control", "Modify Parameter"),
    "T0831": ("Impact", "Manipulation of Control"),
    "T0826": ("Impact", "Loss of Availability"),
    "T0827": ("Impact", "Loss of Control"),
    "T0829": ("Impact", "Loss of View"),
}


def normalise(cfg: dict) -> dict:
    kind = cfg.get("type", "exploitation")
    if kind not in {t["id"] for t in TEMPLATES}:
        raise ValueError(f"Unknown scenario type '{kind}'")
    defaults = next(t["defaults"] for t in TEMPLATES if t["id"] == kind)
    out = {
        "type": kind,
        "asset": cfg.get("asset") or defaults.get("asset"),
        "vendor": cfg.get("vendor") or defaults.get("vendor"),
        "zone": cfg.get("zone") or defaults.get("zone"),
        "severity": cfg.get("severity") or defaults.get("severity", "high"),
        "reachability": cfg.get("reachability", "configured"),
        "depth": max(1, min(int(cfg.get("depth", 4)), 6)),
        "mitigations": list(cfg.get("mitigations") or []),
        "runs": max(50, min(int(cfg.get("runs", 600)), 3000)),
        "seed": int(cfg.get("seed", 7)),
    }
    if out["severity"] not in SEVERITY_THRESHOLD:
        raise ValueError("severity must be low, medium or high")
    if out["reachability"] not in {"configured", "observed", "flat"}:
        raise ValueError("reachability must be configured, observed or flat")
    return out


def scenario_id(cfg: dict) -> str:
    return "SCN-" + hashlib.sha1(json.dumps(cfg, sort_keys=True).encode()).hexdigest()[:8].upper()


def _seeds(twin: Twin, cfg: dict) -> list[str]:
    if cfg["type"] == "vendor_compromise":
        seeds = [a["id"] for a in twin.assets.values() if a["category"] == "cyber" and a.get("vendor") == cfg["vendor"]]
        if not seeds:
            raise ValueError(f"No assets from vendor '{cfg['vendor']}'")
        return seeds
    if cfg["type"] == "isolation":
        return [a["id"] for a in twin.assets.values() if a.get("zone") == cfg["zone"] and a["type"] in {"gateway"}]
    if cfg["asset"] not in twin.assets or twin.assets[cfg["asset"]]["category"] != "cyber":
        raise ValueError(f"'{cfg['asset']}' is not a cyber asset")
    return [cfg["asset"]]


def _attck(twin: Twin, cfg: dict, seeds: list[str], reach: dict, graph: dict, result_cascade, used_hops: list) -> list[dict]:
    rows: dict[str, dict] = {}

    def add(tid: str, stage: str, evidence: list[str], t: float) -> None:
        tactic, name = ATTCK[tid]
        if tid in rows:
            rows[tid]["evidence"] = sorted(set(rows[tid]["evidence"]) | set(evidence))
            rows[tid]["t"] = min(rows[tid]["t"], t)
        else:
            rows[tid] = {"technique_id": tid, "technique": name, "tactic": tactic, "stage": stage, "evidence": evidence, "t": t}

    if cfg["type"] in {"unavailability", "isolation"}:
        add("T0829", "impact", seeds, 6)
        if any(twin.advisories[m["advisory_id"]]["cwe"] == "CWE-20" for s in seeds for m in twin.open_matches(s)):
            add("T0814", "impact", seeds, 5)
    else:
        for s in seeds:
            a = twin.assets[s]
            if cfg["type"] == "vendor_compromise":
                add("T0862", "initial", [s], 5)
            elif cfg["type"] == "suspicious_access":
                add("T0859", "initial", [s], 5)
            else:
                if a.get("internet_facing"):
                    add("T0883", "initial", [s], 5)
                if a.get("remote_access"):
                    add("T0822", "initial", [s], 5)
                if a.get("auth") == "default":
                    add("T0812", "initial", [s], 5)
                if any(twin.advisories[m["advisory_id"]]["cvss_vector"].find("AV:N") >= 0 for m in twin.open_matches(s)):
                    add("T0866", "initial", [s], 5)
        if len(reach) > len(seeds):
            add("T0846", "analysis", [n for n in reach if n not in seeds][:6], 8)
        for hop, t in used_hops:
            if hop.kind == "adjacent":
                add("T0840", "analysis", [hop.target], t)
            if hop.protocol in {"SSH", "RDP"} or "reuse" in hop.basis:
                add("T0886", "analysis", [hop.target], t)
            if hop.basis.startswith("SIM-"):
                add("T0866", "analysis", [hop.target], t)
            if "default" in hop.basis:
                add("T0812", "analysis", [hop.target], t)
            if hop.protocol == "Engineering/TCP" and twin.assets[hop.target]["type"] == "plc":
                add("T0843", "analysis", [hop.target], t)
            if hop.protocol in {"DNP3", "Modbus/TCP", "IEC 60870-5-104", "IEC 61850 MMS"} and twin.assets[hop.target]["type"] in {"rtu", "plc"}:
                add("T0855", "impact", [hop.target], t + 1)
        if len(reach) > len(seeds):
            add("T0869", "analysis", seeds, 9)
        if any(twin.assets[n]["type"] == "scada" for n in reach):
            add("T0878", "analysis", [n for n in reach if twin.assets[n]["type"] == "scada"], 12)
        if any(twin.assets[n]["type"] == "plc" for n in reach):
            add("T0836", "impact", [n for n in reach if twin.assets[n]["type"] == "plc"], 14)
    states = result_cascade.states
    lost = [n for n, s in states.items() if s["state"] == "lost" and twin.assets[n]["category"] == "physical"]
    impaired = [n for n, s in states.items() if s["state"] == "impaired"]
    if lost:
        add("T0831", "impact", lost, 15)
        add("T0826", "impact", lost, 16)
    if impaired:
        add("T0827" if cfg["severity"] == "medium" else "T0829", "impact", impaired, 15)
    order = ["Initial Access", "Discovery", "Lateral Movement", "Command and Control", "Inhibit Response Function", "Impair Process Control", "Impact"]
    return sorted(rows.values(), key=lambda r: (order.index(r["tactic"]), r["t"]))


def _ops_depths(twin: Twin, sources: list[str]) -> dict[str, int]:
    depth = {s: 0 for s in sources}
    frontier = list(sources)
    while frontier:
        nxt = []
        for u in frontier:
            for e in twin.ops_out(u):
                if e["target"] not in depth:
                    depth[e["target"]] = depth[u] + 1
                    nxt.append(e["target"])
        frontier = nxt
    return depth


def run(twin: Twin, config: dict, events: list[dict] | None = None, monte_carlo: bool = True) -> dict:
    cfg = normalise(config)
    sandbox = twin.clone()
    applied = mitigation.apply_all(sandbox, cfg["mitigations"])
    seeds = _seeds(sandbox, cfg)
    extra = observed_edges(sandbox, events or []) if cfg["reachability"] == "observed" else []
    graph = traversal_graph(sandbox, "flat" if cfg["reachability"] == "flat" else "configured", extra_edges=extra)
    hostile = cfg["type"] not in {"unavailability", "isolation"}
    threshold = SEVERITY_THRESHOLD[cfg["severity"]]

    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    used_hops: list = []
    reach_all = best_paths(graph, [s for s in seeds if sandbox.is_operational(s)], max_depth=cfg["depth"]) if hostile else {}
    reach = {n: r for n, r in reach_all.items() if r.likelihood >= threshold or n in seeds}
    for s in seeds:
        evidence = sandbox.activity_level(s)
        nodes[s] = {"id": s, "classification": "observed" if evidence else "initial", "t": 5.0, "hop": 0, "likelihood": 1.0,
                    "label": "Observed evidence" if evidence else ("Unavailable" if not hostile else "Hypothetical initial foothold"),
                    "evidence": evidence}
    for n, r in sorted(reach.items(), key=lambda kv: kv[1].minutes):
        if n in seeds:
            continue
        t = round(5 + r.minutes, 1)
        nodes[n] = {"id": n, "classification": "reachable", "t": t, "hop": r.hops, "likelihood": round(r.likelihood, 3),
                    "label": "Potentially reachable (hypothesis)", "basis": r.basis, "path": path_to(reach, n),
                    "evidence": sandbox.activity_level(n)}
        hop = next((h for h in graph.get(r.parent, []) if h.edge_id == r.via), None)
        if hop:
            used_hops.append((hop, t))
        edges.append({"id": r.via, "source": r.parent, "target": n, "t": t, "kind": r.kind, "likelihood": round(r.likelihood, 3),
                      "basis": r.basis, "protocol": hop.protocol if hop else None})

    compromised = set(reach) if hostile else set()
    unavailable = set(seeds) if not hostile else set()
    result = cascade(sandbox, compromised=compromised, severity=cfg["severity"], unavailable=unavailable)
    controllers = [n for n in (compromised | unavailable) if controller_effect(sandbox, n, cfg["severity"])]
    depth = _ops_depths(sandbox, controllers)
    t_ctrl = max((nodes[c]["t"] for c in controllers if c in nodes), default=10.0)
    for n, st in result.states.items():
        src_t = min((nodes[c]["t"] for c in controllers if c in nodes and n in controller_effect(sandbox, c, cfg["severity"]).cascade.states), default=t_ctrl)
        nodes[n] = {"id": n, "classification": "consequence", "t": round(src_t + 2 + 1.5 * depth.get(n, 1), 1), "state": st["state"],
                    "cause": st["cause"], "label": "Potential operational consequence"}

    metrics = consequence_metrics(sandbox, result)
    value = consequence_value(sandbox, result)
    attck = _attck(sandbox, cfg, seeds, reach, graph, result, used_hops)
    max_t = max((n["t"] for n in nodes.values()), default=20)
    stages = [
        {"id": "normal", "t": 0, "label": "Normal operation", "detail": "All assets in their baseline state."},
        {"id": "initial", "t": 5, "label": "Alert / initial foothold" if hostile else "Asset unavailable",
         "detail": ", ".join(seeds)},
    ]
    if hostile and len(reach) > len(seeds):
        stages.append({"id": "analysis", "t": 10, "label": "Reachability analysis",
                       "detail": f"{len(reach) - len(seeds)} digital assets potentially reachable over configured paths"})
    if result.states:
        stages.append({"id": "impact", "t": round(min(n["t"] for n in nodes.values() if n["classification"] == "consequence"), 1),
                       "label": "Impact assessment", "detail": f"{len(result.states)} operational assets potentially affected"})

    out = {
        "id": scenario_id(cfg),
        "config": cfg,
        "seeds": seeds,
        "assumptions": _assumptions(cfg, threshold),
        "nodes": nodes,
        "edges": edges,
        "stages": stages,
        "duration_minutes": max(30, math.ceil(max_t / 5) * 5),
        "attck": attck,
        "projection": result.projection,
        "impact": {
            **metrics,
            "digital_assets_reachable": len([n for n in nodes.values() if n["classification"] == "reachable"]),
            "operational_assets_affected": len(result.states),
            "highest_criticality": max((sandbox.assets[n]["criticality"] for n in result.states), default=0),
            "systemic_impact_score": round(100 * (1 - math.exp(-(value["s_raw"] + value["d_raw"]) / 1.6)), 1),
        },
        "mitigations_applied": applied,
        "risk_after": compute(sandbox)["systemic_risk_index"],
        "risk_baseline": compute(twin)["systemic_risk_index"],
    }
    base_risk, sand_risk = compute(twin), compute(sandbox)
    cyber_seeds = [s for s in seeds if s in base_risk["assets"]]
    if cyber_seeds:
        p_before = max(base_risk["assets"][s]["likelihood"] for s in cyber_seeds)
        p_after = max(sand_risk["assets"][s]["likelihood"] for s in cyber_seeds)
        out["foothold_likelihood"] = {"before": round(p_before, 4), "after": round(p_after, 4)}
        out["expected_impact"] = round(out["impact"]["systemic_impact_score"] * p_after, 1)
    if applied:
        base_cfg = {**cfg, "mitigations": []}
        base = run(twin, base_cfg, events, monte_carlo=False)
        before_nodes = set(base["nodes"])
        out["contained"] = sorted(before_nodes - set(nodes))
        out["baseline_impact"] = base["impact"]
        mitigation_t = max_t + 3
        out["stages"].append({"id": "mitigation", "t": round(mitigation_t, 1), "label": "Mitigation applied",
                              "detail": f"{len(out['contained'])} assets no longer reachable or affected"})
        out["duration_minutes"] = max(out["duration_minutes"], math.ceil((mitigation_t + 2) / 5) * 5)
    if monte_carlo and hostile:
        out["monte_carlo"] = _monte_carlo(sandbox, graph, seeds, cfg)
    return out


def _assumptions(cfg: dict, threshold: float) -> list[str]:
    rows = [
        "Simulated, synthetic environment. No live infrastructure is contacted or modelled exactly.",
        f"Attack paths include hops with modelled likelihood ≥ {threshold:.0%} within {cfg['depth']} steps. They are candidate paths for assessment, not guaranteed propagation.",
        "Operational dependencies are evaluated separately from cyber reachability: a facility depending on power does not make its own systems reachable.",
    ]
    if cfg["reachability"] == "observed":
        rows.append("Undocumented connections observed in network activity are treated as usable paths.")
    if cfg["reachability"] == "flat":
        rows.append("Worst case: segmentation is assumed ineffective between all cyber assets.")
    if cfg["severity"] == "high":
        rows.append("High severity assumes an attacker able to issue control commands (e.g. open breakers).")
    elif cfg["severity"] == "medium":
        rows.append("Medium severity assumes loss of control and view, without deliberate manipulation.")
    else:
        rows.append("Low severity assumes monitoring-level access only.")
    return rows


def _histogram(values: list[int], bins: int = 12) -> list[dict]:
    if not values:
        return []
    hi = max(values) or 1
    width = max(1, math.ceil(hi / bins))
    counts = Counter(min(v // width, bins - 1) for v in values)
    return [{"start": i * width, "end": (i + 1) * width, "count": counts.get(i, 0)} for i in range(bins)]


def _pct(values: list[float], q: float) -> float:
    if not values:
        return 0
    s = sorted(values)
    return s[min(len(s) - 1, int(q * (len(s) - 1) + 0.5))]


def _monte_carlo(twin: Twin, graph: dict, seeds: list[str], cfg: dict) -> dict:
    rng = random.Random(cfg["seed"])
    sims = monte_carlo_reach(graph, seeds, cfg["runs"], cfg["depth"], rng)
    memo: dict[frozenset, dict] = {}
    counts: Counter = Counter()
    citizens, digital, ttharm = [], [], []
    hospital_runs = service_runs = detected = 0
    for reached, detections in sims:
        counts.update(n for n in reached if n not in seeds)
        digital.append(len(reached) - len(seeds))
        detected += detections > 0
        key = frozenset(n for n in reached if controller_effect(twin, n, cfg["severity"]))
        if key not in memo:
            memo[key] = consequence_metrics(twin, cascade(twin, compromised=set(key), severity=cfg["severity"]))
        m = memo[key]
        citizens.append(m["citizens_without_power"])
        hospital_runs += m["hospitals_affected"] > 0
        service_runs += m["essential_services_affected"] > 0
        if m["time_to_harm_hours"] is not None:
            ttharm.append(m["time_to_harm_hours"])
    runs = cfg["runs"]
    return {
        "runs": runs,
        "seed": cfg["seed"],
        "reach_probability": [{"id": n, "name": twin.assets[n]["name"], "probability": round(c / runs, 3)} for n, c in counts.most_common(24)],
        "citizens": {"p10": _pct(citizens, 0.1), "p50": _pct(citizens, 0.5), "p90": _pct(citizens, 0.9),
                     "mean": int(statistics.fmean(citizens)) if citizens else 0, "histogram": _histogram(citizens)},
        "expected_digital_assets": round(statistics.fmean(digital), 2) if digital else 0,
        "p_hospital_impact": round(hospital_runs / runs, 3),
        "p_any_service_impact": round(service_runs / runs, 3),
        "p_detected": round(detected / runs, 3),
        "time_to_harm_p50": _pct(ttharm, 0.5) if ttharm else None,
    }


def compare(twin: Twin, a: dict, b: dict, events: list[dict] | None = None) -> dict:
    ra, rb = run(twin, a, events, monte_carlo=False), run(twin, b, events, monte_carlo=False)

    def summary(r: dict) -> dict:
        imp = r["impact"]
        top = max((twin.assets[n]["criticality"], n) for n in r["nodes"]) if r["nodes"] else (0, None)
        return {
            "id": r["id"], "config": r["config"],
            "digital_assets_reachable": imp["digital_assets_reachable"],
            "operational_assets_affected": imp["operational_assets_affected"],
            "citizens_without_power": imp["citizens_without_power"],
            "essential_services_affected": imp["essential_services_affected"],
            "hospitals_affected": imp["hospitals_affected"],
            "time_to_harm_hours": imp["time_to_harm_hours"],
            "highest_criticality_asset": top[1],
            "systemic_impact_score": imp["systemic_impact_score"],
            "redundancy_available": len(imp["zones_degraded"]) > 0,
        }

    sa, sb = summary(ra), summary(rb)
    worse = "A" if sa["systemic_impact_score"] >= sb["systemic_impact_score"] else "B"
    return {"a": sa, "b": sb, "higher_priority": worse,
            "recommendation": f"Scenario {worse} carries the larger modelled consequence. Prioritise its preventive controls first."}
