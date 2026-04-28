"""Top-up credit packs: catalog (DB-backed), purchase checkout, balance application.

Flow:
  1. User clicks "Acquista 500 crediti €59" on /settings/credits.
  2. Backend creates Stripe Checkout Session (mode=payment) with
     metadata {type: 'topup', pack_slug, user_id}. Returns checkout URL.
  3. User completes payment on Stripe.
  4. Stripe fires `checkout.session.completed` webhook.
  5. `apply_topup_purchase()` upserts ai_credit_balance (credits +=
     pack.credits, expires_at = now() + 12 months) and marks the
     purchase row completed. Idempotent on stripe_checkout_session_id.

Catalog source of truth: `topup_packs` table (migration 030). Editable from
/admin?tab=payments. Stripe price IDs live in `topup_packs.stripe_price_id`,
with optional ENV fallback (STRIPE_PRICE_TOPUP_<SLUG>) for dev/CI.

The runtime credit consumer lives in `ai_credits.consume_from_plan_or_topup()`:
always drains plan credits first (user's money, protected), falls back
to topup only when plan budget is exhausted.
"""

import os
from datetime import datetime, timedelta, timezone

import asyncpg
import stripe
import structlog

logger = structlog.get_logger()

TOPUP_VALIDITY_DAYS = 365  # 12 months from most recent purchase


def _env_price_id_for(slug: str) -> str | None:
    """Legacy ENV fallback. Used only when topup_packs.stripe_price_id is empty."""
    return os.getenv(f"STRIPE_PRICE_TOPUP_{slug.upper()}") or None


def _row_to_dict(row: asyncpg.Record, *, include_admin: bool = False) -> dict:
    """Public-safe representation. Omits `stripe_*` IDs unless include_admin."""
    out = {
        "slug": row["slug"],
        "name": row["name"],
        "credits": int(row["credits"]),
        "amount_cents": int(row["amount_cents"]),
        "currency": row["currency"],
        "badge": row["badge"],
    }
    if include_admin:
        out.update({
            "id": str(row["id"]),
            "stripe_product_id": row["stripe_product_id"],
            "stripe_price_id": row["stripe_price_id"]
                or _env_price_id_for(row["slug"]),  # show resolved value
            "stripe_price_id_source": (
                "db" if row["stripe_price_id"]
                else ("env" if _env_price_id_for(row["slug"]) else None)
            ),
            "active": bool(row["active"]),
            "sort_order": int(row["sort_order"]),
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        })
    return out


async def list_packs(db: asyncpg.Pool) -> list[dict]:
    """Public catalog for /settings/credits. Returns active packs only."""
    rows = await db.fetch(
        "SELECT slug, name, credits, amount_cents, currency, badge "
        "FROM topup_packs WHERE active = true "
        "ORDER BY sort_order ASC, amount_cents ASC"
    )
    return [_row_to_dict(r) for r in rows]


async def list_packs_admin(db: asyncpg.Pool) -> list[dict]:
    """Full catalog for admin UI: includes inactive packs and Stripe IDs."""
    rows = await db.fetch(
        "SELECT id, slug, name, credits, amount_cents, currency, badge, "
        "       stripe_product_id, stripe_price_id, active, sort_order, "
        "       created_at, updated_at "
        "FROM topup_packs "
        "ORDER BY sort_order ASC, amount_cents ASC"
    )
    return [_row_to_dict(r, include_admin=True) for r in rows]


async def _resolve_price_id(db: asyncpg.Pool, slug: str) -> tuple[str | None, dict | None]:
    """Return (price_id, pack_row) for the given slug, applying ENV fallback.
    Returns (None, None) if pack does not exist."""
    row = await db.fetchrow(
        "SELECT slug, name, credits, amount_cents, stripe_price_id "
        "FROM topup_packs WHERE slug = $1 AND active = true",
        slug,
    )
    if not row:
        return None, None
    price_id = row["stripe_price_id"] or _env_price_id_for(slug)
    return price_id, dict(row)


# ── Eligibility ──────────────────────────────────────────────

async def can_purchase_topup(db: asyncpg.Pool, user_id: str) -> tuple[bool, str | None]:
    """Return `(ok, reason)`. Top-up allowed only for:
      - plan != 'free' AND
      - user has NOT configured BYOK (topup doesn't make sense for BYOK).
    """
    sub = await db.fetchrow(
        "SELECT p.slug AS plan_slug "
        "FROM subscriptions s JOIN plans p ON p.id = s.plan_id "
        "WHERE s.user_id = $1 AND s.status IN ('active', 'trialing')",
        user_id,
    )
    if not sub:
        return False, "Nessun abbonamento attivo."
    if sub["plan_slug"] == "free":
        return False, "Scegli un piano pagante prima di acquistare crediti aggiuntivi."

    byok = await db.fetchrow(
        "SELECT 1 FROM ai_config WHERE user_id = $1 AND encrypted_api_key IS NOT NULL",
        user_id,
    )
    if byok:
        return False, "Stai usando la tua API key Claude — i top-up non sono necessari."
    return True, None


