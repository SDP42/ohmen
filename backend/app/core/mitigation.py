"""Mitigation playground and Budget Autopilot.

Preventive actions are applied to sandbox copies of the twin, never to the baseline, and
compared by how much systemic risk they remove. The optimiser picks the portfolio that buys
the most risk reduction per rupee under a budget, and contrasts it with the conventional
"patch the highest CVSS first" strategy.
"""

from __future__ import annotations

from .model import UNTRUSTED_ZONES, Twin, affected_interval, fmt_version
from .risk import NOW_THRESHOLD, compute

COSTS = {  # ₹ lakh, illustrative
    "patch": {"gateway": 2.0, "remote_access": 2.5, "scada": 4.0, "rtu": 1.5, "plc": 1.5, "workstation": 0.5, "switch": 1.0},
    "restrict": 1.0,
    "disable_remote": 0.5,
    "segment": 5.0,
    "disable_path": 0.5,
    "diode": 4.0,
    "monitor": 3.0,
    "mfa": 1.5,
    "redundancy": 6.0,
    "investigate": 0.8,
    "isolate": 0.0,
}
EFFORT = {"patch": "2–5 days", "restrict": "1 day", "disable_remote": "hours", "segment": "2–3 weeks", "disable_path": "hours", "diode": "1–2 weeks",
          "monitor": "1–2 weeks", "mfa": "2–3 days", "redundancy": "4–8 weeks", "investigate": "1–2 days", "isolate": "minutes"}
CATEGORY = {"patch": "prevent", "restrict": "prevent", "disable_remote": "prevent", "segment": "prevent", "disable_path": "prevent", "diode": "prevent",
            "monitor": "detect", "mfa": "prevent", "redundancy": "recover", "investigate": "respond", "isolate": "respond"}


class MitigationError(ValueError):
    pass


def _next_fixed(twin: Twin, asset: dict) -> dict[int, str]:
    targets: dict[int, str] = {}
    for i, sw in enumerate(asset.get("software", [])):
        fixes = [twin.advisories[m["advisory_id"]]["fixed_version"] for m in twin.open_matches(asset["id"]) if m["software"] is sw or m["software"] == sw]
        if fixes:
            targets[i] = max(fixes, key=lambda v: affected_interval(f">={v}")[0])
    return targets


def describe(twin: Twin, mid: str) -> dict:
    kind, _, target = mid.partition(":")
    if kind not in COSTS:
        raise MitigationError(f"Unknown mitigation type '{kind}'")
    asset = twin.assets.get(target)
    name = asset["name"] if asset else target
    if kind == "patch":
        if not asset:
            raise MitigationError(f"Unknown asset {target}")
        fixes = _next_fixed(twin, asset)
        versions = ", ".join(f"{asset['software'][i]['product']} → {v}" for i, v in fixes.items()) or "no open advisories"
        title, desc = f"Patch {target}", f"Apply vendor firmware/software update ({versions})."
        cost = COSTS["patch"].get(asset["type"], 1.5)
    elif kind == "restrict":
        title, desc = f"Restrict network access to {target}", "Remove access from untrusted segments and limit management to the engineering VLAN."
        cost = COSTS["restrict"]
    elif kind == "disable_remote":
        title, desc = f"Disable remote access on {target}", "Turn off remote/vendor access outside approved maintenance windows."
        cost = COSTS["disable_remote"]
    elif kind == "segment":
        title, desc = f"Segment zone '{target}'", "Introduce a controlled conduit: block untrusted flows, allowlist protocols crossing the boundary."
        name = target
        cost = COSTS["segment"]
    elif kind == "disable_path":
        edge = twin.cyber_edges.get(target)
        if not edge:
            raise MitigationError(f"Unknown connection {target}")
        title = f"Disable path {edge['source']} → {edge['target']}"
        desc = f"Remove {edge['protocol']} connection {target} ({edge['purpose']})."
        name = target
        cost = COSTS["disable_path"]
    elif kind == "diode":
        edge = twin.cyber_edges.get(target)
        if not edge:
            raise MitigationError(f"Unknown connection {target}")
        title = f"Make {edge['source']} → {edge['target']} one-way"
        desc = f"Replace {target} ({edge['protocol']}) with a unidirectional gateway so data still flows but nothing can travel back."
        name = target
        cost = COSTS["diode"]
    elif kind == "monitor":
        title, desc = f"Enhance monitoring on {target}", "Deploy passive OT network monitoring and forward logs to the SOC."
        cost = COSTS["monitor"]
    elif kind == "mfa":
        title, desc = f"Enforce MFA on {target}", "Require multi-factor authentication and rotate shared credentials."
        cost = COSTS["mfa"]
    elif kind == "redundancy":
        title, desc = f"Add redundancy for {target}", "Provision a standby unit or alternate communication path."
        cost = COSTS["redundancy"]
    elif kind == "investigate":
        title, desc = f"Investigate activity on {target}", "Triage the evidence, rotate credentials, close the incident once contained."
        cost = COSTS["investigate"]
    else:
        title, desc = f"Isolate {target}", "Emergency containment: disconnect from all networks. Operators lose remote view of what it serves."
        cost = COSTS["isolate"]
    return {"id": mid, "type": kind, "target": target, "target_name": name, "title": title, "description": desc,
            "cost_lakh": cost, "effort": EFFORT[kind], "category": CATEGORY[kind]}


