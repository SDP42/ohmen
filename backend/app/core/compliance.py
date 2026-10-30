"""Coverage indicators for the CERT-In smart-city guideline areas named in PS 03, and an
ATT&CK for ICS detection-coverage map.

These are model-derived indicators of documented controls, not proof that controls work.
Validation still requires testing. The five areas are the ones the problem statement lists:
IoT security, continuous monitoring, vulnerability management, supply-chain security and
incident response.
"""

from __future__ import annotations

from .model import UNTRUSTED_ZONES, Twin
from .risk import compute

FIELD_TYPES = {"gateway", "rtu", "plc", "switch"}


def _score(x: float) -> int:
    return int(round(max(0.0, min(1.0, x)) * 100))


def certin(twin: Twin, audit_records: int = 0, scenarios_run: int = 0, tasks: list[dict] | None = None) -> dict:
    risk = compute(twin)
    cyber = [twin.assets[i] for i in twin.cyber_ids()]
    field = [a for a in cyber if a["type"] in FIELD_TYPES]
    tasks = tasks or []

    weak_field = [a["id"] for a in field if a.get("auth") in {"weak", "default"}]
    vuln_field = [a["id"] for a in field if twin.open_matches(a["id"])]
    exposed_field = [a["id"] for a in field if a.get("internet_facing")]
    iot = 1 - 0.45 * len(weak_field) / len(field) - 0.35 * len(vuln_field) / len(field) - 0.08 * len(exposed_field)

    logical = twin.logical_edges()
    unmonitored = [e["id"] for e in logical if not e.get("monitored") and e["status"] == "active"]
    low_mon = [a["id"] for a in cyber if a.get("monitoring", 0) < 0.4]
    avg_mon = sum(a.get("monitoring", 0) for a in cyber) / len(cyber)
    monitoring = 0.7 * avg_mon + 0.3 * (1 - len(unmonitored) / max(1, len(logical)))

    open_matches = [(a["id"], m) for a in cyber for m in twin.open_matches(a["id"])]
    kev_open = sorted({aid for aid, m in open_matches if twin.advisories[m["advisory_id"]]["kev"]})
    planned = {t["target"] for t in tasks if t.get("type") == "patch" and t.get("status") != "rejected"}
    potential = sorted({aid for aid, m in open_matches if m["status"] == "potential"})
    unplanned = sorted({aid for aid, _ in open_matches} - planned)
    vm = 1 - 0.5 * len(unplanned) / max(1, len({aid for aid, _ in open_matches}) or 1) - 0.08 * len(kev_open) - 0.04 * len(potential)

    third_party = [a for a in cyber if "third-party" in a.get("tags", []) or a.get("remote_access")]
    weak_third = [a["id"] for a in third_party if a.get("auth") in {"weak", "default", "moderate"}]
    vendor_paths = [e["id"] for e in logical if twin.assets[e["source"]]["zone"] == "vendor" or e["source"] in {a["id"] for a in third_party}]
    controlled = [e for e in logical if e["id"] in vendor_paths and e.get("policy") == "controlled"]
    vendors: dict[str, int] = {}
    for a in cyber:
        vendors[a.get("vendor") or "unknown"] = vendors.get(a.get("vendor") or "unknown", 0) + 1
    concentration = max(vendors.values()) / len(cyber)
    supply = 1 - 0.35 * len(weak_third) / max(1, len(third_party)) - 0.25 * (1 - len(controlled) / max(1, len(vendor_paths))) - 0.3 * concentration

    playbooks = 0.4
    ir = playbooks + min(0.3, 0.06 * scenarios_run) + min(0.2, 0.02 * audit_records) + (0.1 if risk["counts"]["NOW"] <= 3 else 0.0)

    def area(key: str, name: str, value: float, metrics: dict, gaps: list[dict]) -> dict:
        s = _score(value)
        return {"key": key, "name": name, "score": s, "status": "strong" if s >= 75 else "partial" if s >= 50 else "weak",
                "metrics": metrics, "gaps": gaps}

    areas = [
        area("iot", "IoT & field-device security", iot,
             {"field_devices": len(field), "weak_or_default_auth": len(weak_field), "with_open_vulnerabilities": len(vuln_field),
              "internet_facing": len(exposed_field)},
             [{"asset": i, "gap": "Weak or default authentication", "action": f"mfa:{i}"} for i in weak_field[:5]]
             + [{"asset": i, "gap": "Internet-facing field device", "action": f"restrict:{i}"} for i in exposed_field]),
        area("monitoring", "Continuous monitoring", monitoring,
             {"average_coverage": round(avg_mon, 2), "unmonitored_connections": len(unmonitored), "assets_below_40pct": len(low_mon)},
             [{"asset": i, "gap": "Monitoring coverage below 40%", "action": f"monitor:{i}"} for i in low_mon[:6]]),
        area("vulnerability", "Vulnerability management", vm,
             {"open_matches": len(open_matches), "known_exploited_open": len(kev_open), "unplanned_assets": len(unplanned),
              "potential_matches_to_validate": len(potential)},
             [{"asset": i, "gap": "Known-exploited vulnerability open", "action": f"patch:{i}"} for i in kev_open]
             + [{"asset": i, "gap": "Potential match needs validation", "action": None} for i in potential]),
        area("supply_chain", "Supply-chain security", supply,
             {"third_party_assets": len(third_party), "weak_third_party_auth": len(weak_third), "vendor_paths": len(vendor_paths),
              "controlled_vendor_paths": len(controlled), "largest_vendor_share": round(concentration, 2)},
             [{"asset": i, "gap": "Third-party access without strong authentication", "action": f"mfa:{i}"} for i in weak_third]),
        area("incident_response", "Incident response readiness", ir,
             {"scenario_drills": scenarios_run, "audit_records": audit_records, "now_priority_assets": risk["counts"]["NOW"]},
             ([{"asset": None, "gap": "Fewer than 5 scenario drills on record", "action": None}] if scenarios_run < 5 else [])),
    ]
    overall = round(sum(a["score"] for a in areas) / len(areas))
    return {"framework": "CERT-In smart-city guideline areas (as referenced in D3COY PS 03)", "overall": overall, "areas": areas,
            "disclaimer": "Model-derived coverage indicators of documented controls, not certification or proof of effectiveness."}


