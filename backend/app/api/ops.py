"""Operations: AI analyst, reports, compliance, audit, remediation tasks and demo control."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from ..core import compliance
from ..core.analyst import Analyst
from ..core.report import build as build_report
from ..live import Hub, publish, run_flagship
from ..store import Store
from .deps import get_analyst, get_hub, get_store

router = APIRouter(prefix="/api", tags=["operations"])


class Message(BaseModel):
    role: str
    content: str


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    persona: str = "analyst"
    history: list[Message] = Field(default_factory=list)


@router.get("/analyst/status")
def analyst_status(analyst: Analyst = Depends(get_analyst)) -> dict:
    return analyst.status()


@router.post("/analyst/ask")
def ask(body: AskIn, analyst: Analyst = Depends(get_analyst)) -> dict:
    return analyst.ask(body.question, body.persona, [m.model_dump() for m in body.history])


@router.get("/reports/risk")
def report(store: Store = Depends(get_store)) -> dict:
    rep = build_report(store)
    store.record("operator", "report_generated", "risk-report", {"sri": rep["summary"]["systemic_risk_index"]})
    return rep


@router.get("/reports/risk.md", response_class=PlainTextResponse)
def report_md(store: Store = Depends(get_store)) -> PlainTextResponse:
    rep = build_report(store)
    return PlainTextResponse(rep["markdown"], headers={"Content-Disposition": 'attachment; filename="ohmen-risk-report.md"'})


@router.get("/compliance/certin")
def certin(store: Store = Depends(get_store)) -> dict:
    return compliance.certin(store.twin, len(store.audit.records), len(store.scenarios), store.tasks)


@router.get("/compliance/attck")
def attck(store: Store = Depends(get_store)) -> dict:
    return compliance.attck_coverage(store.twin)


@router.get("/audit")
def audit(store: Store = Depends(get_store)) -> dict:
    return {"records": store.audit.records[::-1], "verification": store.audit.verify()}


class TaskIn(BaseModel):
    mitigation_id: str
    owner: str | None = None
    due_days: int | None = None


@router.get("/tasks")
def tasks(store: Store = Depends(get_store)) -> list[dict]:
    return store.tasks[::-1]


@router.post("/tasks")
def create_task(body: TaskIn, store: Store = Depends(get_store)) -> dict:
    return store.create_task(body.mitigation_id, body.owner, body.due_days)


class TaskUpdate(BaseModel):
    status: str


@router.patch("/tasks/{task_id}")
async def update_task(task_id: str, body: TaskUpdate, store: Store = Depends(get_store), hub: Hub = Depends(get_hub)) -> dict:
    out = store.update_task(task_id, body.status)
    if out.get("event"):
        await publish(store, hub, out["event"], out.get("snapshot"))
    return {"task": out["task"], "summary": store.summary()}


@router.post("/demo/flagship")
async def flagship(store: Store = Depends(get_store), hub: Hub = Depends(get_hub)) -> dict:
    if store.demo["running"]:
        return {"started": False, "demo": store.demo}
    asyncio.create_task(run_flagship(store, hub))
    return {"started": True, "steps": 6}


@router.post("/demo/reset")
async def reset(store: Store = Depends(get_store), hub: Hub = Depends(get_hub)) -> dict:
    store.reset()
    await hub.broadcast({"type": "reset", "summary": store.summary()})
    return {"reset": True, "summary": store.summary()}


class AmbientIn(BaseModel):
    enabled: bool


@router.post("/demo/ambient")
def ambient(body: AmbientIn, store: Store = Depends(get_store)) -> dict:
    store.ambient = body.enabled
    return {"ambient": store.ambient}
