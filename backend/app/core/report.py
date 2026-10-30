"""Risk assessment report: structured data plus a Markdown rendering for download."""

from __future__ import annotations

from datetime import datetime, timezone

from . import compliance, mitigation, resilience, risk, scenario


def _pop(n: float | None) -> str:
    if not n:
        return "0"
    return f"{n / 1_000_000:.2f} M" if n >= 1_000_000 else f"{n / 1000:.0f} k"


def build(store, budget: float = 12.0) -> dict:
    twin = store.twin
    r = risk.compute(twin)
    top_ids = r["ranking"][:5]
    priorities = []
    for aid in top_ids:
        exp = risk.explain(twin, r, aid)
        cfs = mitigation.counterfactuals(twin, aid)[:3]
        priorities.append({"asset": exp["asset"], "reasons": exp["reasons"], "consequences": exp["consequences"][:4],
                           "attack_path": exp["attack_path"],
                           "actions": [{k: c[k] for k in ("id", "title", "cost_lakh", "effort", "score_after", "priority_after")} for c in cfs]})
    flagship = scenario.run(twin, {"type": "exploitation", "asset": top_ids[0], "severity": "high"}, store.events, monte_carlo=True)
    plan = mitigation.optimize(twin, budget)
    choke = resilience.chokepoints(twin)
    spofs = [s for s in resilience.spof(twin) if s["is_spof"]][:5]
    drift = resilience.drift(twin, store.events)
    cert = compliance.certin(twin, len(store.audit.records), len(store.scenarios), store.tasks)
    generated = datetime.now(timezone.utc).isoformat(timespec="seconds")
    summary = {
        "systemic_risk_index": r["systemic_risk_index"], "threat_level": r["threat_level"], "now": r["counts"]["NOW"],
        "next": r["counts"]["NEXT"], "top_asset": top_ids[0], "portfolio_reduction_pct": plan["reduction_pct"],
        "cvss_first_reduction_pct": plan["naive"]["reduction_pct"], "certin_overall": cert["overall"],
    }
    report = {
        "title": "OHMEN Cyber-Risk Assessment — Simulated Mumbai Distribution Network",
        "generated_at": generated,
        "summary": summary,
        "register": [risk.public_row(r["assets"][i]) for i in r["ranking"][:12]],
        "priorities": priorities,
        "scenario": {"id": flagship["id"], "seed": top_ids[0], "impact": flagship["impact"], "attck": flagship["attck"],
                     "projection": flagship["projection"], "monte_carlo": flagship.get("monte_carlo"), "assumptions": flagship["assumptions"]},
        "portfolio": plan,
        "chokepoints": {"explanation": choke["explanation"], "cut": choke["cut"]},
        "spof": spofs,
        "drift": {"fidelity_score": drift["fidelity_score"], "shadow": len(drift["shadow_connections"]), "stale": len(drift["stale_connections"]),
                  "uncertain": len(drift["inventory_uncertainty"])},
        "compliance": cert,
        "audit": store.audit.verify(),
        "limitations": [
            "All assets, advisories, events and costs are synthetic. Nothing here describes real infrastructure.",
            "Attack paths are candidate hypotheses for assessment, not proof that propagation would succeed.",
            "Likelihood comes from a transparent weighted model; the ML estimate is trained on synthetic histories and shown as a second opinion.",
            "Operational consequences use a simplified supply model, not a power-flow simulation.",
        ],
    }
    report["markdown"] = render_markdown(report)
    return report


