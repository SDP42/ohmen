"""Explainable, consequence-aware cyber-risk engine.

For every cyber asset the engine produces three results that are never collapsed into one
unexplained number:

A. Vulnerability priority — how urgently the security weakness needs investigation.
B. Asset cyber-risk (P) — modelled likelihood of compromise from vulnerability, exposure,
   attack-path reachability, observed activity, authentication and monitoring.
C. Systemic impact (I) — the expected operational consequence if the asset were
   compromised: every downstream service is weighted by the likelihood of the attack path
   that reaches the controller affecting it.

The composite priority is 100·√(P·I), a geometric mean, so an asset needs both likelihood
and consequence to rank high. CVSS alone measures severity, not consequence.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .graph import (
    Cascade,
    best_paths,
    cascade,
    consequence_metrics,
    consequence_value,
    entry_reachability,
    path_to,
    traversal_graph,
)
from .model import (
    ACTIVITY_SCORE,
    AUTH_WEAKNESS,
    CRITICALITY_LABEL,
    EXPLOIT_SCORE,
    EXPOSURE_SCORE,
    MATCH_CONFIDENCE,
    REDUNDANCY_FACTOR,
    UNTRUSTED_ZONES,
    Twin,
    attack_vector,
    clamp,
    exploit_score,
)

DEFAULT_WEIGHTS: dict[str, float] = {
    "vulnerability": 1.0,
    "known_exploitation": 1.0,
    "exposure": 1.0,
    "reachability": 1.0,
    "activity": 1.0,
    "criticality": 1.0,
    "redundancy": 1.0,
}
NOW_THRESHOLD = 70
NEXT_THRESHOLD = 38
AV_FACTOR = {"N": 1.0, "A": 0.85, "L": 0.7, "P": 0.5}


def sigmoid(z: float) -> float:
    return 1 / (1 + math.exp(-z))


def rating(x: float) -> str:
    return "Low" if x < 0.2 else "Medium" if x < 0.45 else "High" if x < 0.7 else "Critical"


def priority_band(score: float) -> str:
    return "NOW" if score >= NOW_THRESHOLD else "NEXT" if score >= NEXT_THRESHOLD else "MONITOR"


@dataclass
class ControllerEffect:
    cascade: Cascade
    value: dict


def controller_effect(twin: Twin, node: str, severity: str = "high") -> ControllerEffect | None:
    """Consequences of a single asset being manipulated, cached per twin version."""
    cache = twin._cache.setdefault(("effects", severity), {})
    if node not in cache:
        if not any(e["relation"] in {"controls", "telemetry"} for e in twin.ops_out(node)):
            cache[node] = None
        else:
            result = cascade(twin, compromised={node}, severity=severity)
            cache[node] = ControllerEffect(result, consequence_value(twin, result))
    return cache[node]


def _vulnerability_factor(twin: Twin, asset_id: str, w_ke: float) -> tuple[float, dict | None]:
    best, best_row = 0.0, None
    for m in twin.open_matches(asset_id):
        adv = twin.advisories[m["advisory_id"]]
        exploit = min(1.0, exploit_score(adv) * w_ke)
        v = adv["cvss"] / 10 * (0.5 + 0.5 * exploit) * MATCH_CONFIDENCE[m["status"]] * AV_FACTOR[attack_vector(adv)]
        if adv["kev"]:
            v *= 1 + 0.12 * w_ke
        if v > best:
            best, best_row = v, {"advisory": adv, "match": m}
    return clamp(best), best_row


def _exposure(twin: Twin, asset: dict) -> tuple[float, list[dict]]:
    e = EXPOSURE_SCORE.get(asset.get("exposure", "internal"), 0.3)
    inbound = [edge for edge in twin.logical_edges()
               if edge["target"] == asset["id"] and edge["status"] == "active"
               and twin.assets.get(edge["source"], {}).get("zone") in UNTRUSTED_ZONES]
    if inbound:
        e = max(e, 0.75)
    if asset.get("internet_facing"):
        e = max(e, 1.0)
    return e, inbound


def compute(twin: Twin, weights: dict | None = None) -> dict:
    """Score every cyber asset. Cached per twin version and weight set."""
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    key = ("risk", tuple(sorted(w.items())))
    if key in twin._cache:
        return twin._cache[key]

    graph = traversal_graph(twin)
    entry = entry_reachability(twin)
    assets: dict[str, dict] = {}
    for asset_id in twin.cyber_ids():
        a = twin.assets[asset_id]
        V, top = _vulnerability_factor(twin, asset_id, w["known_exploitation"])
        E, inbound = _exposure(twin, a)
        reach = entry.get(asset_id)
        A = reach.likelihood if reach else 0.0
        level = twin.activity_level(asset_id)
        S_act = ACTIVITY_SCORE.get(level, 0.0)
        W = AUTH_WEAKNESS.get(a.get("auth", "n/a"), 0.0)
        M = a.get("monitoring", 0.0)
        if not twin.is_operational(asset_id):
            A, E = A * 0.2, E * 0.2
        terms = {
            "vulnerability": 2.4 * w["vulnerability"] * V,
            "exposure": 1.4 * w["exposure"] * E,
            "reachability": 1.6 * w["reachability"] * A,
            "activity": 2.0 * w["activity"] * S_act,
            "authentication": 0.9 * W,
            "monitoring": -1.3 * M,
        }
        P = sigmoid(-3.0 + sum(terms.values()))

        # Systemic impact: expected consequence over the asset's plausible blast radius.
        blast = best_paths(graph, [asset_id], max_depth=4)
        s_vals: dict[str, float] = {}
        d_vals: dict[str, float] = {}
        drivers: dict[str, str] = {}
        cyber_term = 0.0
        for node, r in blast.items():
            if node != asset_id:
                cyber_term += twin.assets[node]["criticality"] / 5 * r.likelihood * 0.12
            eff = controller_effect(twin, node)
            if not eff:
                continue
            for k, v in eff.value["s_contrib"].items():
                if r.likelihood * v > s_vals.get(k, 0):
                    s_vals[k], drivers[k] = r.likelihood * v, node
            for k, v in eff.value["d_contrib"].items():
                if r.likelihood * v > d_vals.get(k, 0):
                    d_vals[k], drivers[k] = r.likelihood * v, node
        s_raw = sum(s_vals.values())
        d_raw = sum(d_vals.values()) + cyber_term
        S = 1 - math.exp(-s_raw / 0.9)
        D = 1 - math.exp(-d_raw / 1.1)
        C = a["criticality"] / 5
        base = (0.30 * w["criticality"] * C + 0.35 * D + 0.35 * S) / (0.30 * w["criticality"] + 0.70)
        RF = REDUNDANCY_FACTOR.get(a.get("redundancy", "n/a"), 0.7)
        I = clamp(base * (1 - 0.35 * w["redundancy"] * (1 - RF)))
        score = 100 * math.sqrt(P * I)
        vp = 100 * V * (0.65 + 0.35 * E)
        cvss_max = max((twin.advisories[m["advisory_id"]]["cvss"] for m in twin.open_matches(asset_id)), default=0.0)

        assets[asset_id] = {
            "id": asset_id,
            "name": a["name"],
            "type": a["type"],
            "site": a.get("site"),
            "zone": a["zone"],
            "criticality": a["criticality"],
            "status": a.get("status", "active"),
            "vulnerability_priority": round(vp, 1),
            "likelihood": round(P, 4),
            "impact": round(I, 4),
            "score": round(score, 1),
            "priority": priority_band(score),
            "cvss_max": cvss_max,
            "kev": bool(top and top["advisory"]["kev"]),
            "exploit": top["advisory"]["exploit_maturity"] if top else None,
            "top_advisory": top["advisory"]["id"] if top else None,
            "activity": level,
            "exposure": a.get("exposure"),
            "open_matches": len(twin.open_matches(asset_id)),
            "factors": {
                "V": V, "E": E, "A": A, "S_act": S_act, "W": W, "M": M, "C": C, "D": D, "S": S, "RF": RF,
                "terms": terms, "s_raw": s_raw, "d_raw": d_raw,
            },
            "_top": top,
            "_inbound": [e["id"] for e in inbound],
            "_blast": {n: r.likelihood for n, r in blast.items() if n != asset_id},
            "_drivers": drivers,
            "_s_vals": s_vals,
            "_d_vals": d_vals,
        }

    ranked = sorted(assets.values(), key=lambda r: (-r["score"], r["id"]))
    for i, r in enumerate(ranked, start=1):
        r["rank"] = i
    by_cvss = sorted(assets.values(), key=lambda r: (-r["cvss_max"], -r["score"], r["id"]))
    for i, r in enumerate(by_cvss, start=1):
        r["cvss_rank"] = i
        r["rank_delta"] = i - r["rank"]

    total_i = sum(r["impact"] for r in assets.values()) or 1.0
    sri = 100 * sum(r["likelihood"] * r["impact"] for r in assets.values()) / total_i
    result = {
        "weights": w,
        "assets": assets,
        "ranking": [r["id"] for r in ranked],
        "systemic_risk_index": round(sri, 1),
        "threat_level": threat_level(sri),
        "counts": {band: sum(1 for r in assets.values() if r["priority"] == band) for band in ("NOW", "NEXT", "MONITOR")},
        "service_risk": service_risk(twin, assets),
    }
    twin._cache[key] = result
    return result


def threat_level(sri: float) -> str:
    return "SEVERE" if sri >= 50 else "HIGH" if sri >= 36 else "ELEVATED" if sri >= 28 else "GUARDED"


def service_risk(twin: Twin, assets: dict[str, dict]) -> dict[str, dict]:
    """Likelihood that each essential service or zone is disrupted, and through which controller."""
    out: dict[str, dict] = {}
    for asset_id, row in assets.items():
        eff = controller_effect(twin, asset_id)
        if not eff:
            continue
        for node, st in eff.cascade.states.items():
            if twin.assets[node]["category"] != "service" and twin.assets[node]["type"] != "control_centre":
                continue
            p = row["likelihood"] * (1.0 if st["state"] in {"lost", "on_backup"} else 0.5)
            if p > out.get(node, {}).get("likelihood", 0):
                out[node] = {"likelihood": round(p, 4), "via": asset_id, "state": st["state"], "cause": st["cause"]}
    return out


def public_row(row: dict) -> dict:
    return {k: v for k, v in row.items() if not k.startswith("_") and k != "factors"}


# --------------------------------------------------------------------------- explanations


def explain(twin: Twin, result: dict, asset_id: str) -> dict:
    """Decompose an asset's ranking into evidence the analyst can verify."""
    row = result["assets"][asset_id]
    a = twin.assets[asset_id]
    f = row["factors"]
    top = row["_top"]
    entry = entry_reachability(twin)
    reach = entry.get(asset_id)
    attack_path = path_to(entry, asset_id) if reach else []

    vuln_detail = "No open vulnerability match"
    if top:
        adv, m = top["advisory"], top["match"]
        vuln_detail = (f"{adv['id']} · CVSS {adv['cvss']} · {adv['exploit_maturity']} exploit"
                       f"{' · known exploited' if adv['kev'] else ''} · {m['status'].replace('_', ' ')} match")
    activity_events = len(twin.activity.get(asset_id, {}).get("events", []))
    factors = [
        {"key": "vulnerability", "label": "Vulnerability severity", "value": f["V"], "rating": rating(f["V"]), "detail": vuln_detail,
         "contribution": f["terms"]["vulnerability"]},
        {"key": "known_exploitation", "label": "Known exploitation",
         "value": 1.0 if row["kev"] else EXPLOIT_SCORE.get(row["exploit"] or "none", 0.2) * 0.6,
         "rating": "Yes" if row["kev"] else ("Exploit available" if row["exploit"] in {"functional", "weaponized"} else "No"),
         "detail": "Listed in the known-exploited catalogue (simulated)" if row["kev"] else f"Exploit maturity: {row['exploit'] or 'none'}",
         "contribution": None},
        {"key": "exposure", "label": "Network exposure", "value": f["E"], "rating": rating(f["E"]),
         "detail": (f"Reachable from untrusted segments via {', '.join(row['_inbound'])}" if row["_inbound"] else f"Declared {a.get('exposure')}")
         + (" · internet-facing" if a.get("internet_facing") else ""), "contribution": f["terms"]["exposure"]},
        {"key": "reachability", "label": "Attack-path reachability", "value": f["A"], "rating": rating(f["A"]),
         "detail": (" → ".join(attack_path) + f" ({f['A']:.0%} path likelihood)") if attack_path else "No modelled path from untrusted networks",
         "contribution": f["terms"]["reachability"]},
        {"key": "activity", "label": "Suspicious activity", "value": f["S_act"], "rating": (row["activity"] or "none").capitalize(),
         "detail": f"{activity_events} related event(s) in the evidence log" if activity_events else "No unusual activity recorded",
         "contribution": f["terms"]["activity"]},
        {"key": "authentication", "label": "Authentication weakness", "value": f["W"], "rating": rating(f["W"]),
         "detail": f"{a.get('auth', 'n/a')} authentication", "contribution": f["terms"]["authentication"]},
        {"key": "monitoring", "label": "Monitoring coverage", "value": f["M"], "rating": rating(f["M"]),
         "detail": f"{f['M']:.0%} of expected telemetry and logging in place", "contribution": f["terms"]["monitoring"]},
        {"key": "criticality", "label": "Asset criticality", "value": f["C"], "rating": CRITICALITY_LABEL[a["criticality"]],
         "detail": "Operator-assigned operational importance", "contribution": None},
        {"key": "dependency", "label": "Dependency importance", "value": f["D"], "rating": rating(f["D"]),
         "detail": f"{len(row['_blast'])} digital assets in the plausible blast radius", "contribution": None},
        {"key": "service", "label": "Service consequence", "value": f["S"], "rating": rating(f["S"]),
         "detail": "Population and essential services downstream", "contribution": None},
        {"key": "redundancy", "label": "Redundancy", "value": 1 - f["RF"], "rating": (a.get("redundancy") or "n/a").capitalize(),
         "detail": "Availability of an alternative path or standby", "contribution": None},
    ]

    consequences = []
    for key, value in sorted({**row["_s_vals"], **row["_d_vals"]}.items(), key=lambda kv: -kv[1])[:8]:
        node_id, _, when = key.partition("@")
        node = twin.assets[node_id]
        via = row["_drivers"].get(key)
        eff = controller_effect(twin, via) if via else None
        state = eff.cascade.state(node_id) if eff else "affected"
        if when:
            state = f"lost at +{when}"
        consequences.append({"node": node_id, "name": node["name"], "type": node.get("facility_type") or node["type"], "state": state,
                             "via": via, "path_likelihood": row["_blast"].get(via, 1.0) if via else None, "weight": round(value, 4),
                             "population": node.get("population")})

    reasons = []
    if top and f["V"] >= 0.35:
        adv = top["advisory"]
        reasons.append(f"Known vulnerability match: {adv['id']} ({top['match']['status']}), CVSS {adv['cvss']}"
                       + (", exploited in the wild" if adv["kev"] else ""))
    if row["_inbound"] or f["E"] >= 0.75:
        reasons.append("Significant network exposure: reachable from a less-trusted segment" if row["_inbound"] else "Exposed beyond its control network")
    if f["A"] >= 0.4 and attack_path:
        reasons.append(f"Candidate attack path from {attack_path[0]} ({f['A']:.0%} modelled likelihood)")
    if f["S_act"] > 0:
        reasons.append(f"Recorded {row['activity']} network activity ({activity_events} events)")
    if f["S"] >= 0.45 or f["D"] >= 0.45:
        names = ", ".join(c["node"] for c in consequences[:3])
        reasons.append(f"Critical operational dependencies downstream: {names}")
    if f["RF"] >= 0.85:
        reasons.append(f"Limited alternative connectivity ({a.get('redundancy')} redundancy)")
    if f["M"] < 0.4:
        reasons.append(f"Limited monitoring coverage ({f['M']:.0%})")
    if not reasons:
        reasons.append("No dominant risk driver. Continue routine monitoring.")

    impact_metrics = None
    eff = controller_effect(twin, asset_id)
    if eff:
        impact_metrics = consequence_metrics(twin, eff.cascade)

    return {
        "asset": public_row(row),
        "factors": factors,
        "terms": f["terms"],
        "formula": {
            "likelihood": "P = σ(−3.0 + 2.4·V + 1.4·E + 1.6·A + 2.0·S + 0.9·W − 1.3·M)",
            "impact": "I = (0.30·C + 0.35·D + 0.35·S) × (1 − 0.35·(1 − RF))",
            "priority": "Priority = 100·√(P·I)",
        },
        "reasons": reasons,
        "consequences": consequences,
        "blast_radius": sorted(({"id": n, "name": twin.assets[n]["name"], "likelihood": round(l, 3)} for n, l in row["_blast"].items()),
                               key=lambda x: -x["likelihood"])[:12],
        "attack_path": attack_path,
        "direct_impact": impact_metrics,
    }
