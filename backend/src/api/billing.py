from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, Response

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db
from src.services.billing import (
    create_checkout_session,
    handle_stripe_webhook,
)

router = APIRouter(prefix="/billing")


@router.post("/checkout")
async def checkout(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Create a Stripe Checkout Session for the given plan and return its URL."""
    body = await request.json()
    plan_slug = body.get("plan_slug")
    if plan_slug not in ("starter", "professional", "enterprise"):
        raise HTTPException(status_code=400, detail="plan_slug non valido.")

    db = get_db(request)
    try:
        url = await create_checkout_session(
            db=db,
            user_id=str(user.id),
            user_email=user.email,
            plan_slug=plan_slug,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return {"checkout_url": url}


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Stripe webhook endpoint. Signature-verified, no JWT."""
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    db = get_db(request)

    try:
        result = await handle_stripe_webhook(db, payload, signature)
    except ValueError:
        # Invalid payload or signature
        raise HTTPException(status_code=400, detail="Invalid signature.")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return JSONResponse(result)
