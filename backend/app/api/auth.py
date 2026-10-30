"""Demo authentication: one-click persona sign-in.

There are no passwords in the prototype. Each persona maps to one of the blueprint's four
user groups and to an analyst persona lens. Sessions are in-memory bearer tokens; the
signed-in name becomes the actor in the audit trail.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..store import Store
from .deps import get_store

router = APIRouter(prefix="/api/auth", tags=["auth"])

PERSONAS = [
    {"id": "ops-manager", "name": "Aarav Mehta", "role": "Infrastructure Operations Manager", "persona": "operations", "clearance": "OPS-2",
     "initials": "AM", "color": "#4ade80", "focus": "Service continuity, redundancy and backup endurance", "home": "/app"},
    {"id": "ot-analyst", "name": "Riya Sharma", "role": "OT Security Analyst", "persona": "analyst", "clearance": "SEC-3",
     "initials": "RS", "color": "#60a5fa", "focus": "Vulnerabilities, attack paths and ATT&CK for ICS", "home": "/app/risk"},
    {"id": "risk-planner", "name": "Vikram Rao", "role": "Municipal Risk Planner", "persona": "commissioner", "clearance": "GOV-2",
     "initials": "VR", "color": "#a78bfa", "focus": "Citizens affected, budgets and systemic exposure", "home": "/app/invest"},
    {"id": "compliance", "name": "Neha Iyer", "role": "Risk & Compliance Officer", "persona": "auditor", "clearance": "AUD-1",
     "initials": "NI", "color": "#fbbf24", "focus": "Evidence, CERT-In coverage and the audit trail", "home": "/app/compliance"},
]


def sessions(request: Request) -> dict[str, dict]:
    if not hasattr(request.app.state, "sessions"):
        request.app.state.sessions = {}
    return request.app.state.sessions


def current_user(request: Request) -> dict | None:
    header = request.headers.get("authorization", "")
    token = header.removeprefix("Bearer ").strip()
    return sessions(request).get(token) if token else None


def get_actor(request: Request) -> str:
    user = current_user(request)
    return f"{user['name']} ({user['role']})" if user else "operator"


@router.get("/personas")
def personas() -> list[dict]:
    return PERSONAS


class LoginIn(BaseModel):
    persona_id: str


@router.post("/login")
def login(body: LoginIn, request: Request, store: Store = Depends(get_store)) -> dict:
    user = next((p for p in PERSONAS if p["id"] == body.persona_id), None)
    if not user:
        raise HTTPException(404, "Unknown persona")
    token = secrets.token_hex(20)
    sessions(request)[token] = {**user, "signed_in_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    store.record(f"{user['name']} ({user['role']})", "signed_in", user["id"], {"method": "demo persona"})
    return {"token": token, "user": user}


@router.get("/me")
def me(request: Request) -> dict:
    user = current_user(request)
    if not user:
        raise HTTPException(401, "Not signed in")
    return user


@router.post("/logout")
def logout(request: Request) -> dict:
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    sessions(request).pop(token, None)
    return {"signed_out": True}
