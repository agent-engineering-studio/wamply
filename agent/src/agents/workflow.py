"""Sequential Workflow: CampaignPlanner -> MessageComposer -> Dispatcher."""

from src.memory.redis_memory import RedisMemory
from src.memory.supabase_memory import SupabaseMemory
from src.agents.campaign_planner import plan_campaign
from src.agents.message_composer import compose_messages
from src.agents.dispatcher import dispatch_messages
from src.tools.status_tool import finalize_campaign
from src.utils.telemetry import log


async def run_campaign_workflow(
    db: SupabaseMemory,
    redis: RedisMemory,
    campaign_id: str,
) -> dict:
    """
    Execute the full 3-stage campaign workflow.

    Stage 1: CampaignPlanner — analyze, segment, select template
    Stage 2: MessageComposer — personalize messages with LLM
    Stage 3: Dispatcher — send via WhatsApp API
    """
    await log.ainfo("workflow_start", campaign_id=campaign_id)

    try:
        # Load campaign from DB
        row = await db.pool.fetchrow(
            """
            SELECT id, user_id, name, template_id, group_id, segment_query, status
            FROM campaigns WHERE id = $1
            """,
            campaign_id,
        )

        if not row:
            raise ValueError(f"Campagna {campaign_id} non trovata")

        campaign = {
            "id": str(row["id"]),
            "user_id": str(row["user_id"]),
            "name": row["name"],
            "template_id": str(row["template_id"]) if row["template_id"] else None,
            "group_id": str(row["group_id"]) if row["group_id"] else None,
            "segment_query": row["segment_query"] or {},
        }
        user_id = campaign["user_id"]

        # Mark as running
        await db.update_campaign_status(campaign_id, "running")
        await redis.set_state(campaign_id, {"status": "running", "stage": "planning"})

        # -- Stage 1: Plan --
        plan = await plan_campaign(db, campaign, user_id)
        contacts = plan["contacts"]
        template = plan["template"]
        context = plan["context"]

        # Set total in progress tracker
        await redis.update_progress(campaign_id, total=len(contacts))
        await redis.set_state(campaign_id, {"status": "running", "stage": "composing"})

        # -- Stage 2: Compose --
        # Determine model based on plan (Enterprise gets Sonnet)
        sub_row = await db.pool.fetchrow(
            """
            SELECT p.llm_model FROM subscriptions s
            JOIN plans p ON s.plan_id = p.id
            WHERE s.user_id = $1
            """,
            user_id,
        )
        model = sub_row["llm_model"] if sub_row else None

        messages = await compose_messages(
            db, campaign_id, contacts, template, context, model=model
        )

        await redis.set_state(campaign_id, {"status": "running", "stage": "dispatching"})

        # -- Stage 3: Dispatch --
        dispatch_result = await dispatch_messages(
            db, redis, campaign_id, user_id, messages, template
        )

        if dispatch_result.get("paused"):
            await log.ainfo("workflow_paused", campaign_id=campaign_id)
            return {"status": "paused", **dispatch_result}

        # -- Finalize --
        result = await finalize_campaign(db, redis, campaign_id)
        await redis.set_state(campaign_id, {"status": result["status"], "stage": "done"})

        await log.ainfo(
            "workflow_complete",
            campaign_id=campaign_id,
            status=result["status"],
            stats=result["stats"],
        )
        return result

    except Exception as e:
        await log.aerror("workflow_failed", campaign_id=campaign_id, error=str(e))
        await db.update_campaign_status(campaign_id, "failed")
        await redis.set_state(campaign_id, {"status": "failed", "error": str(e)})
        raise
