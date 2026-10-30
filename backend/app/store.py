"""Live state of the twin: baseline configuration, evidence, remediation work and history.

Configuration changes (asset edits, approved mitigations) are persisted as documents.
Evidence (events) is replayed into transient state on startup: advisory ingestion and
suspicious-activity levels. Every risk-changing event records a snapshot, which powers the
Time Machine.
"""

from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone

from .core import mitigation, risk
from .core.audit import AuditLog
from .core.graph import consequence_metrics
from .core.ml import LikelihoodModel
from .core.model import Twin
from .core.resilience import spof
from .db import Database
from .seed.mumbai import HISTORY, build_dataset

EDITABLE = {"criticality", "redundancy", "exposure", "auth", "monitoring", "status", "remote_access", "internet_facing",
            "owner", "description", "software"}
ENUMS = {
    "redundancy": {"none", "low", "medium", "high", "n/a"},
    "exposure": {"isolated", "internal", "restricted", "exposed"},
    "auth": {"strong", "moderate", "weak", "default", "n/a"},
    "status": {"active", "degraded", "unavailable", "isolated"},
}
RISK_EVENTS = {"vuln_detected", "unusual_connection", "auth_failure", "unexpected_comm", "alert", "incident_closed",
               "mitigation_applied", "config_change", "status_change", "asset_update"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class StoreError(ValueError):
    pass


class Store:
    def __init__(self, db: Database):
        self.db = db
        self.lock = threading.RLock()
        self.ml = LikelihoodModel()
        self.demo = {"running": False, "step": 0, "total": 0}
        self.ambient = True
        self.load()

    # ------------------------------------------------------------------ lifecycle
    def load(self) -> None:
        with self.lock:
            if not self.db.documents("asset"):
                self._seed()
            data = {
                "assets": self.db.documents("asset"),
                "cyber_edges": self.db.documents("cyber_edge"),
                "ops_edges": self.db.documents("ops_edge"),
                "advisories": self.db.documents("advisory"),
            }
            self.twin = Twin.from_dataset(data)
            self.events: list[dict] = self.db.events()
            self.audit = AuditLog(self.db.audit())
            self.tasks: list[dict] = self.db.documents("task")
            self.scenarios: list[dict] = self.db.documents("scenario")
            self._replay()

    def reset(self) -> None:
        with self.lock:
            self.db.wipe()
            self.demo = {"running": False, "step": 0, "total": 0}
            self.load()

    def _seed(self) -> None:
        data = build_dataset()
        self.db.upsert_many("asset", data["assets"])
        self.db.upsert_many("cyber_edge", data["cyber_edges"])
        self.db.upsert_many("ops_edge", data["ops_edges"])
        self.db.upsert_many("advisory", data["advisories"])
        start = datetime.now(timezone.utc)
        for i, h in enumerate(HISTORY, start=1):
            ts = (start - timedelta(hours=h["hours_ago"])).isoformat(timespec="seconds")
            spec = {k: v for k, v in h.items() if k != "hours_ago"}
            if spec["type"] == "vuln_detected" and "SIM-2026-0472" in spec["title"]:
                spec["advisory_id"] = "SIM-2026-0472"
            self.db.add_event(self._event_record(spec, f"EVT-{i:04d}", ts))
        log = AuditLog()
        rec = log.append("system", "twin_seeded", "twin", {"assets": len(data["assets"]), "dataset": "Synthetic Mumbai distribution network"})
        self.db.add_audit(rec)

    def _replay(self) -> None:
        self.twin.activity = {}
        for adv in self.twin.advisories.values():
            if adv["id"] == "SIM-2026-0417":
                adv["ingested"] = False
        self.twin.touch()
        self.snapshots: list[dict] = [self._snapshot(None, "Model baseline", self.events[0]["ts"] if self.events else now_iso())]
        for evt in self.events:
            if self._apply_effects(evt):
                self.snapshots.append(self._snapshot(evt))

    # ------------------------------------------------------------------ events
    def _event_record(self, spec: dict, event_id: str, ts: str) -> dict:
        return {
            "id": event_id, "ts": ts, "asset_id": spec.get("asset_id"), "type": spec["type"], "severity": spec.get("severity", "info"),
            "title": spec["title"], "detail": spec.get("detail", ""), "source": spec.get("source"), "destination": spec.get("destination"),
            "protocol": spec.get("protocol"), "advisory_id": spec.get("advisory_id"), "activity": spec.get("activity"),
            "evidence": "Synthetic event record", "classification": "observed", "actor": spec.get("actor", "sensor"),
        }

    def _apply_effects(self, evt: dict) -> bool:
        t = self.twin
        kind = evt["type"]
        if kind == "vuln_detected" and evt.get("advisory_id") in t.advisories:
            t.advisories[evt["advisory_id"]]["ingested"] = True
            t.touch()
            return True
        if kind in {"unusual_connection", "auth_failure", "unexpected_comm", "alert"}:
            target = evt.get("destination") if kind != "alert" else evt.get("asset_id")
            if evt.get("activity") and evt.get("asset_id"):
                t.bump_activity(evt["asset_id"], evt["activity"], evt["id"])
            elif target in t.assets and t.assets[target]["category"] == "cyber":
                t.bump_activity(target, "unusual", evt["id"])
            src = evt.get("source")
            if kind == "unexpected_comm" and src in t.assets and t.assets[src]["category"] == "cyber" and src != evt.get("asset_id"):
                t.bump_activity(src, "unusual", evt["id"])
            return True
        if kind == "incident_closed" and evt.get("asset_id"):
            t.activity.pop(evt["asset_id"], None)
            t.touch()
            return True
        return kind in RISK_EVENTS

    def add_event(self, spec: dict) -> tuple[dict, dict | None]:
        with self.lock:
            evt = self._event_record(spec, f"EVT-{len(self.events) + 1:04d}", now_iso())
            self.db.add_event(evt)
            self.events.append(evt)
            snap = self._snapshot(evt) if self._apply_effects(evt) else None
            if snap:
                self.snapshots.append(snap)
            return evt, snap

    def _snapshot(self, evt: dict | None, label: str | None = None, ts: str | None = None) -> dict:
        r = risk.compute(self.twin)
        return {
            "index": len(getattr(self, "snapshots", [])),
            "ts": evt["ts"] if evt else ts or now_iso(),
            "event_id": evt["id"] if evt else None,
            "title": evt["title"] if evt else label,
            "severity": evt["severity"] if evt else "info",
            "asset_id": evt.get("asset_id") if evt else None,
            "sri": r["systemic_risk_index"],
            "threat_level": r["threat_level"],
            "counts": r["counts"],
            "top": [{"id": i, "score": r["assets"][i]["score"], "priority": r["assets"][i]["priority"]} for i in r["ranking"][:5]],
            "scores": {i: row["score"] for i, row in r["assets"].items()},
        }

    def record(self, actor: str, action: str, target: str | None, details: dict | None = None) -> dict:
        with self.lock:
            rec = self.audit.append(actor, action, target, details)
            self.db.add_audit(rec)
            return rec

    # ------------------------------------------------------------------ views
    def risk(self, weights: dict | None = None) -> dict:
        return risk.compute(self.twin, weights)

    def summary(self) -> dict:
        r = self.risk()
        spofs = [s for s in spof(self.twin) if s["is_spof"]]
        open_incidents = [aid for aid, rec in self.twin.activity.items() if rec.get("level") in {"repeated", "confirmed"}]
        investigating = [aid for aid, rec in self.twin.activity.items() if rec.get("level")]
        services = []
        for node, info in sorted(r["service_risk"].items(), key=lambda kv: -kv[1]["likelihood"]):
            a = self.twin.assets[node]
            services.append({"id": node, "name": a["name"], "type": a.get("facility_type", a["type"]), "population": a.get("population"),
                             "backup_hours": a.get("backup_hours"), **info})
        physical = [a for a in self.twin.assets.values() if a["category"] == "physical"]
        return {
            "monitored_assets": len(self.twin.cyber_ids()) + len(physical),
            "cyber_assets": len(self.twin.cyber_ids()),
            "physical_assets": len(physical),
            "high_risk_assets": r["counts"]["NOW"],
            "critical_dependencies": len(spofs),
            "open_incidents": len(open_incidents),
            "under_investigation": investigating,
            "systemic_risk_index": r["systemic_risk_index"],
            "threat_level": r["threat_level"],
            "counts": r["counts"],
            "top": [risk.public_row(r["assets"][i]) for i in r["ranking"][:6]],
            "services": services,
            "population_served": sum(a.get("population", 0) for a in self.twin.assets.values() if a["type"] == "zone"),
            "events_total": len(self.events),
            "demo": self.demo,
            "ambient": self.ambient,
            "advisories_ingested": sum(1 for a in self.twin.advisories.values() if a.get("ingested", True)),
            "generated_at": now_iso(),
        }

    def asset_events(self, asset_id: str, limit: int = 25) -> list[dict]:
        rows = [e for e in self.events if asset_id in {e.get("asset_id"), e.get("source"), e.get("destination")}]
        return rows[-limit:][::-1]

    # ------------------------------------------------------------------ mutations
    def _persist_twin(self) -> None:
        self.db.upsert_many("asset", list(self.twin.assets.values()))
        self.db.upsert_many("cyber_edge", list(self.twin.cyber_edges.values()))
        self.db.upsert_many("ops_edge", list(self.twin.ops_edges.values()))

    def update_asset(self, asset_id: str, patch: dict, actor: str = "operator") -> dict:
        with self.lock:
            asset = self.twin.assets.get(asset_id)
            if not asset:
                raise StoreError(f"Unknown asset {asset_id}")
            changes = {}
            for key, value in patch.items():
                if key not in EDITABLE:
                    raise StoreError(f"Field '{key}' is not editable")
                if key in ENUMS and value not in ENUMS[key]:
                    raise StoreError(f"{key} must be one of {sorted(ENUMS[key])}")
                if key == "criticality" and (not isinstance(value, int) or not 1 <= value <= 5):
                    raise StoreError("criticality must be an integer from 1 to 5")
                if key == "monitoring" and not (isinstance(value, (int, float)) and 0 <= value <= 1):
                    raise StoreError("monitoring must be between 0 and 1")
                if asset.get(key) != value:
                    changes[key] = {"from": asset.get(key), "to": value}
                    asset[key] = value
            if not changes:
                return {"asset": asset, "changes": {}}
            self.twin.touch()
            self.db.upsert("asset", asset_id, asset)
            kind = "status_change" if "status" in changes else "config_change"
            title = (f"{asset_id} status changed to {changes['status']['to']}" if "status" in changes
                     else f"{asset_id} updated: {', '.join(changes)}")
            evt, snap = self.add_event({"asset_id": asset_id, "type": kind, "severity": "medium" if "status" in changes else "low",
                                        "title": title, "detail": "Digital twin updated by an operator. Risk recalculated.", "actor": actor})
            self.record(actor, "asset_updated", asset_id, {"changes": changes})
            return {"asset": asset, "changes": changes, "event": evt, "snapshot": snap}

    def add_edge(self, edge: dict, actor: str = "operator") -> dict:
        with self.lock:
            for end in ("source", "target"):
                if edge.get(end) not in self.twin.assets:
                    raise StoreError(f"Unknown {end} asset {edge.get(end)}")
            eid = edge.get("id") or f"C-U{len(self.twin.cyber_edges) + 1:02d}"
            if eid in self.twin.cyber_edges:
                raise StoreError(f"Connection {eid} already exists")
            record = {"id": eid, "kind": "logical", "source": edge["source"], "target": edge["target"], "protocol": edge.get("protocol", "TCP"),
                      "port": edge.get("port"), "purpose": edge.get("purpose", "Added by operator"), "policy": edge.get("policy", "allowed"),
                      "encrypted": bool(edge.get("encrypted", False)), "authenticated": bool(edge.get("authenticated", False)),
                      "bidirectional": bool(edge.get("bidirectional", False)), "status": "active", "monitored": bool(edge.get("monitored", False)),
                      "last_observed_hours": 0.0}
            self.twin.cyber_edges[eid] = record
            self.twin.touch()
            self.db.upsert("cyber_edge", eid, record)
            evt, snap = self.add_event({"asset_id": edge["target"], "type": "config_change", "severity": "low",
                                        "title": f"Connection {edge['source']} → {edge['target']} added to the model",
                                        "detail": record["purpose"], "source": edge["source"], "destination": edge["target"], "actor": actor})
            self.record(actor, "connection_added", eid, record)
            return {"edge": record, "event": evt, "snapshot": snap}

    def remove_edge(self, edge_id: str, actor: str = "operator") -> dict:
        with self.lock:
            edge = self.twin.cyber_edges.pop(edge_id, None)
            if not edge:
                raise StoreError(f"Unknown connection {edge_id}")
            self.twin.touch()
            self.db.delete_document("cyber_edge", edge_id)
            evt, snap = self.add_event({"asset_id": edge["target"], "type": "config_change", "severity": "low",
                                        "title": f"Connection {edge['source']} → {edge['target']} removed from the model",
                                        "detail": f"{edge['protocol']} {edge_id}", "actor": actor})
            self.record(actor, "connection_removed", edge_id, edge)
            return {"removed": edge, "event": evt, "snapshot": snap}

    # ------------------------------------------------------------------ remediation tasks
    def create_task(self, mitigation_id: str, owner: str | None = None, due_days: int | None = None, actor: str = "operator") -> dict:
        with self.lock:
            info = mitigation.describe(self.twin, mitigation_id)
            task = {"id": f"TASK-{len(self.tasks) + 1:03d}", **info, "mitigation_id": mitigation_id, "status": "proposed",
                    "owner": owner or "OT Security", "due_days": due_days if due_days is not None else 3, "created": now_iso(), "history": []}
            self.tasks.append(task)
            self.db.upsert("task", task["id"], task)
            self.record(actor, "task_proposed", task["id"], {"mitigation": mitigation_id})
            return task

    def update_task(self, task_id: str, status: str, actor: str = "operator") -> dict:
        allowed = {"proposed", "approved", "in_progress", "done", "rejected"}
        if status not in allowed:
            raise StoreError(f"status must be one of {sorted(allowed)}")
        with self.lock:
            task = next((t for t in self.tasks if t["id"] == task_id), None)
            if not task:
                raise StoreError(f"Unknown task {task_id}")
            if task["status"] == "done":
                raise StoreError("Task already completed")
            before = risk.compute(self.twin)
            task["history"].append({"ts": now_iso(), "from": task["status"], "to": status, "actor": actor})
            task["status"] = status
            out = {"task": task}
            if status == "done":
                applied = mitigation.apply(self.twin, task["mitigation_id"])
                self._persist_twin()
                after = risk.compute(self.twin)
                evt, snap = self.add_event({"asset_id": applied["target"] if applied["target"] in self.twin.assets else None,
                                            "type": "mitigation_applied", "severity": "info", "title": f"Mitigation applied: {applied['title']}",
                                            "detail": f"Systemic risk {before['systemic_risk_index']} → {after['systemic_risk_index']}.", "actor": actor})
                if applied["type"] == "investigate":
                    evt2, snap2 = self.add_event({"asset_id": applied["target"], "type": "incident_closed", "severity": "info",
                                                  "title": f"Investigation closed on {applied['target']}",
                                                  "detail": "Evidence triaged, credentials rotated, activity resolved.", "actor": actor})
                    snap = snap2 or snap
                task["result"] = {"sri_before": before["systemic_risk_index"], "sri_after": risk.compute(self.twin)["systemic_risk_index"]}
                out.update({"event": evt, "snapshot": snap})
            self.db.upsert("task", task_id, task)
            self.record(actor, f"task_{status}", task_id, {"mitigation": task["mitigation_id"]})
            return out

    def plan(self) -> list[tuple[int, str]]:
        return [(int(t.get("due_days", 3)), t["mitigation_id"]) for t in self.tasks if t["status"] in {"proposed", "approved", "in_progress"}]

    # ------------------------------------------------------------------ scenarios
    def remember_scenario(self, result: dict, actor: str = "operator") -> dict:
        imp = result["impact"]
        summary = {"id": result["id"], "ts": now_iso(), "config": result["config"], "seeds": result["seeds"],
                   "impact": {k: imp[k] for k in ("digital_assets_reachable", "operational_assets_affected", "citizens_without_power",
                                                  "essential_services_affected", "hospitals_affected", "time_to_harm_hours", "systemic_impact_score")}}
        with self.lock:
            self.scenarios = [s for s in self.scenarios if s["id"] != summary["id"]] + [summary]
            self.db.upsert("scenario", summary["id"], summary)
            self.record(actor, "scenario_run", summary["id"], {"config": result["config"]})
        return summary

    def facility_impact(self, asset_id: str) -> dict | None:
        eff = risk.controller_effect(self.twin, asset_id)
        return consequence_metrics(self.twin, eff.cascade) if eff else None
