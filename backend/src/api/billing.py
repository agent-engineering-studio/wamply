import os

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db
from src.services.billing import (
    create_checkout_session,
    create_portal_session,
    handle_stripe_webhook,
    set_subscription_cancel_at_period_end,
)
from src.services.credit_topup import (
    can_purchase_topup,
    create_topup_checkout_session,
    get_purchase_history,
    list_packs,
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
    if plan_slug not in ("avvio", "starter", "professional", "enterprise"):
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


@router.post("/portal")
async def portal(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Create a Stripe Billing Portal session and return its URL.

    Self-service for plan changes, cancellation, payment method,
    invoices. Requires the user to already have a Stripe customer
    (i.e. at least one past Checkout or manually linked).
    """
    db = get_db(request)
    try:
        url = await create_portal_session(
            db=db,
            user_id=str(user.id),
            user_email=user.email,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return {"portal_url": url}


@router.post("/subscription/cancel")
async def cancel_subscription(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Schedule cancellation at the end of the current billing period.
    The subscription remains active until current_period_end."""
    db = get_db(request)
    try:
        result = await set_subscription_cancel_at_period_end(db, str(user.id), True)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return result


@router.post("/subscription/resume")
async def resume_subscription(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Reverse a scheduled cancellation while still within the paid period."""
    db = get_db(request)
    try:
        result = await set_subscription_cancel_at_period_end(db, str(user.id), False)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return result


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


# ── Top-up credits ────────────────────────────────────────────

@router.get("/topup/packs")
async def topup_packs():
    """Public catalog of top-up credit packs for the billing UI."""
    return {"packs": list_packs()}


@router.post("/topup/checkout")
async def topup_checkout(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Create a Stripe Checkout Session for a credit pack and return its URL."""
    body = await request.json()
    pack_slug = body.get("pack_slug")

    db = get_db(request)

    ok, reason = await can_purchase_topup(db, str(user.id))
    if not ok:
        raise HTTPException(status_code=403, detail=reason or "Top-up non consentito.")

    app_url = os.getenv("APP_URL", "http://localhost:3000")
    try:
        url = await create_topup_checkout_session(
            db=db,
            user_id=str(user.id),
            user_email=user.email,
            pack_slug=pack_slug,
            app_url=app_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return {"checkout_url": url}


@router.get("/topup/history")
async def topup_history(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Purchase history for the authenticated user (credits UI)."""
    db = get_db(request)
    history = await get_purchase_history(db, str(user.id))
    return {"purchases": history}


@router.get("/usage/breakdown")
async def usage_breakdown(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Per-operation credit consumption in the current calendar month.

    Aggregates the ledger to power the 'Consumo questo mese' section
    of the credits dashboard. Excludes BYOK rows since those don't
    count against the user's budget.
    """
    db = get_db(request)
    rows = await db.fetch(
        """SELECT operation, SUM(credits)::numeric(10,2) AS credits_used, COUNT(*) AS count
           FROM ai_usage_ledger
           WHERE user_id = $1
             AND source = 'system_key'
             AND date_trunc('month', created_at) = date_trunc('month', now())
           GROUP BY operation
           ORDER BY credits_used DESC""",
        user.id,
    )
    total = sum(float(r["credits_used"]) for r in rows)
    return {
        "total_credits": total,
        "by_operation": [
            {
                "operation": r["operation"],
                "credits": float(r["credits_used"]),
                "count": int(r["count"]),
            }
            for r in rows
        ],
    }
