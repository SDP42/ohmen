"""OHMEN API: cyber-risk digital twin for critical infrastructure."""

from __future__ import annotations

import asyncio
import contextlib
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import auth, intel, lab, ops, twin
from .core.analyst import Analyst
from .core.mitigation import MitigationError
from .db import Database
from .live import Hub, ambient_loop
from .store import Store, StoreError

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
FRONTEND_DIST = ROOT.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    DATA_DIR.mkdir(exist_ok=True)
    url = os.environ.get("OHMEN_DATABASE_URL", f"sqlite:///{DATA_DIR / 'ohmen.db'}")
    store = Store(Database(url))
    app.state.store = store
    app.state.hub = Hub()
    app.state.analyst = Analyst(store)
    task = asyncio.create_task(ambient_loop(store, app.state.hub))
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


app = FastAPI(
    title="OHMEN API",
    version="0.1.0",
    description="Consequence-aware cyber-risk digital twin for critical infrastructure (D3COY PS 03). All data is synthetic.",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("OHMEN_CORS", "*").split(","), allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(StoreError)
@app.exception_handler(MitigationError)
@app.exception_handler(ValueError)
async def bad_request(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


for module in (auth, twin, intel, lab, ops):
    app.include_router(module.router)

if FRONTEND_DIST.exists():
    # Single-command deployment: serve the built console from the API process.
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        target = FRONTEND_DIST / path
        return FileResponse(target if path and target.is_file() else FRONTEND_DIST / "index.html")
