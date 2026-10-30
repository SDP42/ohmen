"""AI Risk Analyst grounded in the twin's own calculations.

Two engines share one tool layer:

* Claude (default model claude-opus-5-5) with tool use, when API credentials are configured.
  It answers only from tool results; the risk engine owns every score.
* A deterministic intent engine that works offline and gives repeatable demo answers.

Both return the same shape: markdown answer, a trace of tool calls, and cited assets.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Callable

from . import compliance, mitigation, resilience, risk, scenario
from .model import CRITICALITY_LABEL

log = logging.getLogger("ohmen.analyst")

ID_RE = re.compile(r"\b(GW|RTU|PLC|SCADA|ENG|SW|SUB|TX|ZONE|HOSP|WTR|RAIL|TEL|DC|CC)-?([A-Z]?\d{1,3}|[A-F])\b", re.I)
ALIASES = {
    "historian": "SCADA-003", "vpn": "GW-007", "remote access": "GW-007", "cellular": "GW-008", "lte": "GW-008",
    "test bench": "PLC-003", "bench plc": "PLC-003", "dadar": "SUB-A", "substation a": "SUB-A", "substation b": "SUB-B",
    "substation c": "SUB-C", "substation d": "SUB-D", "substation e": "SUB-E", "worli": "SUB-D", "andheri": "SUB-B",
    "kurla": "SUB-C", "ghatkopar": "SUB-E", "control centre": "CC-001", "control center": "CC-001", "primary scada": "SCADA-001",
    "telecom": "TEL-01", "exchange": "TEL-01", "trauma": "HOSP-03", "city general": "HOSP-01", "parel hospital": "HOSP-01",
    "water pumping station a": "WTR-01", "rail": "RAIL-01", "data centre": "DC-01", "maintenance laptop": "ENG-002",
}
PERSONAS = {
    "analyst": "OT security analyst: technical, cites advisories, ATT&CK for ICS, attack paths and evidence.",
    "operations": "Grid operations manager: focuses on services, redundancy, backup endurance and what to switch.",
    "commissioner": "Municipal commissioner: plain language, citizens and essential services affected, money and decisions.",
    "auditor": "Risk and compliance officer: evidence, assumptions, traceability, and what is not established.",
}


def _fmt_pop(n: int | float | None) -> str:
    if not n:
        return "0"
    return f"{n / 1_000_000:.2f}M" if n >= 1_000_000 else f"{n / 1000:.0f}k"


class Tools:
    """Backend capabilities exposed to both analyst engines."""

    def __init__(self, store):
        self.store = store

    @property
    def twin(self):
        return self.store.twin

    def _resolve(self, asset_id: str) -> str:
        if asset_id in self.twin.assets:
            return asset_id
        norm = asset_id.upper().replace(" ", "-")
        if norm in self.twin.assets:
            return norm
        m = ID_RE.search(asset_id)
        if m:
            cand = f"{m.group(1).upper()}-{m.group(2).upper()}"
            for a in self.twin.assets:
                if a.replace("-0", "-").replace("-0", "-") == cand.replace("-0", "-").replace("-0", "-") or a == cand:
                    return a
        raise ValueError(f"Unknown asset '{asset_id}'")

    def get_risk_ranking(self, limit: int = 5, priority: str | None = None) -> dict:
        r = self.store.risk()
        rows = [risk.public_row(r["assets"][i]) for i in r["ranking"]]
        if priority:
            rows = [x for x in rows if x["priority"] == priority.upper()]
        out = []
        for x in rows[: max(1, min(int(limit), 27))]:
            exp = risk.explain(self.twin, r, x["id"])
            out.append({k: x[k] for k in ("id", "name", "score", "priority", "likelihood", "impact", "cvss_max", "rank", "cvss_rank", "kev", "activity")}
                       | {"reasons": exp["reasons"][:3]})
        return {"systemic_risk_index": r["systemic_risk_index"], "threat_level": r["threat_level"], "counts": r["counts"], "assets": out}

    def get_asset_details(self, asset_id: str) -> dict:
        aid = self._resolve(asset_id)
        a = self.twin.assets[aid]
        profile = {k: a.get(k) for k in ("id", "name", "type", "site_name", "zone", "purdue_level", "criticality", "redundancy", "exposure",
                                         "auth", "monitoring", "status", "vendor", "model", "ip", "internet_facing", "remote_access", "description",
                                         "population", "backup_hours", "facility_type")}
        out: dict[str, Any] = {"profile": profile}
        r = self.store.risk()
        if aid in r["assets"]:
            exp = risk.explain(self.twin, r, aid)
            out["risk"] = {"score": exp["asset"]["score"], "priority": exp["asset"]["priority"], "likelihood": exp["asset"]["likelihood"],
                           "impact": exp["asset"]["impact"], "vulnerability_priority": exp["asset"]["vulnerability_priority"],
                           "rank": exp["asset"]["rank"], "cvss_rank": exp["asset"]["cvss_rank"]}
            out["factors"] = [{k: f[k] for k in ("label", "rating", "detail")} for f in exp["factors"]]
            out["reasons"] = exp["reasons"]
            out["consequences"] = exp["consequences"][:6]
            out["attack_path"] = exp["attack_path"]
        elif aid in r["service_risk"]:
            out["service_risk"] = r["service_risk"][aid]
        return out

    def get_vulnerabilities(self, asset_id: str | None = None) -> dict:
        ids = [self._resolve(asset_id)] if asset_id else self.twin.cyber_ids()
        rows = []
        for aid in ids:
            for m in self.twin.matches().get(aid, []):
                adv = self.twin.advisories[m["advisory_id"]]
                rows.append({"asset": aid, "advisory": adv["id"], "title": adv["title"], "cvss": adv["cvss"], "kev": adv["kev"],
                             "exploit": adv["exploit_maturity"], "status": m["status"], "reason": m["reason"], "fixed_version": adv["fixed_version"]})
        return {"matches": rows, "confirmed": sum(r["status"] == "confirmed" for r in rows), "potential": sum(r["status"] == "potential" for r in rows)}

    def get_asset_dependencies(self, asset_id: str) -> dict:
        aid = self._resolve(asset_id)
        t = self.twin
        out_c = [{"to": e["target"], "protocol": e["protocol"], "purpose": e["purpose"], "policy": e["policy"]}
                 for e in t.logical_edges() if e["source"] == aid and e["status"] == "active"]
        in_c = [{"from": e["source"], "protocol": e["protocol"], "purpose": e["purpose"], "policy": e["policy"]}
                for e in t.logical_edges() if e["target"] == aid and e["status"] == "active"]
        ops_out = [{"to": e["target"], "relation": e["relation"], "role": e["role"]} for e in t.ops_out(aid)]
        ops_in = [{"from": e["source"], "relation": e["relation"], "role": e["role"]} for e in t.ops_in(aid)]
        impact = self.store.facility_impact(aid)
        return {"asset": aid, "cyber_outbound": out_c, "cyber_inbound": in_c, "operational_outbound": ops_out, "operational_inbound": ops_in,
                "if_manipulated": impact}

    def run_scenario(self, asset_id: str, scenario_type: str = "exploitation", severity: str = "high", mitigations: list[str] | None = None) -> dict:
        aid = self._resolve(asset_id)
        res = scenario.run(self.twin, {"type": scenario_type, "asset": aid, "severity": severity, "mitigations": mitigations or []},
                           self.store.events, monte_carlo=True)
        self.store.remember_scenario(res, actor="analyst")
        reach = [{"id": n, "likelihood": v["likelihood"], "hop": v["hop"]} for n, v in res["nodes"].items() if v["classification"] == "reachable"]
        cons = [{"id": n, "state": v["state"], "cause": v["cause"]} for n, v in res["nodes"].items() if v["classification"] == "consequence"]
        mc = res.get("monte_carlo") or {}
        return {"id": res["id"], "seeds": res["seeds"], "reachable": sorted(reach, key=lambda r: -r["likelihood"])[:10], "consequences": cons[:14],
                "impact": {k: res["impact"][k] for k in ("digital_assets_reachable", "operational_assets_affected", "citizens_without_power",
                                                         "essential_services_affected", "hospitals_affected", "time_to_harm_hours", "systemic_impact_score")},
                "facilities": res["impact"]["facilities"][:6], "projection": res["projection"][:6],
                "attck": [f"{a['technique_id']} {a['technique']} ({a['tactic']})" for a in res["attck"]],
                "monte_carlo": {k: mc.get(k) for k in ("runs", "p_hospital_impact", "p_detected", "expected_digital_assets")} | {"citizens": mc.get("citizens", {}) and {k: mc["citizens"][k] for k in ("p10", "p50", "p90")}},
                "assumptions": res["assumptions"]}

    def compare_assets(self, asset_a: str, asset_b: str) -> dict:
        a, b = self._resolve(asset_a), self._resolve(asset_b)
        r = self.store.risk()

        def row(i: str) -> dict:
            x = r["assets"].get(i)
            if not x:
                raise ValueError(f"{i} is not a cyber asset")
            exp = risk.explain(self.twin, r, i)
            return {"id": i, "name": x["name"], "cvss_max": x["cvss_max"], "cvss_rank": x["cvss_rank"], "rank": x["rank"], "score": x["score"],
                    "priority": x["priority"], "likelihood": x["likelihood"], "impact": x["impact"], "criticality": CRITICALITY_LABEL[x["criticality"]],
                    "blast_radius": len(exp["blast_radius"]), "consequences": [c["node"] for c in exp["consequences"][:4]], "reasons": exp["reasons"][:3]}

        ra, rb = row(a), row(b)
        first = ra if ra["score"] >= rb["score"] else rb
        return {"a": ra, "b": rb, "higher_priority": first["id"]}

    def recommend_mitigations(self, asset_id: str) -> dict:
        aid = self._resolve(asset_id)
        rows = mitigation.counterfactuals(self.twin, aid)
        return {"asset": aid, "options": [{k: c[k] for k in ("id", "title", "cost_lakh", "effort", "score_before", "score_after", "priority_after", "sri_delta")}
                                          for c in rows[:7]]}

    def evaluate_mitigations(self, mitigations: list[str]) -> dict:
        res = mitigation.evaluate(self.twin, mitigations)
        return {k: res[k] for k in ("total_cost_lakh", "sri_before", "sri_after", "threat_before", "threat_after", "counts_before", "counts_after")} | {
            "changes": res["changes"][:8], "attack_paths_before": res["attack_paths_before"]["paths"], "attack_paths_after": res["attack_paths_after"]["paths"]}

    def optimize_budget(self, budget_lakh: float) -> dict:
        res = mitigation.optimize(self.twin, float(budget_lakh))
        return {k: res[k] for k in ("budget_lakh", "sri_before", "sri_after", "reduction_pct", "spent_lakh", "critical_assets_addressed", "remaining_now")} | {
            "portfolio": [{k: p[k] for k in ("id", "title", "cost_lakh", "sri_after")} for p in res["portfolio"]],
            "cvss_first_reduction_pct": res["naive"]["reduction_pct"]}

    def get_resilience(self, kind: str = "spof") -> dict:
        if kind == "chokepoints":
            c = resilience.chokepoints(self.twin)
            return {"explanation": c["explanation"], "cut": c["cut"], "paths_before": c["before"]["paths"], "paths_after": c["after"]["paths"]}
        if kind == "drift":
            d = resilience.drift(self.twin, self.store.events)
            return {"fidelity_score": d["fidelity_score"], "shadow_connections": [{k: s[k] for k in ("source", "target", "protocol", "severity", "detail")} for s in d["shadow_connections"]],
                    "stale_connections": d["stale_connections"], "inventory_uncertainty": d["inventory_uncertainty"]}
        if kind == "vendors":
            return {"vendors": resilience.vendors(self.twin)}
        rows = [s for s in resilience.spof(self.twin) if s["is_spof"]][:8]
        return {"single_points_of_failure": [{k: s[k] for k in ("id", "name", "citizens_without_power", "time_to_harm_hours", "suggestion")}
                                             | {"services": [f"{f['id']}:{f['state']}" for f in s["essential_services"]]} for s in rows]}

    def get_compliance(self) -> dict:
        c = compliance.certin(self.twin, len(self.store.audit.records), len(self.store.scenarios), self.store.tasks)
        return {"overall": c["overall"], "areas": [{k: a[k] for k in ("name", "score", "status", "gaps")} for a in c["areas"]], "disclaimer": c["disclaimer"]}

    def get_recent_events(self, limit: int = 8) -> dict:
        return {"events": [{k: e.get(k) for k in ("id", "ts", "asset_id", "type", "severity", "title", "detail")} for e in self.store.events[-int(limit):][::-1]]}

    def generate_report(self) -> dict:
        from .report import build

        rep = build(self.store)
        self.store.record("analyst", "report_generated", "risk-report", {"sri": rep["summary"]["systemic_risk_index"]})
        return {"title": rep["title"], "summary": rep["summary"], "url": "/app/report"}

    REGISTRY: dict[str, tuple[str, dict]] = {
        "get_risk_ranking": ("Rank cyber assets by consequence-aware priority. Returns score, likelihood, impact, CVSS rank and top reasons.",
                             {"limit": {"type": "integer", "description": "How many assets (1-27)."}, "priority": {"type": "string", "enum": ["NOW", "NEXT", "MONITOR"]}}),
        "get_asset_details": ("Profile, risk decomposition, reasons, downstream consequences and attack path for one asset.",
                              {"asset_id": {"type": "string", "description": "Asset ID such as GW-001."}}),
        "get_vulnerabilities": ("Vulnerability matches (confirmed, potential, not applicable) with reasons. Omit asset_id for all assets.",
                                {"asset_id": {"type": "string"}}),
        "get_asset_dependencies": ("Cyber connections and operational dependencies of an asset, plus consequences if it were manipulated.",
                                   {"asset_id": {"type": "string"}}),
        "run_scenario": ("Run a safe hypothetical scenario in a sandbox copy of the twin. Returns reachable assets, consequences, ATT&CK mapping and Monte Carlo bands.",
                         {"asset_id": {"type": "string"}, "scenario_type": {"type": "string", "enum": ["exploitation", "unavailability", "suspicious_access"]},
                          "severity": {"type": "string", "enum": ["low", "medium", "high"]}, "mitigations": {"type": "array", "items": {"type": "string"},
                          "description": "Mitigation ids such as segment:sub-a or patch:GW-001."}}),
        "compare_assets": ("Compare two assets on CVSS versus consequence-aware priority.", {"asset_a": {"type": "string"}, "asset_b": {"type": "string"}}),
        "recommend_mitigations": ("Counterfactuals: how each available mitigation would change this asset's priority, with cost.", {"asset_id": {"type": "string"}}),
        "evaluate_mitigations": ("Apply mitigation ids to a sandbox and compare systemic risk, priorities and attack paths before/after.",
                                 {"mitigations": {"type": "array", "items": {"type": "string"}}}),
        "optimize_budget": ("Pick the mitigation portfolio that removes the most systemic risk under a budget in ₹ lakh.", {"budget_lakh": {"type": "number"}}),
        "get_resilience": ("Single points of failure, attack-path chokepoints (min cut), twin drift, or vendor concentration.",
                           {"kind": {"type": "string", "enum": ["spof", "chokepoints", "drift", "vendors"]}}),
        "get_compliance": ("Coverage of the CERT-In smart-city guideline areas named in PS 03, with gaps.", {}),
        "get_recent_events": ("Latest security and operational events from the event stream.", {"limit": {"type": "integer"}}),
        "generate_report": ("Generate the risk assessment report and return its summary and link.", {}),
    }
    REQUIRED = {"get_asset_details": ["asset_id"], "get_asset_dependencies": ["asset_id"], "run_scenario": ["asset_id"], "compare_assets": ["asset_a", "asset_b"],
                "recommend_mitigations": ["asset_id"], "evaluate_mitigations": ["mitigations"], "optimize_budget": ["budget_lakh"]}

    def schemas(self) -> list[dict]:
        return [{"name": name, "description": desc,
                 "input_schema": {"type": "object", "properties": props, "required": self.REQUIRED.get(name, [])}}
                for name, (desc, props) in self.REGISTRY.items()]

    def call(self, name: str, args: dict) -> dict:
        if name not in self.REGISTRY:
            raise ValueError(f"Unknown tool {name}")
        fn: Callable[..., dict] = getattr(self, name)
        return fn(**(args or {}))


def _summarise(name: str, args: dict, result: dict) -> str:
    if name == "get_risk_ranking":
        return ", ".join(f"{a['id']} {a['score']:.0f} {a['priority']}" for a in result["assets"][:5])
    if name == "get_asset_details" and "risk" in result:
        return f"{result['profile']['id']}: score {result['risk']['score']:.0f} ({result['risk']['priority']}), rank #{result['risk']['rank']}"
    if name == "run_scenario":
        i = result["impact"]
        return f"{i['digital_assets_reachable']} reachable, {i['essential_services_affected']} services, {_fmt_pop(i['citizens_without_power'])} without power"
    if name == "optimize_budget":
        return f"₹{result['spent_lakh']}L → −{result['reduction_pct']}% systemic risk (CVSS-first −{result['cvss_first_reduction_pct']}%)"
    if name == "recommend_mitigations" and result["options"]:
        o = result["options"][0]
        return f"best: {o['id']} {o['score_before']:.0f}→{o['score_after']:.0f}"
    if name == "compare_assets":
        return f"{result['a']['id']} {result['a']['score']:.0f} vs {result['b']['id']} {result['b']['score']:.0f}"
    return f"{len(json.dumps(result, default=str))} bytes of evidence"


# =========================================================================== deterministic engine


INTENTS = [
    ("report", r"\breport\b|briefing|summary for"),
    ("budget", r"budget|lakh|₹|\binvest|spend|crore"),
    ("chokepoints", r"chokepoint|min(imum)?[- ]?cut|sever|cut (the )?path"),
    ("spof", r"single point|spof|single-point|redundanc"),
    ("drift", r"drift|shadow|undocumented|stale|out of date"),
    ("vendors", r"vendor|supply[- ]?chain|supplier"),
    ("compliance", r"cert-?in|complian|guideline|regulat"),
    ("compare", r"compare|versus|\bvs\.?\b|more important than|difference between"),
    ("mitigation", r"mitigat|reduce|best (action|option|fix)|what should (we|i) do|remediat|how (do|can) (we|i) fix|secure it|protect"),
    ("scenario", r"what (happens|if)|compromis|goes down|fails?\b|simulat|blast radius|impact of|cascade"),
    ("dependencies", r"depend|connected to|downstream|upstream|relies on|feeds|talks to"),
    ("vulnerabilities", r"vulnerab|cve|advisor|exploit|patch"),
    ("events", r"\bevents?\b|alerts?|happening|latest|activity|incident"),
    ("why", r"\bwhy\b|explain|reason|ranked"),
    ("ranking", r"investigate first|priorit|\btop\b|most urgent|which assets|rank|riskiest|first|today"),
]


class DeterministicAnalyst:
    def __init__(self, tools: Tools):
        self.tools = tools

    def _assets_in(self, text: str) -> list[str]:
        found: list[str] = []
        for m in ID_RE.finditer(text):
            try:
                aid = self.tools._resolve(f"{m.group(1)}-{m.group(2)}")
            except ValueError:
                continue
            if aid not in found:
                found.append(aid)
        low = text.lower()
        for alias, aid in ALIASES.items():
            if alias in low and aid not in found:
                found.append(aid)
        return found

    def answer(self, question: str, persona: str, history: list[dict]) -> dict:
        trace: list[dict] = []

        def use(name: str, **args) -> dict:
            result = self.tools.call(name, args)
            trace.append({"tool": name, "input": args, "summary": _summarise(name, args, result)})
            return result

        q = question.strip()
        assets = self._assets_in(q)
        if not assets:
            for h in reversed(history[-6:]):
                assets = self._assets_in(h.get("content", ""))
                if assets:
                    break
        intent = next((name for name, pat in INTENTS if re.search(pat, q, re.I)), "help")
        if intent == "why" and not assets:
            intent = "ranking"
        try:
            text = getattr(self, f"_{intent}")(q, assets, persona, use)
        except ValueError as exc:
            text = f"I couldn't run that: {exc}. Try naming an asset ID such as **GW-001** or **SCADA-003**."
        cited = sorted({a for t in trace for a in re.findall(r"[A-Z]{2,5}-[A-Z0-9]{1,3}", json.dumps(t["input"]) + t["summary"]) if a in self.tools.twin.assets})
        return {"answer": text, "tool_calls": trace, "cited_assets": cited or assets, "intent": intent}

    # ---- intents
    def _ranking(self, q, assets, persona, use):
        r = use("get_risk_ranking", limit=5)
        lead = {
            "commissioner": "If the team can act on only five things today, these protect the most citizens and essential services:",
            "operations": "Five assets whose compromise would hurt service continuity most, with redundancy in mind:",
            "auditor": "Top five priorities. Each rank is reproducible from the evidence listed:",
        }.get(persona, "If your team can only address five assets today, start here:")
        lines = [f"**Systemic risk index {r['systemic_risk_index']}** · threat level **{r['threat_level']}** · "
                 f"{r['counts']['NOW']} NOW / {r['counts']['NEXT']} NEXT\n", lead, ""]
        for i, a in enumerate(r["assets"], 1):
            moved = a["cvss_rank"] - a["rank"]
            shift = f" · CVSS alone would rank it #{a['cvss_rank']}" if abs(moved) >= 3 else ""
            lines.append(f"{i}. **{a['id']}** — {a['name']} · score **{a['score']:.0f}** `{a['priority']}`{shift}")
            for reason in a["reasons"][:2]:
                lines.append(f"   - {reason}")
        top = r["assets"][0]["id"]
        rec = use("recommend_mitigations", asset_id=top)
        if rec["options"]:
            o = rec["options"][0]
            lines.append(f"\n**First move:** {o['title']} (₹{o['cost_lakh']}L, {o['effort']}) drops {top} from "
                         f"{o['score_before']:.0f} to {o['score_after']:.0f} ({o['priority_after']}).")
        return "\n".join(lines)

    def _why(self, q, assets, persona, use):
        aid = assets[0]
        d = use("get_asset_details", asset_id=aid)
        if "risk" not in d:
            return self._dependencies(q, assets, persona, use)
        rk = d["risk"]
        lines = [f"**{aid} — {d['profile']['name']}** is ranked **#{rk['rank']}** with priority **{rk['score']:.0f}** "
                 f"(`{rk['priority']}`): likelihood {rk['likelihood']:.0%} × systemic impact {rk['impact']:.0%}.", ""]
        if rk["cvss_rank"] != rk["rank"]:
            lines.append(f"By CVSS alone it would be #{rk['cvss_rank']}. The difference comes from exposure and downstream consequence.\n")
        lines.append("**Why it ranks here**")
        lines += [f"- {r}" for r in d["reasons"]]
        lines.append("\n**Evidence**")
        lines.append("| Factor | Rating | Detail |\n|---|---|---|")
        for f in d["factors"][:7]:
            lines.append(f"| {f['label']} | {f['rating']} | {f['detail']} |")
        if d.get("consequences"):
            lines.append("\n**What depends on it**")
            for c in d["consequences"][:4]:
                pop = f" · {_fmt_pop(c['population'])} people" if c.get("population") else ""
                lines.append(f"- {c['node']} {c['name']} → {c['state']}{pop}")
        if persona == "auditor":
            lines.append("\n_Assumption: attack paths are candidates for assessment, not proof of propagation. Scores come from the "
                         "transparent model (P = σ(…), I = f(C, D, S, R)) and change when the inventory changes._")
        return "\n".join(lines)

    def _scenario(self, q, assets, persona, use):
        aid = assets[0] if assets else "GW-001"
        kind = "unavailability" if re.search(r"down|unavailable|offline|fails?\b", q, re.I) else "exploitation"
        res = use("run_scenario", asset_id=aid, scenario_type=kind, severity="high" if kind == "exploitation" else "medium")
        i = res["impact"]
        lines = [f"**Scenario {res['id']}: hypothetical {'compromise' if kind == 'exploitation' else 'loss'} of {aid}**", ""]
        if res["reachable"]:
            top = ", ".join(f"{r['id']} ({r['likelihood']:.0%})" for r in res["reachable"][:5])
            lines.append(f"- **Potentially reachable digital assets:** {i['digital_assets_reachable']}: {top}")
        lines.append(f"- **Operational assets affected:** {i['operational_assets_affected']} · **essential services:** {i['essential_services_affected']}")
        lines.append(f"- **Citizens without power (modelled):** {_fmt_pop(i['citizens_without_power'])}")
        if i["time_to_harm_hours"] is not None:
            lines.append(f"- **Time to harm:** first backup supply runs out after **{i['time_to_harm_hours']:g}h**")
        for f in res["facilities"][:4]:
            lines.append(f"  - {f['name']}: {f['state'].replace('_', ' ')}" + (f", backup exhausted at +{f['time_to_harm_hours']:g}h" if f.get("time_to_harm_hours") else ""))
        mc = res.get("monte_carlo") or {}
        if mc.get("runs"):
            c = mc.get("citizens") or {}
            lines.append(f"- **Monte Carlo ({mc['runs']} runs):** P50 {_fmt_pop(c.get('p50'))}, P90 {_fmt_pop(c.get('p90'))} without power; "
                         f"hospital impact in {mc['p_hospital_impact']:.0%} of runs; detected in {mc['p_detected']:.0%}")
        if persona in {"analyst", "auditor"} and res["attck"]:
            lines.append(f"- **ATT&CK for ICS:** {' → '.join(a.split(' (')[0] for a in res['attck'][:6])}")
        lines.append("\n_The scenario assumes the configured network connections. It does not establish that a facility's own systems are reachable; "
                     "operational consequences come from the separate dependency model._")
        return "\n".join(lines)

    def _dependencies(self, q, assets, persona, use):
        aid = assets[0] if assets else "SUB-A"
        d = use("get_asset_dependencies", asset_id=aid)
        lines = [f"**Dependencies of {aid}**", ""]
        if d["cyber_inbound"] or d["cyber_outbound"]:
            lines.append("**Cyber (who can talk to whom)**")
            lines += [f"- ← {c['from']} over {c['protocol']} ({c['purpose']}){' · ⚠ ' + c['policy'] if c['policy'] == 'legacy_exception' else ''}" for c in d["cyber_inbound"]]
            lines += [f"- → {c['to']} over {c['protocol']} ({c['purpose']})" for c in d["cyber_outbound"]]
        if d["operational_inbound"] or d["operational_outbound"]:
            lines.append("\n**Operational (what depends on what)**")
            lines += [f"- ← {o['from']} {o['relation']} ({o['role']})" for o in d["operational_inbound"]]
            lines += [f"- → {o['to']} {o['relation']} ({o['role']})" for o in d["operational_outbound"]]
        imp = d.get("if_manipulated")
        if imp:
            lines.append(f"\n**If {aid} were manipulated:** {_fmt_pop(imp['citizens_without_power'])} citizens lose supply, "
                         f"{imp['essential_services_affected']} essential services affected"
                         + (f", first backup exhausted after {imp['time_to_harm_hours']:g}h." if imp["time_to_harm_hours"] is not None else "."))
        return "\n".join(lines)

    def _vulnerabilities(self, q, assets, persona, use):
        v = use("get_vulnerabilities", **({"asset_id": assets[0]} if assets else {}))
        rows = [m for m in v["matches"] if m["status"] != "not_applicable"]
        lines = [f"**{v['confirmed']} confirmed and {v['potential']} potential matches**" + (f" on {assets[0]}" if assets else " across the inventory"), "",
                 "| Asset | Advisory | CVSS | Exploit | Match |", "|---|---|---|---|---|"]
        for m in sorted(rows, key=lambda m: -m["cvss"])[:12]:
            lines.append(f"| {m['asset']} | {m['advisory']} {'· KEV' if m['kev'] else ''} | {m['cvss']} | {m['exploit']} | {m['status']} |")
        pot = [m for m in rows if m["status"] == "potential"]
        if pot:
            lines.append(f"\nPotential matches need the exact firmware build: {', '.join(sorted({m['asset'] for m in pot}))}.")
        return "\n".join(lines)

    def _mitigation(self, q, assets, persona, use):
        if not assets:
            assets = [use("get_risk_ranking", limit=1)["assets"][0]["id"]]
        aid = assets[0]
        if re.search(r"segment", q, re.I):
            zone = self.tools.twin.assets[aid].get("zone", "sub-a")
            ev = use("evaluate_mitigations", mitigations=[f"segment:{zone}"])
            return (f"**Segmenting zone `{zone}`** moves systemic risk {ev['sri_before']} → **{ev['sri_after']}** and cuts candidate attack paths "
                    f"{ev['attack_paths_before']} → {ev['attack_paths_after']} (₹{ev['total_cost_lakh']}L).")
        rec = use("recommend_mitigations", asset_id=aid)
        if not rec["options"]:
            return f"No mitigations apply to {aid}."
        lines = [f"**Options for {aid}** (counterfactuals from the risk engine)", "", "| Action | Cost | Priority after | Systemic Δ |", "|---|---|---|---|"]
        for o in rec["options"]:
            lines.append(f"| {o['title']} | ₹{o['cost_lakh']}L · {o['effort']} | {o['score_before']:.0f} → **{o['score_after']:.0f}** {o['priority_after']} | {o['sri_delta']:+.1f} |")
        best_value = max(rec["options"], key=lambda o: (o["score_before"] - o["score_after"]) / max(o["cost_lakh"], 0.25))
        lines.append(f"\n**Best value:** {best_value['title']}. **Largest single reduction:** {rec['options'][0]['title']}.")
        return "\n".join(lines)

    def _compare(self, q, assets, persona, use):
        if len(assets) < 2:
            assets = (assets + ["PLC-003", "GW-004"])[:2] if assets else ["PLC-003", "GW-004"]
        c = use("compare_assets", asset_a=assets[0], asset_b=assets[1])
        a, b = c["a"], c["b"]
        lines = ["| | " + a["id"] + " | " + b["id"] + " |", "|---|---|---|",
                 f"| CVSS (max) | {a['cvss_max']} (#{a['cvss_rank']}) | {b['cvss_max']} (#{b['cvss_rank']}) |",
                 f"| Likelihood | {a['likelihood']:.0%} | {b['likelihood']:.0%} |", f"| Systemic impact | {a['impact']:.0%} | {b['impact']:.0%} |",
                 f"| Criticality | {a['criticality']} | {b['criticality']} |", f"| Blast radius | {a['blast_radius']} assets | {b['blast_radius']} assets |",
                 f"| Priority | **{a['score']:.0f}** {a['priority']} (#{a['rank']}) | **{b['score']:.0f}** {b['priority']} (#{b['rank']}) |", ""]
        win = a if c["higher_priority"] == a["id"] else b
        lose = b if win is a else a
        lines.append(f"**{win['id']} should be secured first.** " + ("; ".join(win["reasons"][:2])) + ".")
        if lose["cvss_max"] > win["cvss_max"]:
            lines.append(f"\n{lose['id']} has the higher CVSS ({lose['cvss_max']}), but " + (lose["reasons"][0].lower() if lose["reasons"] else "its consequences are limited") + ". "
                         "CVSS measures severity, not consequence.")
        return "\n".join(lines)

    def _budget(self, q, assets, persona, use):
        m = re.search(r"(\d+(?:\.\d+)?)\s*(lakh|l\b|crore|cr\b)?", q, re.I)
        budget = float(m.group(1)) * (100 if m and m.group(2) and m.group(2).lower().startswith("c") else 1) if m else 12.0
        o = use("optimize_budget", budget_lakh=budget)
        lines = [f"**With ₹{budget:g} lakh**, the optimiser cuts systemic risk **{o['reduction_pct']}%** ({o['sri_before']} → {o['sri_after']}), "
                 f"spending ₹{o['spent_lakh']}L. Patching by CVSS alone would cut **{o['cvss_first_reduction_pct']}%**.", ""]
        for i, p in enumerate(o["portfolio"], 1):
            lines.append(f"{i}. {p['title']} · ₹{p['cost_lakh']}L → SRI {p['sri_after']}")
        if o["critical_assets_addressed"]:
            lines.append(f"\nMoves out of NOW: {', '.join(o['critical_assets_addressed'])}.")
        return "\n".join(lines)

    def _chokepoints(self, q, assets, persona, use):
        c = use("get_resilience", kind="chokepoints")
        lines = [f"**{c['explanation']}**", f"Candidate paths: {c['paths_before']} → {c['paths_after']}", ""]
        for x in c["cut"]:
            lines.append(f"- `{x['edge_id']}` {x['source']} → {x['target']} ({x['protocol']}): {x['purpose']} → **{x['mitigation']}**")
        return "\n".join(lines)

    def _spof(self, q, assets, persona, use):
        s = use("get_resilience", kind="spof")
        lines = ["**Single points of failure** (loss of one asset pushes an essential service onto backup or offline)", ""]
        for x in s["single_points_of_failure"][:6]:
            tth = f" · first backup exhausted at {x['time_to_harm_hours']:g}h" if x["time_to_harm_hours"] is not None else ""
            sug = f" · try: {x['suggestion']['label']}" if x.get("suggestion") else ""
            lines.append(f"- **{x['id']}**: {', '.join(x['services']) or 'zones degraded'}{tth}{sug}")
        return "\n".join(lines)

    def _drift(self, q, assets, persona, use):
        d = use("get_resilience", kind="drift")
        lines = [f"**Twin fidelity {d['fidelity_score']}/100.** Where the model disagrees with reality:", ""]
        lines += [f"- Shadow connection **{s['source']} → {s['target']}** ({s['protocol']}, {s['severity']}): {s['detail']}" for s in d["shadow_connections"]]
        lines += [f"- Stale path `{s['id']}` {s['source']} → {s['target']} not seen for {s['last_observed_hours']:.0f}h" for s in d["stale_connections"]]
        lines += [f"- {u['id']} records '{u['recorded_version']}' for {u['software']}: exact build unknown" for u in d["inventory_uncertainty"]]
        return "\n".join(lines)

    def _vendors(self, q, assets, persona, use):
        v = use("get_resilience", kind="vendors")["vendors"]
        lines = ["**Vendor concentration** (what a compromise of each supplier would expose)", "", "| Vendor | Assets | Open vulns | Citizens exposed |", "|---|---|---|---|"]
        lines += [f"| {x['vendor']} | {x['count']} ({x['share_pct']}%) | {x['open_vulnerabilities']} | {_fmt_pop(x['compromise_citizens'])} |" for x in v]
        return "\n".join(lines)

    def _compliance(self, q, assets, persona, use):
        c = use("get_compliance")
        lines = [f"**CERT-In guideline coverage: {c['overall']}/100**", ""]
        for a in c["areas"]:
            gap = f": {a['gaps'][0]['gap']} ({a['gaps'][0]['asset']})" if a["gaps"] else ""
            lines.append(f"- {a['name']}: **{a['score']}** ({a['status']}){gap}")
        lines.append(f"\n_{c['disclaimer']}_")
        return "\n".join(lines)

    def _events(self, q, assets, persona, use):
        e = use("get_recent_events", limit=8)
        return "**Latest events**\n\n" + "\n".join(f"- `{x['severity']}` {x['title']}{' · ' + x['asset_id'] if x['asset_id'] else ''}" for x in e["events"])

    def _report(self, q, assets, persona, use):
        r = use("generate_report")
        s = r["summary"]
        return (f"**{r['title']}** is ready ([open the report]({r['url']})).\n\n- Systemic risk index **{s['systemic_risk_index']}** ({s['threat_level']})\n"
                f"- {s['now']} assets need action now · top priority **{s['top_asset']}**\n- Recommended portfolio cuts risk **{s['portfolio_reduction_pct']}%**")

    def _help(self, q, assets, persona, use):
        if assets:
            return self._why(q, assets, persona, use)
        return ("I answer from the twin's own calculations. Try:\n\n- *Which assets should we investigate first?*\n- *Why is GW-001 high risk?*\n"
                "- *What happens if GW-001 is compromised?*\n- *Compare PLC-003 and GW-004*\n- *What's the best mitigation for SCADA-003?*\n"
                "- *We have ₹10 lakh. What should we fund?*\n- *Where are the attack-path chokepoints?*\n- *Generate a report for the security manager*")


# =========================================================================== Claude engine


SYSTEM_PROMPT = """You are the OHMEN AI Risk Analyst, embedded in a cyber-risk digital twin of a simulated electricity distribution network inspired by Mumbai.