def apply(twin: Twin, mid: str) -> dict:
    """Mutate a sandbox twin. Never call this on the live baseline outside approved remediation."""
    info = describe(twin, mid)
    kind, target = info["type"], info["target"]
    asset = twin.assets.get(target)
    if kind == "patch":
        for i, version in _next_fixed(twin, asset).items():
            asset["software"][i]["version"] = version
    elif kind == "restrict":
        for e in twin.logical_edges():
            if e["target"] == target and twin.assets[e["source"]]["zone"] in UNTRUSTED_ZONES:
                if asset.get("remote_access"):
                    e["policy"] = "controlled"  # vendor access stays, behind an allowlist
                else:
                    e["status"] = "inactive"
        asset["exposure"] = "restricted" if asset.get("remote_access") else "internal"
        asset["internet_facing"] = False
    elif kind == "disable_remote":
        asset["remote_access"] = False
        asset["internet_facing"] = False
        asset["exposure"] = "internal"
        for e in twin.logical_edges():
            if e["target"] == target and twin.assets[e["source"]]["zone"] in UNTRUSTED_ZONES:
                e["status"] = "inactive"
    elif kind == "segment":
        members = {a["id"] for a in twin.assets.values() if a.get("zone") == target}
        if not members:
            raise MitigationError(f"Unknown zone {target}")
        for e in twin.logical_edges():
            inside_src, inside_dst = e["source"] in members, e["target"] in members
            if inside_src == inside_dst:
                continue
            outside = e["target"] if inside_src else e["source"]
            if twin.assets[outside]["zone"] in UNTRUSTED_ZONES:
                e["status"] = "inactive"
            else:
                e["policy"] = "controlled"
                e["monitored"] = True
    elif kind == "disable_path":
        twin.cyber_edges[target]["status"] = "inactive"
    elif kind == "diode":
        twin.cyber_edges[target]["one_way"] = True
        twin.cyber_edges[target]["bidirectional"] = False
    elif kind == "monitor":
        asset["monitoring"] = round(min(0.95, asset.get("monitoring", 0) + 0.4), 2)
        for e in twin.logical_edges():
            if e["target"] == target:
                e["monitored"] = True
    elif kind == "mfa":
        asset["auth"] = "strong"
    elif kind == "redundancy":
        asset["redundancy"] = {"none": "medium", "low": "medium", "medium": "high"}.get(asset.get("redundancy"), "high")
    elif kind == "investigate":
        twin.activity.pop(target, None)
    elif kind == "isolate":
        asset["status"] = "isolated"
    twin.touch()
    return info


def apply_all(twin: Twin, ids: list[str]) -> list[dict]:
    return [apply(twin, mid) for mid in ids]


def catalog(twin: Twin, asset_id: str) -> list[dict]:
    """Mitigations that make sense for this asset, in recommended order."""
    asset = twin.assets.get(asset_id)
    if not asset or asset["category"] != "cyber":
        return []
    ids: list[str] = []
    if twin.activity_level(asset_id):
        ids.append(f"investigate:{asset_id}")
    if _next_fixed(twin, asset):
        ids.append(f"patch:{asset_id}")
    untrusted_in = [e for e in twin.logical_edges() if e["target"] == asset_id and e["status"] == "active"
                    and twin.assets[e["source"]]["zone"] in UNTRUSTED_ZONES]
    if untrusted_in or asset.get("exposure") in {"exposed", "restricted"}:
        ids.append(f"restrict:{asset_id}")
    for e in untrusted_in:
        if e["policy"] == "legacy_exception":
            ids.append(f"disable_path:{e['id']}")
    if asset.get("remote_access"):
        ids.append(f"disable_remote:{asset_id}")
    if asset.get("auth") in {"weak", "default", "moderate"}:
        ids.append(f"mfa:{asset_id}")
    if asset.get("zone") not in {"bench"} | UNTRUSTED_ZONES:
        ids.append(f"segment:{asset['zone']}")
    if asset.get("monitoring", 1) < 0.6:
        ids.append(f"monitor:{asset_id}")
    if asset.get("redundancy") in {"none", "low"}:
        ids.append(f"redundancy:{asset_id}")
    ids.append(f"isolate:{asset_id}")
    return [describe(twin, mid) for mid in dict.fromkeys(ids)]


