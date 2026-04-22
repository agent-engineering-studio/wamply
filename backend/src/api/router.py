from fastapi import APIRouter

from src.api.plan import router as plan_router
from src.api.contacts import router as contacts_router
from src.api.campaigns import router as campaigns_router
from src.api.admin import router as admin_router
from src.api.settings import router as settings_router
from src.api.templates import router as templates_router
from src.api.billing import router as billing_router
from src.api.business import router as business_router

api_router = APIRouter()
api_router.include_router(plan_router, tags=["plan"])
api_router.include_router(contacts_router, tags=["contacts"])
api_router.include_router(campaigns_router, tags=["campaigns"])
api_router.include_router(admin_router, tags=["admin"])
api_router.include_router(settings_router, tags=["settings"])
api_router.include_router(templates_router, tags=["templates"])
api_router.include_router(billing_router, tags=["billing"])
api_router.include_router(business_router, tags=["business"])
