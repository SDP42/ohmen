"""Real-time layer: WebSocket hub, the deterministic flagship demo and ambient telemetry."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import random

from fastapi import WebSocket

from .core import risk
from .seed.mumbai import AMBIENT, FLAGSHIP
from .store import Store

log = logging.getLogger("ohmen.live")


class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    async def broadcast(self, message: dict) -> None:
        for ws in list(self.clients):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(ws)


async def publish(store: Store, hub: Hub, evt: dict, snap: dict | None) -> None:
    await hub.broadcast({"type": "event", "event": evt})
    if snap:
        await hub.broadcast({"type": "risk", "snapshot": snap, "summary": store.summary()})


async def run_flagship(store: Store, hub: Hub) -> None:
    """Replay the blueprint's flagship demonstration step by step."""
    if store.demo["running"]:
        return
    store.demo = {"running": True, "step": 0, "total": len(FLAGSHIP)}
    await hub.broadcast({"type": "demo", "demo": store.demo})
    loop = asyncio.get_running_loop()
    start = loop.time()
    try:
        for i, step in enumerate(FLAGSHIP, start=1):
            await asyncio.sleep(max(0.0, start + step["delay"] - loop.time()))
            spec = {k: v for k, v in step.items() if k != "delay"}
            if spec["type"] == "vuln_detected":
                spec["advisory_id"] = "SIM-2026-0417"
            if spec["type"] == "alert":
                r = risk.compute(store.twin)
                row = r["assets"][spec["asset_id"]]
                spec["detail"] += f" Priority {row['score']:.0f} ({row['priority']}), rank #{row['rank']} of {len(r['assets'])}."
            evt, snap = store.add_event(spec)
            store.demo = {"running": i < len(FLAGSHIP), "step": i, "total": len(FLAGSHIP)}
            await publish(store, hub, evt, snap)
            await hub.broadcast({"type": "demo", "demo": store.demo})
        store.record("system", "flagship_demo_completed", "GW-001", {"steps": len(FLAGSHIP)})
    finally:
        store.demo["running"] = False


async def ambient_loop(store: Store, hub: Hub, seed: int = 11) -> None:
    """Low-severity telemetry that keeps the event stream alive without moving risk."""
    rng = random.Random(seed)
    while True:
        await asyncio.sleep(rng.uniform(7.0, 13.0))
        if not store.ambient or store.demo["running"]:
            continue
        with contextlib.suppress(Exception):
            evt, snap = store.add_event(dict(rng.choice(AMBIENT)))
            await publish(store, hub, evt, snap)
