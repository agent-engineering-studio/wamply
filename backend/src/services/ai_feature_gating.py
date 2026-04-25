"""AI feature gating per plan.

Reads plans.ai_features (jsonb) for the user's active subscription and
raises AIFeatureForbidden if the requested feature is not enabled for
their plan. Called from each AI endpoint (generate, improve, translate,
analytics_advanced) before charging credits or calling Claude.

The '*' wildcard in ai_features grants every feature (kept as forward-compat
hook for Enterprise; today the matrix is explicit per plan).
"""

from fastapi import HTTPException

import asyncpg


class AIFeatureForbidden(HTTPException):
    def __init__(self, feature: str):
        super().__init__(
            status_code=403,
            detail=f"La funzione '{feature}' non è disponibile nel tuo piano attuale.",
        )


async def require_ai_feature(db: asyncpg.Pool, user_id: str, feature: str) -> None:
    row = await db.fetchrow(
        """SELECT p.ai_features
           FROM subscriptions s
           JOIN plans p ON p.id = s.plan_id
           WHERE s.user_id = $1 AND s.status = 'active'
           LIMIT 1""",
        user_id,
    )
    if not row:
        raise AIFeatureForbidden(feature)
    features = dict(row["ai_features"] or {})
    if features.get("*") is True:
        return
    if not features.get(feature, False):
        raise AIFeatureForbidden(feature)
