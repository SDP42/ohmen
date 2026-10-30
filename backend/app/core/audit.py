"""Tamper-evident audit trail.

Every decision (asset edits, approved mitigations, scenario runs, reports) is appended as a
record whose hash covers its content and the previous record's hash. Changing any past
record breaks every hash after it, which `verify()` detects.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

GENESIS = "0" * 64


def _digest(record: dict) -> str:
    body = {k: record[k] for k in ("seq", "ts", "actor", "action", "target", "details", "prev_hash")}
    return hashlib.sha256(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()


class AuditLog:
    def __init__(self, records: list[dict] | None = None):
        self.records: list[dict] = list(records or [])

    @property
    def head(self) -> str:
        return self.records[-1]["hash"] if self.records else GENESIS

    def append(self, actor: str, action: str, target: str | None, details: dict | None = None) -> dict:
        record = {
            "seq": len(self.records) + 1,
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "actor": actor,
            "action": action,
            "target": target,
            "details": details or {},
            "prev_hash": self.head,
        }
        record["hash"] = _digest(record)
        self.records.append(record)
        return record

    def verify(self) -> dict:
        prev = GENESIS
        for r in self.records:
            if r["prev_hash"] != prev or _digest(r) != r["hash"]:
                return {"valid": False, "broken_at": r["seq"], "records": len(self.records), "head": self.head}
            prev = r["hash"]
        return {"valid": True, "broken_at": None, "records": len(self.records), "head": self.head}
