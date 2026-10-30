"""Intelligence: vulnerabilities, risk ranking, forecast, ML model and threat intel feeds."""

from __future__ import annotations

import time

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..core import forecast as forecast_mod
from ..core import risk
from ..store import Store
from .deps import get_store

router = APIRouter(prefix="/api", tags=["intelligence"])
KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
OT_KEYWORDS = ("scada", "plc", "hmi", "ics", "industrial", "rtu", "gateway", "router", "vpn", "firewall", "modbus", "dnp3", "historian", "remote access")
_kev_cache: dict = {}


@router.get("/vulnerabilities")
def vulnerabilities(store: Store = Depends(get_store)) -> list[dict]:
    twin = store.twin
    rows = []
    for adv in sorted(twin.advisories.values(), key=lambda a: a["published"], reverse=True):
        matches = [{"asset": aid, "status": m["status"], "reason": m["reason"], "version": m["software"]["version"]}
                   for aid, ms in twin.matches().items() for m in ms if m["advisory_id"] == adv["id"]] if adv.get("ingested", True) else []
        rows.append({**adv, "matches": matches, "confirmed": sum(m["status"] == "confirmed" for m in matches),
                     "potential": sum(m["status"] == "potential" for m in matches)})
    return rows


class Weights(BaseModel):
    vulnerability: float = 1.0
    known_exploitation: float = 1.0
    exposure: float = 1.0
    reachability: float = 1.0
    activity: float = 1.0
    criticality: float = 1.0
    redundancy: float = 1.0


def _ranking(store: Store, weights: dict | None) -> dict:
    r = store.risk(weights)
    preds = store.ml.predict(store.twin, r)
    rows = []
    for aid in r["ranking"]:
        row = risk.public_row(r["assets"][aid])
        exp_pop = sum(c.get("population") or 0 for c in risk.explain(store.twin, r, aid)["consequences"])
        rows.append({**row, "ml_probability": preds.get(aid), "population_downstream": exp_pop})
    return {"weights": r["weights"], "systemic_risk_index": r["systemic_risk_index"], "threat_level": r["threat_level"], "counts": r["counts"], "assets": rows}


@router.get("/risk")
def ranking(store: Store = Depends(get_store)) -> dict:
    return _ranking(store, None)


@router.post("/risk/recompute")
def recompute(weights: Weights, store: Store = Depends(get_store)) -> dict:
    return _ranking(store, weights.model_dump())


@router.get("/risk/compare")
def compare(a: str, b: str, store: Store = Depends(get_store)) -> dict:
    r = store.risk()
    for x in (a, b):
        if x not in r["assets"]:
            raise HTTPException(404, f"{x} is not a scored cyber asset")
    return {"a": risk.explain(store.twin, r, a), "b": risk.explain(store.twin, r, b)}


@router.get("/risk/forecast")
def forecast(store: Store = Depends(get_store), days: int = 14) -> dict:
    return forecast_mod.forecast(store.twin, days=max(3, min(days, 30)), plan=store.plan())


@router.get("/ml/model-card")
def model_card(store: Store = Depends(get_store)) -> dict:
    r = store.risk()
    preds = store.ml.predict(store.twin, r)
    return {**store.ml.card, "agreement": store.ml.agreement(r, preds),
            "predictions": [{"id": aid, "rule": r["assets"][aid]["likelihood"], "ml": p} for aid, p in preds.items()]}


@router.get("/intel/feed")
def feed(store: Store = Depends(get_store)) -> dict:
    vulns = [e for e in store.events if e["type"] == "vuln_detected"][::-1]
    pending = [a["id"] for a in store.twin.advisories.values() if not a.get("ingested", True)]
    return {"advisories": vulnerabilities(store), "detections": vulns, "pending_ingestion": pending, "kev": _kev_cache.get("summary")}


@router.post("/intel/sync-kev")
def sync_kev(store: Store = Depends(get_store)) -> dict:
    """Pull the public CISA Known Exploited Vulnerabilities catalogue and show OT-relevant entries."""
    if _kev_cache.get("fetched") and time.time() - _kev_cache["fetched"] < 3600:
        return _kev_cache["summary"]
    try:
        resp = httpx.get(KEV_URL, timeout=12.0, follow_redirects=True)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        raise HTTPException(502, f"Could not reach the CISA KEV feed: {exc}") from exc
    items = data.get("vulnerabilities", [])
    vendors = {(a.get("vendor") or "").lower() for a in store.twin.assets.values()}
    relevant = [v for v in items if any(k in f"{v.get('product', '')} {v.get('shortDescription', '')} {v.get('vulnerabilityName', '')}".lower() for k in OT_KEYWORDS)]
    relevant.sort(key=lambda v: v.get("dateAdded", ""), reverse=True)
    summary = {
        "catalog_version": data.get("catalogVersion"), "date_released": data.get("dateReleased"), "total": len(items),
        "ot_relevant": len(relevant), "inventory_vendor_matches": sum(1 for v in items if (v.get("vendorProject") or "").lower() in vendors),
        "latest": [{k: v.get(k) for k in ("cveID", "vendorProject", "product", "vulnerabilityName", "dateAdded", "shortDescription", "knownRansomwareCampaignUse")}
                   for v in relevant[:20]],
        "note": "Live public catalogue. The simulated inventory uses fictional vendors, so direct matches are not expected.",
    }
    _kev_cache.update({"fetched": time.time(), "summary": summary})
    store.record("system", "kev_synced", "cisa-kev", {"total": len(items), "ot_relevant": len(relevant)})
    return summary
