"""The in-memory digital twin: assets, two distinct relationship graphs and live state.

The twin keeps cyber communication and operational dependency relationships in separate
structures. A hospital depending on a substation's power does not make the hospital's
digital systems reachable from that substation, so the two are never merged.
"""

from __future__ import annotations

import re
from copy import deepcopy
from dataclasses import dataclass, field

Version = tuple[int, int, int]

EXPLOIT_SCORE = {"none": 0.2, "poc": 0.5, "functional": 0.8, "weaponized": 1.0}
AUTH_WEAKNESS = {"strong": 0.1, "moderate": 0.4, "weak": 0.75, "default": 1.0, "n/a": 0.0}
EXPOSURE_SCORE = {"isolated": 0.05, "internal": 0.3, "restricted": 0.55, "exposed": 0.9}
ACTIVITY_SCORE = {None: 0.0, "none": 0.0, "unusual": 0.5, "repeated": 0.8, "confirmed": 1.0}
REDUNDANCY_FACTOR = {"none": 1.0, "low": 0.85, "medium": 0.6, "high": 0.4, "n/a": 0.7}
CRITICALITY_LABEL = {0: "n/a", 1: "Low", 2: "Medium", 3: "High", 4: "Critical", 5: "Very high"}
MATCH_CONFIDENCE = {"confirmed": 1.0, "potential": 0.6, "not_applicable": 0.0}
UNTRUSTED_ZONES = {"internet", "corporate", "vendor"}
CONTROL_PROTOCOLS = {"DNP3", "Modbus/TCP", "IEC 60870-5-104", "IEC 61850 MMS", "Engineering/TCP"}
MANAGEMENT_PROTOCOLS = {"SSH", "RDP", "Telnet", "HTTPS"}


def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


# --------------------------------------------------------------------------- versions


