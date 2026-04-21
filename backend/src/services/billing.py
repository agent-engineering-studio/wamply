"""Stripe Billing integration: Checkout sessions + webhook event dispatcher.

Keeps the local DB (subscriptions table) in sync with Stripe as the source of truth.
"""

import os
from datetime import datetime, timezone

import asyncpg
import stripe
import structlog

logger = structlog.get_logger()

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
APP_URL = os.getenv("APP_URL", "http://localhost:3000")


def _ts_to_dt(ts: int | None) -> datetime | None:
    if not ts:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc)


async def _get_or_create_customer(db: asyncpg.Pool, user_id: str, email: str) -> str:
    """Return Stripe customer id, creating one (and linking to DB) if needed."""
    row = await db.fetchrow(
        "SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1",
        user_id,
    )
    if row and row["stripe_customer_id"]:
        return row["stripe_customer_id"]

    customer = stripe.Customer.create(
        email=email,
        metadata={"user_id": user_id},
    )
    await db.execute(
        "UPDATE subscriptions SET stripe_customer_id = $1, updated_at = now() WHERE user_id = $2",
        customer.id,
        user_id,
    )
    return customer.id


async def create_portal_session(
    db: asyncpg.Pool,
    user_id: str,
    user_email: str,
) -> str:
    """Create a Stripe Billing Portal session and return its URL.

    The Portal lets the user self-manage subscription (upgrade/downgrade/cancel),
    payment method, billing address, and download invoices. All operations
    fire `customer.subscription.updated` which our webhook already syncs.

    Requires the Portal to be configured in the Stripe Dashboard (test + live):
      Settings → Billing → Customer portal → activate.
    The Portal's feature set is configured there, NOT here.
    """
    if not stripe.api_key:
        raise RuntimeError("STRIPE_SECRET_KEY non configurato.")

    customer_id = await _get_or_create_customer(db, user_id, user_email)

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{APP_URL}/settings/billing?portal=return",
    )
    return session.url


async def create_checkout_session(
    db: asyncpg.Pool,
    user_id: str,
    user_email: str,
    plan_slug: str,
) -> str:
    """Create a Stripe Checkout Session for the given plan. Returns checkout URL."""
    if not stripe.api_key:
        raise RuntimeError("STRIPE_SECRET_KEY is not configured.")

    plan = await db.fetchrow(
        "SELECT name, stripe_price_id FROM plans WHERE slug = $1 AND active = true",
        plan_slug,
    )
    if not plan:
        raise ValueError(f"Plan '{plan_slug}' not found.")
    if not plan["stripe_price_id"]:
        raise ValueError(f"Plan '{plan_slug}' has no stripe_price_id configured.")

    customer_id = await _get_or_create_customer(db, user_id, user_email)

    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": plan["stripe_price_id"], "quantity": 1}],
        success_url=f"{APP_URL}/settings/billing?checkout=success&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{APP_URL}/settings/billing?checkout=cancelled",
        subscription_data={
            "metadata": {"user_id": user_id, "plan_slug": plan_slug},
        },
        metadata={"user_id": user_id, "plan_slug": plan_slug},
        allow_promotion_codes=True,
        billing_address_collection="required",
        tax_id_collection={"enabled": True},
    )
    return session.url