# ── Checkout ─────────────────────────────────────────────────

async def create_topup_checkout_session(
    db: asyncpg.Pool,
    user_id: str,
    user_email: str,
    pack_slug: str,
    app_url: str,
) -> str:
    """Create a one-shot Stripe Checkout Session and return its URL.

    Also inserts a 'pending' row in ai_credit_purchases. The webhook
    upgrades it to 'completed' on payment success.
    """
    price_id, pack = await _resolve_price_id(db, pack_slug)
    if not pack:
        raise ValueError(f"Pacchetto '{pack_slug}' non esiste o non è attivo.")
    if not price_id:
        raise ValueError(
            f"Stripe Price ID non configurato per '{pack_slug}'. "
            f"Imposta lo Stripe Price ID dal pannello Admin → Pagamenti."
        )

    from src.services.billing import _ensure_stripe_api_key
    if not await _ensure_stripe_api_key(db):
        raise RuntimeError("STRIPE_SECRET_KEY non configurato.")

    # Reuse the Stripe customer from the subscription (Stripe Billing setup).
    sub_row = await db.fetchrow(
        "SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1",
        user_id,
    )
    customer_id = sub_row["stripe_customer_id"] if sub_row else None

    session_kwargs: dict = {
        "mode": "payment",
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": f"{app_url}/settings/credits?topup=success&session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{app_url}/settings/credits?topup=cancelled",
        "metadata": {
            "type": "topup",
            "user_id": user_id,
            "pack_slug": pack_slug,
        },
        "payment_intent_data": {
            "metadata": {
                "type": "topup",
                "user_id": user_id,
                "pack_slug": pack_slug,
            },
        },
        "billing_address_collection": "required",
        "tax_id_collection": {"enabled": True},
    }
    if customer_id:
        session_kwargs["customer"] = customer_id
    else:
        session_kwargs["customer_email"] = user_email

    session = stripe.checkout.Session.create(**session_kwargs)

    await db.execute(
        """INSERT INTO ai_credit_purchases
           (user_id, pack_slug, credits_purchased, amount_cents,
            stripe_checkout_session_id, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')
           ON CONFLICT (stripe_checkout_session_id) DO NOTHING""",
        user_id,
        pack["slug"],
        int(pack["credits"]),
        int(pack["amount_cents"]),
        session.id,
    )

    return session.url


# ── Webhook application ──────────────────────────────────────

async def apply_topup_purchase(
    db: asyncpg.Pool,
    session_id: str,
    payment_intent_id: str | None,
) -> bool:
    """Mark a pending purchase as completed and credit the user's balance.

    Idempotent: safe to call multiple times for the same session_id —
    returns False if purchase is already completed.
    """
    purchase = await db.fetchrow(
        """SELECT id, user_id, pack_slug, credits_purchased, status
           FROM ai_credit_purchases
           WHERE stripe_checkout_session_id = $1""",
        session_id,
    )
    if not purchase:
        logger.warning("topup_purchase_not_found", session_id=session_id)
        return False
    if purchase["status"] == "completed":
        return False

    async with db.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """UPDATE ai_credit_purchases
                   SET status = 'completed',
                       completed_at = now(),
                       stripe_payment_intent_id = $1
                   WHERE id = $2""",
                payment_intent_id,
                purchase["id"],
            )

            expires_at = datetime.now(timezone.utc) + timedelta(days=TOPUP_VALIDITY_DAYS)
            await conn.execute(
                """INSERT INTO ai_credit_balance (user_id, topup_credits, topup_expires_at, updated_at)
                   VALUES ($1, $2, $3, now())
                   ON CONFLICT (user_id) DO UPDATE SET
                       topup_credits = ai_credit_balance.topup_credits + EXCLUDED.topup_credits,
                       -- Extend expiry to the latest; never shorten an already-longer one.
                       topup_expires_at = GREATEST(
                           COALESCE(ai_credit_balance.topup_expires_at, EXCLUDED.topup_expires_at),
                           EXCLUDED.topup_expires_at
                       ),
                       updated_at = now()""",
                purchase["user_id"],
                int(purchase["credits_purchased"]),
                expires_at,
            )

    logger.info(
        "topup_applied",
        user_id=str(purchase["user_id"]),
        pack=purchase["pack_slug"],
        credits=int(purchase["credits_purchased"]),
    )
    return True


# ── Balance queries ──────────────────────────────────────────

