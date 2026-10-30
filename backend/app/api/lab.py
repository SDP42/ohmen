"""Scenario Lab, mitigation playground, budget autopilot and resilience analytics."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..core import compliance, mitigation, resilience, scenario
from ..store import Store
from .auth import get_actor
from .deps import get_store

router = APIRouter(prefix="/api", tags=["lab"])


class ScenarioIn(BaseModel):
    type: str = "exploitation"
    asset: str | None = None
    vendor: str | None = None
    zone: str | None = None
    severity: str = "high"
    reachability: str = "configured"
    depth: int = 4
    mitigations: list[str] = Field(default_factory=list)
    runs: int = 600
    seed: int = 7
    monte_carlo: bool = True


@router.get("/scenarios/templates")
def templates(store: Store = Depends(get_store)) -> dict:
    vendors = sorted({a["vendor"] for a in store.twin.assets.values() if a.get("vendor")})
    zones = sorted({a["zone"] for a in store.twin.assets.values() if a["category"] == "cyber" and a["zone"] not in {"bench"}})
    return {"templates": scenario.TEMPLATES, "vendors": vendors, "zones": zones}


@router.post("/scenarios/run")
def run(cfg: ScenarioIn, store: Store = Depends(get_store), actor: str = Depends(get_actor)) -> dict:
    body = cfg.model_dump()
    mc = body.pop("monte_carlo")
    result = scenario.run(store.twin, body, store.events, monte_carlo=mc)
    store.remember_scenario(result, actor=actor)
    return result


class CompareIn(BaseModel):
    a: ScenarioIn
    b: ScenarioIn


@router.post("/scenarios/compare")
def compare(body: CompareIn, store: Store = Depends(get_store)) -> dict:
    a = body.a.model_dump()
    b = body.b.model_dump()
    a.pop("monte_carlo")
    b.pop("monte_carlo")
    return scenario.compare(store.twin, a, b, store.events)


@router.get("/scenarios")
def history(store: Store = Depends(get_store)) -> list[dict]:
    return store.scenarios[::-1]


@router.get("/mitigations/catalog/{asset_id}")
def catalog(asset_id: str, store: Store = Depends(get_store)) -> list[dict]:
    return mitigation.catalog(store.twin, asset_id)


class EvaluateIn(BaseModel):
    mitigations: list[str]
    scenario: ScenarioIn | None = None


@router.post("/mitigations/evaluate")
def evaluate(body: EvaluateIn, store: Store = Depends(get_store)) -> dict:
    sc = None
    if body.scenario:
        sc = body.scenario.model_dump()
        sc.pop("monte_carlo")
    return mitigation.evaluate(store.twin, body.mitigations, scenario=sc)


class OptimizeIn(BaseModel):
    budget: float = Field(12.0, ge=0, le=200)


@router.post("/mitigations/optimize")
def optimize(body: OptimizeIn, store: Store = Depends(get_store)) -> dict:
    return mitigation.optimize(store.twin, body.budget)


@router.get("/resilience/spof")
def spof(store: Store = Depends(get_store)) -> list[dict]:
    return resilience.spof(store.twin)


class AlternativeIn(BaseModel):
    source: str
    target: str
    node: str


@router.post("/resilience/alternative")
def alternative(body: AlternativeIn, store: Store = Depends(get_store)) -> dict:
    return resilience.test_alternative(store.twin, body.source, body.target, body.node)


@router.get("/resilience/chokepoints")
def chokepoints(store: Store = Depends(get_store)) -> dict:
    return resilience.chokepoints(store.twin)


@router.get("/resilience/drift")
def drift(store: Store = Depends(get_store)) -> dict:
    return resilience.drift(store.twin, store.events)


@router.get("/resilience/vendors")
def vendors(store: Store = Depends(get_store)) -> list[dict]:
    return resilience.vendors(store.twin)


@router.get("/exposure")
def exposure(store: Store = Depends(get_store)) -> dict:
    return compliance.exposure_view(store.twin)