def render_markdown(rep: dict) -> str:
    s = rep["summary"]
    lines = [f"# {rep['title']}", "", f"_Generated {rep['generated_at']} · synthetic environment_", "", "## Executive summary", "",
             f"- **Systemic risk index:** {s['systemic_risk_index']} ({s['threat_level']})",
             f"- **Assets needing action now:** {s['now']} (next: {s['next']}). Highest priority: **{s['top_asset']}**",
             f"- **Recommended ₹{rep['portfolio']['budget_lakh']:g} lakh portfolio** cuts systemic risk **{s['portfolio_reduction_pct']}%** "
             f"(patching by CVSS alone: {s['cvss_first_reduction_pct']}%)",
             f"- **CERT-In guideline coverage:** {s['certin_overall']}/100", "", "## Priority register", "",
             "| # | Asset | Priority | Score | Likelihood | Impact | CVSS | CVSS rank |", "|---|---|---|---|---|---|---|---|"]
    for row in rep["register"]:
        lines.append(f"| {row['rank']} | {row['id']} {row['name']} | {row['priority']} | {row['score']:.0f} | {row['likelihood']:.0%} | "
                     f"{row['impact']:.0%} | {row['cvss_max'] or '–'} | {row['cvss_rank']} |")
    lines += ["", "## Top priorities explained", ""]
    for p in rep["priorities"]:
        a = p["asset"]
        lines.append(f"### {a['id']} — {a['name']} · {a['score']:.0f} ({a['priority']})")
        lines += [f"- {x}" for x in p["reasons"]]
        if p["attack_path"]:
            lines.append(f"- Candidate attack path: {' → '.join(p['attack_path'])}")
        if p["actions"]:
            lines.append("- Recommended actions: " + "; ".join(f"{x['title']} (₹{x['cost_lakh']}L → {x['score_after']:.0f} {x['priority_after']})" for x in p["actions"]))
        lines.append("")
    sc = rep["scenario"]
    imp = sc["impact"]
    lines += [f"## Flagship scenario — hypothetical compromise of {sc['seed']}", "",
              f"- Potentially reachable digital assets: {imp['digital_assets_reachable']}",
              f"- Operational assets affected: {imp['operational_assets_affected']}; essential services: {imp['essential_services_affected']}",
              f"- Citizens without power (modelled): {_pop(imp['citizens_without_power'])}",
              f"- Time to harm: {imp['time_to_harm_hours'] if imp['time_to_harm_hours'] is not None else 'n/a'} h",
              "- ATT&CK for ICS: " + " → ".join(f"{t['technique_id']} {t['technique']}" for t in sc["attck"]), ""]
    if sc.get("monte_carlo"):
        mc = sc["monte_carlo"]
        lines.append(f"- Monte Carlo ({mc['runs']} runs): P10/P50/P90 citizens {_pop(mc['citizens']['p10'])} / {_pop(mc['citizens']['p50'])} / "
                     f"{_pop(mc['citizens']['p90'])}; hospital impact in {mc['p_hospital_impact']:.0%} of runs")
        lines.append("")
    lines += ["## Recommended investment", ""]
    lines += [f"{i}. {p['title']} — ₹{p['cost_lakh']}L → SRI {p['sri_after']}" for i, p in enumerate(rep["portfolio"]["portfolio"], 1)]
    lines += ["", "## Resilience", "", f"- {rep['chokepoints']['explanation']}"]
    lines += [f"- Single point of failure: {x['id']} ({', '.join(f['id'] for f in x['essential_services']) or 'zones'})" for x in rep["spof"]]
    d = rep["drift"]
    lines += [f"- Twin fidelity {d['fidelity_score']}/100: {d['shadow']} shadow connections, {d['stale']} stale paths, {d['uncertain']} inventory gaps", "",
              "## CERT-In guideline coverage", ""]
    lines += [f"- {a['name']}: {a['score']} ({a['status']})" for a in rep["compliance"]["areas"]]
    au = rep["audit"]
    lines += ["", "## Audit", "", f"- Hash chain: {'intact' if au['valid'] else 'BROKEN at ' + str(au['broken_at'])} · {au['records']} records · head `{au['head'][:16]}…`",
              "", "## Methodology and limitations", "",
              "- Likelihood P = σ(−3.0 + 2.4·V + 1.4·E + 1.6·A + 2.0·S + 0.9·W − 1.3·M); impact I from criticality, dependency and service consequence with a redundancy modifier; priority = 100·√(P·I)."]
    lines += [f"- {x}" for x in rep["limitations"]]
    return "\n".join(lines) + "\n"
