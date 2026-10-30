from fastapi import Request

from ..core.analyst import Analyst
from ..live import Hub
from ..store import Store


def get_store(request: Request) -> Store:
    return request.app.state.store


def get_hub(request: Request) -> Hub:
    return request.app.state.hub


def get_analyst(request: Request) -> Analyst:
    return request.app.state.analyst