def _norm(text: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def _pad(nums: list[int]) -> Version:
    nums = (nums + [0, 0, 0])[:3]
    return nums[0], nums[1], nums[2]


def version_interval(raw: str) -> tuple[Version, Version, bool]:
    """Return a half-open interval [lo, hi) covering the recorded version.

    An exact '2.4.1' collapses to a point. A partial '2.4' or '4.0.x' widens to every
    build that could carry that label, which is what lets the matcher say "potential".
    """
    text = raw.strip().lower()
    nums = [int(p) for p in re.findall(r"\d+", text)]
    exact = len(nums) >= 3 and not text.endswith(("x", "*"))
    if exact:
        lo = _pad(nums)
        return lo, (lo[0], lo[1], lo[2] + 1), True
    nums = nums or [0]
    lo = _pad(nums)
    hi_list = list(nums)
    hi_list[-1] += 1
    return lo, _pad(hi_list), False


def affected_interval(spec: str) -> tuple[Version, Version]:
    lo: Version = (0, 0, 0)
    hi: Version = (10_000, 0, 0)
    for clause in spec.split(","):
        clause = clause.strip()
        m = re.match(r"(>=|>|<=|<)\s*([\d.]+)", clause)
        if not m:
            continue
        op, ver = m.groups()
        v = _pad([int(p) for p in ver.split(".")])
        if op == ">=":
            lo = v
        elif op == ">":
            lo = (v[0], v[1], v[2] + 1)
        elif op == "<":
            hi = v
        elif op == "<=":
            hi = (v[0], v[1], v[2] + 1)
    return lo, hi


def fmt_version(v: Version) -> str:
    return ".".join(str(p) for p in v)


def match_software(software: dict, advisory: dict) -> dict | None:
    """Compare one inventory entry with one advisory. None means a different product."""
    if _norm(software.get("vendor")) != _norm(advisory["vendor"]) or _norm(software.get("product")) != _norm(advisory["product"]):
        return None
    a_lo, a_hi, exact = version_interval(software["version"])
    f_lo, f_hi = affected_interval(advisory["affected"])
    overlaps = a_lo < f_hi and f_lo < a_hi
    inside = f_lo <= a_lo and a_hi <= f_hi
    label = f"{software['vendor']} {software['product']} {software['version']}"
    if inside and exact:
        status, reason = "confirmed", f"{label} is inside the affected range {advisory['affected']}."
    elif inside:
        status, reason = "confirmed", f"Every build labelled '{software['version']}' falls inside {advisory['affected']}."
    elif overlaps:
        status = "potential"
        reason = (f"Inventory records '{software['version']}' without a full build number. Builds from "
                  f"{fmt_version(a_lo)} up to {fmt_version(a_hi)} are possible and part of that span is affected "
                  f"({advisory['affected']}). Validate on the device.")
    else:
        status = "not_applicable"
        reason = f"{label} is outside the affected range {advisory['affected']} (fixed in {advisory['fixed_version']})."
    return {"advisory_id": advisory["id"], "status": status, "reason": reason, "software": software}


def attack_vector(advisory: dict) -> str:
    m = re.search(r"AV:([NALP])", advisory.get("cvss_vector", ""))
    return m.group(1) if m else "N"


# --------------------------------------------------------------------------- twin


@dataclass
class Twin:
    assets: dict[str, dict]
    cyber_edges: dict[str, dict]
    ops_edges: dict[str, dict]
    advisories: dict[str, dict]
    activity: dict[str, dict] = field(default_factory=dict)
    version: int = 0
    _cache: dict = field(default_factory=dict, repr=False)

    @classmethod
    def from_dataset(cls, data: dict) -> "Twin":
        return cls(
            assets={a["id"]: a for a in data["assets"]},
            cyber_edges={e["id"]: e for e in data["cyber_edges"]},
            ops_edges={e["id"]: e for e in data["ops_edges"]},
            advisories={a["id"]: a for a in data["advisories"]},
            activity=deepcopy(data.get("activity", {})),
        )

    def clone(self) -> "Twin":
        return Twin(
            assets=deepcopy(self.assets),
            cyber_edges=deepcopy(self.cyber_edges),
            ops_edges=deepcopy(self.ops_edges),
            advisories=self.advisories,  # advisories are read-only reference data
            activity=deepcopy(self.activity),
            version=self.version,
        )

    def touch(self) -> None:
        self.version += 1
        self._cache.clear()

    # ---- views
    def cyber_ids(self) -> list[str]:
        return [a["id"] for a in self.assets.values() if a["category"] == "cyber"]

    def entry_ids(self) -> list[str]:
        return [a["id"] for a in self.assets.values() if a["category"] == "entry"]

    def is_operational(self, asset_id: str) -> bool:
        return self.assets.get(asset_id, {}).get("status", "active") not in {"unavailable", "isolated"}

    def matches(self) -> dict[str, list[dict]]:
        """Vulnerability matches for every asset, including not-applicable ones for transparency."""
        if "matches" not in self._cache:
            out: dict[str, list[dict]] = {}
            for asset in self.assets.values():
                rows = []
                for sw in asset.get("software", []):
                    for adv in self.advisories.values():
                        if not adv.get("ingested", True):
                            continue
                        m = match_software(sw, adv)
                        if m:
                            rows.append(m)
                out[asset["id"]] = rows
            self._cache["matches"] = out
        return self._cache["matches"]

    def open_matches(self, asset_id: str) -> list[dict]:
        return [m for m in self.matches().get(asset_id, []) if m["status"] != "not_applicable"]

    def activity_level(self, asset_id: str) -> str | None:
        return self.activity.get(asset_id, {}).get("level")

    def ops_in(self, node: str) -> list[dict]:
        idx = self._cache.get("ops_in")
        if idx is None:
            idx = {}
            for e in self.ops_edges.values():
                idx.setdefault(e["target"], []).append(e)
            self._cache["ops_in"] = idx
        return idx.get(node, [])

    def ops_out(self, node: str) -> list[dict]:
        idx = self._cache.get("ops_out")
        if idx is None:
            idx = {}
            for e in self.ops_edges.values():
                idx.setdefault(e["source"], []).append(e)
            self._cache["ops_out"] = idx
        return idx.get(node, [])

    def logical_edges(self) -> list[dict]:
        return [e for e in self.cyber_edges.values() if e["kind"] == "logical"]

    def zone_members(self) -> dict[str, list[str]]:
        if "zones" not in self._cache:
            zones: dict[str, list[str]] = {}
            for a in self.assets.values():
                if a["category"] == "cyber":
                    zones.setdefault(a["zone"], []).append(a["id"])
            self._cache["zones"] = zones
        return self._cache["zones"]

    def bump_activity(self, asset_id: str, level: str, event_id: str | None = None) -> None:
        order = ["none", "unusual", "repeated", "confirmed"]
        current = self.activity.get(asset_id, {}).get("level") or "none"
        if order.index(level) >= order.index(current):
            self.activity.setdefault(asset_id, {})["level"] = level
        rec = self.activity.setdefault(asset_id, {})
        rec.setdefault("events", [])
        if event_id:
            rec["events"].append(event_id)
        self.touch()