async def get_topup_balance(db: asyncpg.Pool, user_id: str) -> dict:
    """Return current top-up balance. Expired credits reported as 0 but
    NOT cleared from the DB (expiry cleanup is a separate concern)."""
    row = await db.fetchrow(
        "SELECT topup_credits, topup_expires_at FROM ai_credit_balance WHERE user_id = $1",
        user_id,
    )
    if not row:
        return {"topup_credits": 0.0, "topup_expires_at": None, "expired": False}

    credits = float(row["topup_credits"])
    expires_at = row["topup_expires_at"]
    expired = bool(expires_at and expires_at < datetime.now(timezone.utc))

    return {
        "topup_credits": 0.0 if expired else credits,
        "topup_expires_at": expires_at.isoformat() if expires_at else None,
        "expired": expired,
        "raw_credits": credits,  # for admin visibility
    }


async def get_purchase_history(
    db: asyncpg.Pool, user_id: str, limit: int = 50
) -> list[dict]:
    rows = await db.fetch(
        """SELECT id, pack_slug, credits_purchased, amount_cents, status,
                  stripe_checkout_session_id, created_at, completed_at
           FROM ai_credit_purchases
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT $2""",
        user_id,
        limit,
    )
    return [
        {
            "id": str(r["id"]),
            "pack_slug": r["pack_slug"],
            "credits_purchased": int(r["credits_purchased"]),
            "amount_cents": int(r["amount_cents"]),
            "status": r["status"],
            "stripe_checkout_session_id": r["stripe_checkout_session_id"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "completed_at": r["completed_at"].isoformat() if r["completed_at"] else None,
        }
        for r in rows
    ]


# ── Consumption helper (used by ai_credits.commit_credits) ──

async def consume_topup(db: asyncpg.Pool, user_id: str, credits: float) -> None:
    """Decrement top-up balance by `credits`. Caller must ensure the user
    has enough — this function does not check, it only decrements."""
    if credits <= 0:
        return
    await db.execute(
        """UPDATE ai_credit_balance
           SET topup_credits = GREATEST(0, topup_credits - $1),
               updated_at = now()
           WHERE user_id = $2""",
        credits,
        user_id,
    )


# ── Stripe sync (admin-only) ─────────────────────────────────

async def sync_topup_packs_from_stripe(db: asyncpg.Pool) -> dict:
    """Pull Stripe products with metadata.wamply_type=topup and update
    `topup_packs.stripe_price_id` for slug matches.

    Strategy:
      - Each Stripe Product MUST be tagged metadata.wamply_type="topup"
        and metadata.wamply_slug=<slug> (e.g. "small", "medium", ...)
      - For each matched product, take the FIRST active one_time price
        and store its id in topup_packs.stripe_price_id where slug matches.
      - Returns counts of products examined, packs linked, and skipped reasons.

    DOES NOT create/modify Stripe objects. Read-only on Stripe side.
    DOES NOT modify topup_packs.amount_cents — Stripe price is immutable on
    amount, so we only record the price_id (linking) not the value.
    """
    from src.services.billing import _ensure_stripe_api_key
    if not await _ensure_stripe_api_key(db):
        raise RuntimeError("STRIPE_SECRET_KEY non configurato.")

    examined = 0
    linked: list[dict] = []
    skipped: list[dict] = []

    # Search products tagged for top-up. Search API returns ≤100 per page;
    # for our use case (4 packs) this is more than enough.
    try:
        result = stripe.Product.search(
            query='metadata["wamply_type"]:"topup" AND active:"true"',
            limit=100,
        )
    except stripe.error.StripeError as exc:
        raise RuntimeError(f"Stripe search failed: {exc}") from exc

    for product in result.auto_paging_iter():
        examined += 1
        slug = (product.metadata or {}).get("wamply_slug")
        if not slug:
            skipped.append({
                "product_id": product.id,
                "product_name": product.name,
                "reason": "missing metadata.wamply_slug",
            })
            continue

        # Fetch active one-time prices for this product.
        prices = stripe.Price.list(
            product=product.id, active=True, type="one_time", limit=10,
        )
        if not prices.data:
            skipped.append({
                "product_id": product.id,
                "product_name": product.name,
                "slug": slug,
                "reason": "no active one_time prices",
            })
            continue

        # Take the most recent one if multiple (Stripe returns desc by created).
        price = prices.data[0]

        result_row = await db.fetchrow(
            """UPDATE topup_packs
               SET stripe_product_id = $1, stripe_price_id = $2
               WHERE slug = $3
               RETURNING slug, stripe_price_id""",
            product.id, price.id, slug,
        )
        if not result_row:
            skipped.append({
                "product_id": product.id,
                "slug": slug,
                "reason": f"no topup_pack with slug={slug} in DB",
            })
            continue

        linked.append({
            "slug": slug,
            "stripe_product_id": product.id,
            "stripe_price_id": price.id,
            "product_name": product.name,
        })

    logger.info(
        "topup_sync_from_stripe",
        examined=examined,
        linked=len(linked),
        skipped=len(skipped),
    )
    return {
        "examined": examined,
        "linked": linked,
        "skipped": skipped,
    }