def _sri(twin: Twin, ids: tuple[str, ...], weights: dict | None, memo: dict) -> tuple[float, dict]:
    if ids not in memo:
        sandbox = twin.clone()
        apply_all(sandbox, list(ids))
        memo[ids] = (compute(sandbox, weights)["systemic_risk_index"], compute(sandbox, weights))
    return memo[ids]


def counterfactuals(twin: Twin, asset_id: str, weights: dict | None = None) -> list[dict]:
    """'If you did X, this asset's priority would move from A to B.'"""
    base = compute(twin, weights)
    before = base["assets"][asset_id]["score"]
    rows = []
    for m in catalog(twin, asset_id):
        if m["type"] == "isolate":
            continue
        sandbox = twin.clone()
        apply(sandbox, m["id"])
        after = compute(sandbox, weights)
        rows.append({**m, "score_before": before, "score_after": after["assets"][asset_id]["score"],
                     "priority_after": after["assets"][asset_id]["priority"],
                     "sri_before": base["systemic_risk_index"], "sri_after": after["systemic_risk_index"],
                     "sri_delta": round(after["systemic_risk_index"] - base["systemic_risk_index"], 2)})
    return sorted(rows, key=lambda r: (r["score_after"], r["cost_lakh"]))


def evaluate(twin: Twin, ids: list[str], weights: dict | None = None, scenario: dict | None = None) -> dict:
    from .resilience import attack_path_census
    from .scenario import run as run_scenario

    base = compute(twin, weights)
    sandbox = twin.clone()
    applied = apply_all(sandbox, ids)
    after = compute(sandbox, weights)
    changes = []
    for aid, row in base["assets"].items():
        new = after["assets"][aid]
        if abs(new["score"] - row["score"]) >= 0.5 or new["priority"] != row["priority"]:
            changes.append({"id": aid, "name": row["name"], "score_before": row["score"], "score_after": new["score"],
                            "priority_before": row["priority"], "priority_after": new["priority"],
                            "likelihood_before": row["likelihood"], "likelihood_after": new["likelihood"],
                            "impact_before": row["impact"], "impact_after": new["impact"]})
    changes.sort(key=lambda c: c["score_after"] - c["score_before"])
    paths_before, paths_after = attack_path_census(twin), attack_path_census(sandbox)
    out = {
        "mitigations": applied,
        "total_cost_lakh": round(sum(m["cost_lakh"] for m in applied), 2),
        "sri_before": base["systemic_risk_index"],
        "sri_after": after["systemic_risk_index"],
        "threat_before": base["threat_level"],
        "threat_after": after["threat_level"],
        "counts_before": base["counts"],
        "counts_after": after["counts"],
        "changes": changes,
        "attack_paths_before": paths_before,
        "attack_paths_after": paths_after,
    }
    if scenario:
        out["scenario_before"] = run_scenario(twin, {**scenario, "mitigations": []}, monte_carlo=False)
        out["scenario_after"] = run_scenario(twin, {**scenario, "mitigations": ids}, monte_carlo=False)
    return out


def candidate_pool(twin: Twin, weights: dict | None = None, top: int = 14) -> list[str]:
    base = compute(twin, weights)
    pool: list[str] = []
    for aid in base["ranking"][:top]:
        for m in catalog(twin, aid):
            if m["type"] not in {"isolate", "investigate"}:
                pool.append(m["id"])
    return list(dict.fromkeys(pool))