async def _sync_subscription_from_stripe(
    db: asyncpg.Pool,
    stripe_sub: "stripe.Subscription",
) -> None:
    """Upsert local subscription row from a Stripe Subscription object."""
    user_id = (stripe_sub.metadata or {}).get("user_id")
    if not user_id:
        # Fallback: look up by customer id
        row = await db.fetchrow(
            "SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1",
            stripe_sub.customer,
        )
        if not row:
            logger.warning("stripe_sub_no_user", sub_id=stripe_sub.id, customer=stripe_sub.customer)
            return
        user_id = str(row["user_id"])

    items = stripe_sub["items"].data
    first_item = items[0] if items else None
    price_id = first_item.price.id if first_item else None
    plan_row = None
    if price_id:
        plan_row = await db.fetchrow(
            "SELECT id, slug FROM plans WHERE stripe_price_id = $1",
            price_id,
        )
    if not plan_row:
        logger.warning("stripe_price_not_mapped", price_id=price_id, sub_id=stripe_sub.id)
        return

    status = stripe_sub.status  # 'trialing' | 'active' | 'past_due' | 'canceled' | ...
    # Local enum accepts: trialing, active, past_due, canceled. Map others:
    if status in ("incomplete", "incomplete_expired", "unpaid"):
        status = "past_due"

    # API 2026-03-25.dahlia moved current_period_{start,end} from Subscription
    # to each SubscriptionItem. Read from the first item with a fallback to the
    # legacy location in case of older API versions.
    period_start = getattr(first_item, "current_period_start", None) if first_item else None
    period_end = getattr(first_item, "current_period_end", None) if first_item else None
    if period_start is None:
        period_start = getattr(stripe_sub, "current_period_start", None)
    if period_end is None:
        period_end = getattr(stripe_sub, "current_period_end", None)

    await db.execute(
        """UPDATE subscriptions
           SET plan_id = $1,
               stripe_subscription_id = $2,
               stripe_customer_id = $3,
               status = $4::subscription_status,
               current_period_start = $5,
               current_period_end = $6,
               cancel_at_period_end = $7,
               updated_at = now()
           WHERE user_id = $8""",
        plan_row["id"],
        stripe_sub.id,
        stripe_sub.customer,
        status,
        _ts_to_dt(period_start),
        _ts_to_dt(period_end),
        bool(stripe_sub.cancel_at_period_end),
        user_id,
    )
    logger.info("stripe_sub_synced", user_id=user_id, plan=plan_row["slug"], status=status)


def _extract_subscription_id(invoice_obj) -> str | None:
    """Extract the subscription id from an invoice event object, handling both
    the legacy `invoice.subscription` field and the dahlia-era location under
    `invoice.parent.subscription_details.subscription`."""
    # Legacy (API versions before 2025-03-31.basil / still populated by some events)
    legacy = invoice_obj.get("subscription") if hasattr(invoice_obj, "get") else None
    if legacy:
        return legacy
    # New location introduced in 2025-03-31.basil and kept in 2026-03-25.dahlia
    parent = invoice_obj.get("parent") if hasattr(invoice_obj, "get") else None
    if not parent:
        return None
    details = parent.get("subscription_details") if hasattr(parent, "get") else None
    if not details:
        return None
    return details.get("subscription")


async def handle_stripe_webhook(
    db: asyncpg.Pool,
    payload: bytes,
    signature: str,
) -> dict:
    """Verify the webhook signature and dispatch to handlers. Returns a status dict."""
    if not STRIPE_WEBHOOK_SECRET:
        raise RuntimeError("STRIPE_WEBHOOK_SECRET is not configured.")

    event = stripe.Webhook.construct_event(
        payload=payload,
        sig_header=signature,
        secret=STRIPE_WEBHOOK_SECRET,
    )

    event_type = event["type"]
    obj = event["data"]["object"]

    if event_type == "checkout.session.completed":
        metadata = obj.get("metadata") or {}

        # Top-up one-shot payment: credit the user's top-up balance.
        if metadata.get("type") == "topup":
            from src.services.credit_topup import apply_topup_purchase
            session_id = obj.get("id")
            payment_intent_id = obj.get("payment_intent")
            if session_id:
                await apply_topup_purchase(db, session_id, payment_intent_id)

        # Subscription mode: sync plan.
        elif obj.get("mode") == "subscription" and obj.get("subscription"):
            sub = stripe.Subscription.retrieve(obj["subscription"])
            await _sync_subscription_from_stripe(db, sub)

    elif event_type in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        sub = stripe.Subscription.retrieve(obj["id"])
        await _sync_subscription_from_stripe(db, sub)

    elif event_type == "invoice.payment_succeeded":
        sub_id = _extract_subscription_id(obj)
        if sub_id:
            sub = stripe.Subscription.retrieve(sub_id)
            await _sync_subscription_from_stripe(db, sub)

    elif event_type == "invoice.payment_failed":
        sub_id = _extract_subscription_id(obj)
        if sub_id:
            # Mark local sub as past_due eagerly; Stripe will retry automatically.
            await db.execute(
                "UPDATE subscriptions SET status = 'past_due', updated_at = now() "
                "WHERE stripe_subscription_id = $1",
                sub_id,
            )

    else:
        logger.debug("stripe_event_ignored", type=event_type)

    return {"received": True, "type": event_type}
