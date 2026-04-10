from fastapi import APIRouter

from src.api.endpoints.health import router as health_router
from src.api.endpoints.campaigns import router as campaigns_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(campaigns_router, tags=["campaigns"])
