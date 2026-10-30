"""Twin state: summary, assets, graphs, events and the time machine."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ..core import mitigation, risk
from ..core.graph import observed_edges
from ..core.model import CRITICALITY_LABEL
from ..live import Hub, publish
from ..store import Store
from .deps import get_hub, get_store

router = APIRouter(prefix="/api", tags=["twin"])

ZONE_NAMES = {
    "internet": ("Public Internet", 5), "corporate": ("Corporate IT", 4), "vendor": ("Vendor network", 5),
    "dmz": ("Industrial DMZ", 3.5), "supervisory": ("Supervisory control", 3), "dr": ("Disaster recovery", 3),
    "sub-a": ("Substation A LAN", 2), "sub-b": ("Substation B LAN", 2), "sub-c": ("Substation C LAN", 2),
    "sub-d": ("Substation D LAN", 2), "sub-e": ("Substation E LAN", 2), "bench": ("Isolated test bench", 1),
}


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "ohmen"}


@router.get("/twin/summary")
def summary(store: Store = Depends(get_store)) -> dict:
    return store.summary()


def _node(store: Store, a: dict, r: dict) -> dict:
    row = r["assets"].get(a["id"])
    keys = ("id", "name", "type", "category", "site", "site_name", "lat", "lon", "zone", "purdue_level", "criticality", "status",
            "redundancy", "exposure", "auth", "monitoring", "internet_facing", "remote_access", "vendor", "model", "ip", "population",
            "facility_type", "backup_hours", "beds", "polygon", "peak_mw", "description")
    out = {k: a.get(k) for k in keys if k in a}
    out["risk"] = risk.public_row(row) if row else None
    out["service_risk"] = r["service_risk"].get(a["id"])
    out["activity"] = store.twin.activity_level(a["id"])
    return out


@router.get("/graph")
def graph(store: Store = Depends(get_store)) -> dict:
    twin = store.twin
    r = store.risk()
    zones = {}
    for a in twin.assets.values():
        if a["category"] in {"cyber", "entry"}:
            name, level = ZONE_NAMES.get(a["zone"], (a["zone"], None))
            zones.setdefault(a["zone"], {"id": a["zone"], "name": name, "purdue_level": level, "members": []})["members"].append(a["id"])
    edges = []
    for e in twin.cyber_edges.values():
        src, dst = twin.assets[e["source"]], twin.assets[e["target"]]
        edges.append({**e, "crosses_zone": src.get("zone") != dst.get("zone")})
    return {
        "nodes": [_node(store, a, r) for a in twin.assets.values()],
        "cyber_edges": edges,
        "ops_edges": list(twin.ops_edges.values()),
        "observed_edges": observed_edges(twin, store.events),
        "zones": list(zones.values()),
        "systemic_risk_index": r["systemic_risk_index"],
        "threat_level": r["threat_level"],
    }


@router.get("/assets")
def assets(store: Store = Depends(get_store), category: str | None = None) -> list[dict]:
    r = store.risk()
    return [_node(store, a, r) for a in store.twin.assets.values() if not category or a["category"] == category]


@router.get("/assets/{asset_id}")
def asset(asset_id: str, store: Store = Depends(get_store)) -> dict:
    twin = store.twin
    a = twin.assets.get(asset_id)
    if not a:
        raise HTTPException(404, f"Unknown asset {asset_id}")
    r = store.risk()
    out: dict[str, Any] = {"asset": {**a, "criticality_label": CRITICALITY_LABEL.get(a.get("criticality", 0))}, "activity": twin.activity.get(asset_id)}
    out["matches"] = [{**m, "advisory": twin.advisories[m["advisory_id"]]} for m in twin.matches().get(asset_id, [])]
    out["cyber_in"] = [e for e in twin.cyber_edges.values() if e["target"] == asset_id]
    out["cyber_out"] = [e for e in twin.cyber_edges.values() if e["source"] == asset_id]
    out["ops_in"] = twin.ops_in(asset_id)
    out["ops_out"] = twin.ops_out(asset_id)
    out["events"] = store.asset_events(asset_id)
    out["service_risk"] = r["service_risk"].get(asset_id)
    if asset_id in r["assets"]:
        out["risk"] = risk.explain(twin, r, asset_id)
        out["counterfactuals"] = mitigation.counterfactuals(twin, asset_id)
        preds = store.ml.predict(twin, r)
        out["ml"] = {"probability": preds.get(asset_id), "attribution": store.ml.attribution(twin, r["assets"][asset_id])}
    out["impact_if_manipulated"] = store.facility_impact(asset_id)
    return out


class AssetPatch(BaseModel):
    criticality: int | None = None
    redundancy: str | None = None
    exposure: str | None = None
    auth: str | None = None
    monitoring: float | None = None
    status: str | None = None
    remote_access: bool | None = None
    internet_facing: bool | None = None
    owner: str | None = None
    description: str | None = None


@router.patch("/assets/{asset_id}")
async def update_asset(asset_id: str, patch: AssetPatch, store: Store = Depends(get_store), hub: Hub = Depends(get_hub)) -> dict:
    out = store.update_asset(asset_id, patch.model_dump(exclude_none=True))
    if out.get("event"):
        await publish(store, hub, out["event"], out.get("snapshot"))
    return {"asset": out["asset"], "changes": out["changes"], "summary": store.summary()}


class EdgeIn(BaseModel):
    source: str
    target: str
    protocol: str = "TCP"
    port: int | None = None
    purpose: str = "Added by operator"
    policy: str = "allowed"
    encrypted: bool = False
    authenticated: bool = False
    bidirectional: bool = False
    monitored: bool = False


@router.post("/graph/edges")
async def add_edge(edge: EdgeIn, store: Store = Depends(get_store), hub: Hub = Depends(get_hub)) -> dict:
    out = store.add_edge(edge.model_dump())
    await publish(store, hub, out["event"], out.get("snapshot"))
    return {"edge": out["edge"]}


@router.delete("/graph/edges/{edge_id}")
async def remove_edge(edge_id: str, store: Store = Depends(get_store), hub: Hub = Depends(get_hub)) -> dict:
    out = store.remove_edge(edge_id)
    await publish(store, hub, out["event"], out.get("snapshot"))
    return {"removed": out["removed"]["id"]}


@router.get("/graph/dependencies/{asset_id}")
def dependencies(asset_id: str, store: Store = Depends(get_store)) -> dict:
    twin = store.twin
    if asset_id not in twin.assets:
        raise HTTPException(404, f"Unknown asset {asset_id}")
    first = {e["target"] for e in twin.logical_edges() if e["source"] == asset_id and e["status"] == "active"}
    first |= {e["source"] for e in twin.logical_edges() if e["target"] == asset_id and e["status"] == "active"}
    first |= {e["target"] for e in twin.ops_out(asset_id)} | {e["source"] for e in twin.ops_in(asset_id)}
    second: set[str] = set()
    for n in first:
        second |= {e["target"] for e in twin.logical_edges() if e["source"] == n and e["status"] == "active"}
        second |= {e["target"] for e in twin.ops_out(n)}
    second -= first | {asset_id}
    upstream, frontier = set(), [asset_id]
    while frontier:
        nxt = []
        for n in frontier:
            for e in twin.ops_in(n):
                if e["source"] not in upstream:
                    upstream.add(e["source"])
                    nxt.append(e["source"])
        frontier = nxt
    return {"asset": asset_id, "first_order": sorted(first), "second_order": sorted(second), "upstream": sorted(upstream),
            "impact_if_manipulated": store.facility_impact(asset_id)}


@router.get("/events")
def events(store: Store = Depends(get_store), limit: int = 60) -> list[dict]:
    return store.events[-limit:][::-1]


@router.get("/timeline")
def timeline(store: Store = Depends(get_store)) -> list[dict]:
    return store.snapshots


@router.websocket("/ws")
async def ws(websocket: WebSocket) -> None:
    hub: Hub = websocket.app.state.hub
    store: Store = websocket.app.state.store
    await hub.connect(websocket)
    try:
        await websocket.send_json({"type": "hello", "summary": store.summary(), "events": store.events[-25:][::-1]})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(websocket)
    except Exception:
        hub.disconnect(websocket)