ATTCK_MATRIX = [
    ("Initial Access", "T0883", "Internet Accessible Device"),
    ("Initial Access", "T0822", "External Remote Services"),
    ("Initial Access", "T0866", "Exploitation of Remote Services"),
    ("Initial Access", "T0862", "Supply Chain Compromise"),
    ("Discovery", "T0846", "Remote System Discovery"),
    ("Discovery", "T0840", "Network Connection Enumeration"),
    ("Lateral Movement", "T0886", "Remote Services"),
    ("Lateral Movement", "T0812", "Default Credentials"),
    ("Lateral Movement", "T0843", "Program Download"),
    ("Command and Control", "T0869", "Standard Application Layer Protocol"),
    ("Inhibit Response Function", "T0878", "Alarm Suppression"),
    ("Inhibit Response Function", "T0814", "Denial of Service"),
    ("Impair Process Control", "T0855", "Unauthorized Command Message"),
    ("Impair Process Control", "T0836", "Modify Parameter"),
    ("Impact", "T0831", "Manipulation of Control"),
    ("Impact", "T0826", "Loss of Availability"),
    ("Impact", "T0829", "Loss of View"),
]


def attck_coverage(twin: Twin) -> dict:
    cyber = [twin.assets[i] for i in twin.cyber_ids()]
    logical = [e for e in twin.logical_edges() if e["status"] == "active"]

    def mon(ids: list[str]) -> float:
        vals = [twin.assets[i].get("monitoring", 0) for i in ids if i in twin.assets]
        return sum(vals) / len(vals) if vals else 0.0

    internet = [a["id"] for a in cyber if a.get("internet_facing")]
    remote = [a["id"] for a in cyber if a.get("remote_access")]
    vulnerable = [a["id"] for a in cyber if twin.open_matches(a["id"])]
    mgmt = [e for e in logical if e["protocol"] in {"SSH", "RDP", "Telnet"}]
    control = [e for e in logical if e["protocol"] in {"DNP3", "Modbus/TCP", "IEC 60870-5-104", "IEC 61850 MMS"}]
    default_auth = [a["id"] for a in cyber if a.get("auth") == "default"]
    plcs = [a["id"] for a in cyber if a["type"] == "plc"]
    scada = [a["id"] for a in cyber if a["type"] == "scada"]
    redundancy = [a for a in cyber if a.get("redundancy") in {"medium", "high"}]
    signals = {
        "T0883": mon(internet) - 0.2 * len(internet),
        "T0822": mon(remote) * (0.6 if any(a.get("auth") != "strong" for a in cyber if a["id"] in remote) else 1.0),
        "T0866": mon(vulnerable),
        "T0862": 0.25,
        "T0846": sum(e.get("monitored", False) for e in logical) / max(1, len(logical)),
        "T0840": mon([a["id"] for a in cyber if a["type"] == "switch"]),
        "T0886": sum(e.get("monitored", False) for e in mgmt) / max(1, len(mgmt)) * 0.9,
        "T0812": 0.15 if default_auth else 0.85,
        "T0843": mon(plcs) * 0.8,
        "T0869": 0.45,
        "T0878": mon(scada),
        "T0814": len(redundancy) / len(cyber),
        "T0855": sum(e.get("monitored", False) and e.get("authenticated", False) for e in control) / max(1, len(control)) + 0.1,
        "T0836": mon(plcs) * 0.7,
        "T0831": mon([a["id"] for a in cyber if a["type"] in {"rtu", "plc"}]) * 0.8,
        "T0826": len(redundancy) / len(cyber) * 0.9,
        "T0829": mon(scada) * 0.9,
    }
    cells = []
    for tactic, tid, name in ATTCK_MATRIX:
        v = max(0.0, min(1.0, signals[tid]))
        cells.append({"tactic": tactic, "technique_id": tid, "technique": name, "coverage": round(v, 2),
                      "status": "covered" if v >= 0.65 else "partial" if v >= 0.35 else "none"})
    return {"cells": cells, "summary": {s: sum(1 for c in cells if c["status"] == s) for s in ("covered", "partial", "none")},
            "disclaimer": "Indicates documented controls mapped in the model, not proof that detections fire. Validate with testing."}


def exposure_view(twin: Twin) -> dict:
    """What an adversary can see from untrusted networks (Ghost mode)."""
    from .graph import entry_reachability, path_to

    reach = entry_reachability(twin)
    rows = []
    for node, r in reach.items():
        if twin.assets[node]["category"] != "cyber" or r.likelihood < 0.05:
            continue
        rows.append({"id": node, "likelihood": round(r.likelihood, 3), "hops": r.hops, "path": path_to(reach, node),
                     "first_hop_from": path_to(reach, node)[0]})
    visible = [a["id"] for a in twin.assets.values() if a.get("internet_facing")]
    untrusted_edges = [e["id"] for e in twin.logical_edges() if e["status"] == "active" and twin.assets[e["source"]]["zone"] in UNTRUSTED_ZONES]
    return {"reachable": sorted(rows, key=lambda r: -r["likelihood"]), "internet_visible": visible, "entry_edges": untrusted_edges}