def optimize(twin: Twin, budget: float, weights: dict | None = None, horizon: float = 40.0) -> dict:
    """Lazy-greedy (CELF) portfolio: maximise systemic risk reduction per ₹ lakh."""
    base = compute(twin, weights)
    memo: dict[tuple[str, ...], tuple[float, dict]] = {}
    pool = candidate_pool(twin, weights)
    cost = {mid: describe(twin, mid)["cost_lakh"] for mid in pool}

    def greedy(limit: float) -> list[dict]:
        chosen: tuple[str, ...] = ()
        current = base["systemic_risk_index"]
        steps: list[dict] = []
        spent = 0.0
        gains = []
        for mid in pool:
            if cost[mid] <= limit:
                sri, _ = _sri(twin, (mid,), weights, memo)
                gains.append([(current - sri) / max(cost[mid], 0.25), mid, 0])
        gains.sort(reverse=True)
        it = 0
        while gains:
            it += 1
            gains.sort(reverse=True)
            ratio, mid, stamp = gains[0]
            if spent + cost[mid] > limit:
                gains.pop(0)
                continue
            if stamp != it:
                sri, _ = _sri(twin, tuple(sorted(chosen + (mid,))), weights, memo)
                gains[0] = [(current - sri) / max(cost[mid], 0.25), mid, it]
                gains.sort(reverse=True)
                if gains[0][1] != mid:
                    continue
                ratio = gains[0][0]
            if ratio <= 0.01:
                break
            gains.pop(0)
            chosen = tuple(sorted(chosen + (mid,)))
            new_sri, _ = _sri(twin, chosen, weights, memo)
            spent += cost[mid]
            steps.append({**describe(twin, mid), "cumulative_cost": round(spent, 2), "sri_after": new_sri,
                          "reduction": round(current - new_sri, 2)})
            current = new_sri
        return steps

    frontier = greedy(horizon)
    # Re-run strictly under budget so cheaper later items can fill the remaining room.
    portfolio = greedy(budget)
    chosen = tuple(sorted(s["id"] for s in portfolio))
    final_sri, final = _sri(twin, chosen, weights, memo) if chosen else (base["systemic_risk_index"], base)

    # Conventional baseline: patch in descending CVSS order until the money runs out.
    naive: list[dict] = []
    spent = 0.0
    patchable = sorted((r for r in base["assets"].values() if r["cvss_max"] > 0), key=lambda r: -r["cvss_max"])
    naive_ids: list[str] = []
    naive_curve = [{"cost": 0.0, "sri": base["systemic_risk_index"]}]
    for r in patchable:
        mid = f"patch:{r['id']}"
        if not _next_fixed(twin, twin.assets[r["id"]]):
            continue
        c = describe(twin, mid)["cost_lakh"]
        if spent + c > horizon:
            break
        naive_ids.append(mid)
        spent += c
        sri, _ = _sri(twin, tuple(sorted(naive_ids)), weights, memo)
        naive_curve.append({"cost": round(spent, 2), "sri": sri, "id": mid, "cvss": r["cvss_max"]})
    naive_in_budget = [p for p in naive_curve[1:] if p["cost"] <= budget + 1e-9]
    naive_sri = naive_in_budget[-1]["sri"] if naive_in_budget else base["systemic_risk_index"]

    now_before = {aid for aid, r in base["assets"].items() if r["score"] >= NOW_THRESHOLD}
    now_after = {aid for aid, r in final["assets"].items() if r["score"] >= NOW_THRESHOLD}
    return {
        "budget_lakh": budget,
        "sri_before": base["systemic_risk_index"],
        "sri_after": final_sri,
        "reduction_pct": round(100 * (base["systemic_risk_index"] - final_sri) / max(base["systemic_risk_index"], 1e-6), 1),
        "spent_lakh": round(sum(s["cost_lakh"] for s in portfolio), 2),
        "portfolio": portfolio,
        "critical_assets_addressed": sorted(now_before - now_after),
        "remaining_now": sorted(now_after),
        "frontier": [{"cost": 0.0, "sri": base["systemic_risk_index"]}] + [{"cost": s["cumulative_cost"], "sri": s["sri_after"], "id": s["id"]} for s in frontier],
        "naive": {"strategy": "Patch highest CVSS first", "sri_after": naive_sri,
                  "reduction_pct": round(100 * (base["systemic_risk_index"] - naive_sri) / max(base["systemic_risk_index"], 1e-6), 1),
                  "curve": naive_curve, "items": [p for p in naive_in_budget]},
        "pool_size": len(pool),
    }


__all__ = ["apply", "apply_all", "catalog", "counterfactuals", "describe", "evaluate", "optimize", "fmt_version"]