Ground rules:
- Use the provided tools to fetch facts. Never invent asset IDs, scores, CVEs or consequences.
- The risk engine owns every score. Quote its numbers; do not compute your own risk scores.
- Keep observed evidence, hypothetical attack paths and potential operational consequences clearly distinct.
  A path in the graph is a candidate for assessment, not proof that an attacker can traverse it.
- Operational dependency (a hospital needs a substation's power) does not imply cyber reachability of the hospital's own systems.
- The environment is synthetic. Do not claim to monitor real infrastructure.
- Answer in concise GitHub-flavoured markdown: lead with the decision, then evidence (tables are welcome), then caveats.
"""


class ClaudeAnalyst:
    def __init__(self, tools: Tools, model: str, effort: str):
        import anthropic

        self.anthropic = anthropic
        self.client = anthropic.Anthropic(max_retries=2, timeout=90.0)
        self.tools = tools
        self.model = model
        self.effort = effort

    def answer(self, question: str, persona: str, history: list[dict]) -> dict:
        system = SYSTEM_PROMPT + f"\nAudience: {PERSONAS.get(persona, PERSONAS['analyst'])}\n"
        messages: list[dict] = [{"role": h["role"], "content": h["content"]} for h in history[-8:] if h.get("role") in {"user", "assistant"} and h.get("content")]
        while messages and messages[0]["role"] != "user":
            messages.pop(0)
        messages.append({"role": "user", "content": question})
        trace: list[dict] = []
        for _ in range(8):
            response = self.client.beta.messages.create(
                model=self.model,
                max_tokens=16000,
                system=system,
                tools=self.tools.schemas(),
                messages=messages,
                output_config={"effort": self.effort},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
            if response.stop_reason == "refusal":
                detail = getattr(getattr(response, "stop_details", None), "explanation", None)
                return {"answer": "The model declined this request." + (f" ({detail})" if detail else ""), "tool_calls": trace, "model": response.model}
            tool_uses = [b for b in response.content if b.type == "tool_use"]
            messages.append({"role": "assistant", "content": response.content})
            if response.stop_reason != "tool_use" or not tool_uses:
                text = "\n".join(b.text for b in response.content if b.type == "text").strip()
                return {"answer": text or "_No answer returned._", "tool_calls": trace, "model": response.model}
            results = []
            for tu in tool_uses:
                try:
                    out = self.tools.call(tu.name, dict(tu.input or {}))
                    trace.append({"tool": tu.name, "input": tu.input, "summary": _summarise(tu.name, tu.input, out)})
                    results.append({"type": "tool_result", "tool_use_id": tu.id, "content": json.dumps(out, default=str)})
                except Exception as exc:  # report tool errors back to the model instead of failing the turn
                    trace.append({"tool": tu.name, "input": tu.input, "summary": f"error: {exc}"})
                    results.append({"type": "tool_result", "tool_use_id": tu.id, "content": str(exc), "is_error": True})
            messages.append({"role": "user", "content": results})
        return {"answer": "_Stopped after 8 tool rounds without a final answer._", "tool_calls": trace, "model": self.model}


class Analyst:
    def __init__(self, store):
        self.tools = Tools(store)
        self.offline = DeterministicAnalyst(self.tools)
        self.mode = os.environ.get("OHMEN_ANALYST_MODE", "auto").lower()
        self.model = os.environ.get("OHMEN_ANALYST_MODEL", "claude-opus-5-5")
        self.effort = os.environ.get("OHMEN_ANALYST_EFFORT", "medium")
        self.disabled_reason: str | None = None
        self._claude: ClaudeAnalyst | None = None

    def claude_enabled(self) -> bool:
        if self.mode == "offline" or self.disabled_reason:
            return False
        if self.mode == "claude":
            return True
        return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))

    def status(self) -> dict:
        return {"engine": "claude" if self.claude_enabled() else "deterministic", "model": self.model if self.claude_enabled() else None,
                "mode": self.mode, "disabled_reason": self.disabled_reason, "personas": PERSONAS, "tools": list(Tools.REGISTRY)}

    def ask(self, question: str, persona: str = "analyst", history: list[dict] | None = None) -> dict:
        persona = persona if persona in PERSONAS else "analyst"
        history = history or []
        note = None
        if self.claude_enabled():
            try:
                if self._claude is None:
                    self._claude = ClaudeAnalyst(self.tools, self.model, self.effort)
                out = self._claude.answer(question, persona, history)
                return {**out, "engine": "claude", "persona": persona, "cited_assets": sorted(set(re.findall(r"\b[A-Z]{2,5}-[A-Z0-9]{1,3}\b", out["answer"])) & set(self.tools.twin.assets))}
            except Exception as exc:
                note = self._handle_error(exc)
        out = self.offline.answer(question, persona, history)
        return {**out, "engine": "deterministic", "persona": persona, "note": note}

    def _handle_error(self, exc: Exception) -> str:
        a = self._claude.anthropic if self._claude else None
        if a and isinstance(exc, (a.AuthenticationError, a.PermissionDeniedError)):
            self.disabled_reason = "Claude credentials were rejected; using the offline analyst."
            return self.disabled_reason
        if a and isinstance(exc, a.RateLimitError):
            return "Claude is rate-limited right now; answered with the offline analyst."
        if a and isinstance(exc, a.BadRequestError):
            log.warning("Claude request rejected: %s", exc)
            return "Claude rejected the request; answered with the offline analyst."
        if a and isinstance(exc, a.APIStatusError):
            return f"Claude returned an error ({exc.status_code}); answered with the offline analyst."
        if a and isinstance(exc, a.APIConnectionError):
            return "Claude is unreachable; answered with the offline analyst."
        log.exception("Analyst failure")
        return "Claude was unavailable; answered with the offline analyst."
