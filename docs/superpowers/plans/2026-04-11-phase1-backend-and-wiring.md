# Phase 1: Backend API + Docker/Kong + Frontend Wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the Python/FastAPI backend that replaces Next.js API routes, wire it through Kong, and update the frontend to call the backend — enabling the full flow: auth → dashboard → campaigns → plan limits.

**Architecture:** New `backend/` FastAPI project with JWT auth, asyncpg for DB, Redis for plan caching. Kong routes `/api/v1/*` to the backend. Frontend SWR hooks point to Kong instead of local API routes.

**Tech Stack:** Python 3.12, FastAPI, asyncpg, redis, python-jose, cryptography, httpx, structlog

**Spec:** `docs/superpowers/specs/2026-04-11-backend-extraction-design.md`

---

### Task 1: Backend project scaffold

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/Dockerfile`
- Create: `backend/src/__init__.py`
- Create: `backend/src/main.py`
- Create: `backend/src/config.py`

- [ ] **Step 1: Create `backend/pyproject.toml`**

```toml
[project]
name = "wcm-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "asyncpg>=0.30",
    "redis[hiredis]>=5.2",
    "cryptography>=44.0",
    "pydantic-settings>=2.7",
    "python-jose[cryptography]>=3.3",
    "httpx>=0.28",
    "structlog>=24.4",
    "python-dotenv>=1.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "pytest-asyncio>=0.24", "httpx>=0.28"]
```

- [ ] **Step 2: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim
RUN pip install uv
WORKDIR /app
COPY pyproject.toml .
RUN uv pip install --system -e ".[dev]"
COPY src/ src/
EXPOSE 8200
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8200", "--reload"]
```

- [ ] **Step 3: Create `backend/src/__init__.py`**

Empty file.

- [ ] **Step 4: Create `backend/src/config.py`**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://supabase_admin:postgres@supabase-db:5432/postgres"
    redis_url: str = "redis://redis:6379"
    jwt_secret: str = "super-secret-jwt-token-with-at-least-32-characters-long"
    agent_secret: str = "dev-agent-secret-change-in-production"
    encryption_key: str = "0123456789abcdef0123456789abcdef"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    supabase_service_role_key: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
```

- [ ] **Step 5: Create `backend/src/main.py`**

```python
from contextlib import asynccontextmanager

import asyncpg
import redis.asyncio as aioredis
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings

logger = structlog.get_logger()

db_pool: asyncpg.Pool | None = None
redis_client: aioredis.Redis | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool, redis_client
    logger.info("Starting backend", database=settings.database_url[:30])
    db_pool = await asyncpg.create_pool(settings.database_url, min_size=2, max_size=10)
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    yield
    if db_pool:
        await db_pool.close()
    if redis_client:
        await redis_client.aclose()
    logger.info("Backend shutdown")


app = FastAPI(title="Wamply Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "wcm-backend"}
```

- [ ] **Step 6: Test locally**

```bash
cd backend
pip install uv && uv pip install --system -e ".[dev]"
uvicorn src.main:app --host 0.0.0.0 --port 8200 --reload
# In another terminal:
curl http://localhost:8200/health
# Expected: {"status":"ok","service":"wcm-backend"}
```

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(backend): scaffold FastAPI project with config, health endpoint"
```

---

### Task 2: Database pool and Redis dependencies

**Files:**
- Create: `backend/src/dependencies.py`

- [ ] **Step 1: Create `backend/src/dependencies.py`**

```python
from fastapi import Request

import asyncpg
import redis.asyncio as aioredis


def get_db(request: Request) -> asyncpg.Pool:
    return request.app.state.db_pool if hasattr(request.app.state, "db_pool") else __import__("src.main", fromlist=["db_pool"]).db_pool


def get_redis(request: Request) -> aioredis.Redis:
    return request.app.state.redis_client if hasattr(request.app.state, "redis_client") else __import__("src.main", fromlist=["redis_client"]).redis_client
```

- [ ] **Step 2: Update `backend/src/main.py` to store on app.state**

Add after pool/redis creation in lifespan:

```python
    app.state.db_pool = db_pool
    app.state.redis_client = redis_client
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/
git commit -m "feat(backend): add db pool and redis dependency injection"
```

---

### Task 3: JWT authentication

**Files:**
- Create: `backend/src/auth/__init__.py`
- Create: `backend/src/auth/jwt.py`
- Create: `backend/src/auth/permissions.py`
- Create: `backend/src/auth/service_auth.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 1: Create `backend/src/auth/__init__.py`**

Empty file.

- [ ] **Step 2: Create `backend/src/auth/jwt.py`**

```python
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from src.config import settings
from src.dependencies import get_db

security = HTTPBearer()


class CurrentUser:
    def __init__(self, id: str, email: str, role: str, full_name: str | None):
        self.id = id
        self.email = email
        self.role = role
        self.full_name = full_name


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> CurrentUser:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], audience="authenticated")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token non valido.")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token non valido.")

    db = get_db(request)
    row = await db.fetchrow(
        "SELECT id, email, role::text, full_name FROM users WHERE id = $1",
        user_id,
    )
    if not row:
        raise HTTPException(status_code=401, detail="Utente non trovato.")

    return CurrentUser(id=str(row["id"]), email=row["email"], role=row["role"], full_name=row["full_name"])
```

- [ ] **Step 3: Create `backend/src/auth/permissions.py`**

```python
from fastapi import Depends, HTTPException

from src.auth.jwt import CurrentUser, get_current_user


async def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Accesso riservato agli amministratori.")
    return user
```

- [ ] **Step 4: Create `backend/src/auth/service_auth.py`**

```python
from fastapi import Depends, HTTPException, Request

from src.config import settings
from src.dependencies import get_db
from src.auth.jwt import CurrentUser


async def get_service_user(request: Request) -> CurrentUser:
    agent_secret = request.headers.get("X-Agent-Secret")
    if agent_secret != settings.agent_secret:
        raise HTTPException(status_code=401, detail="Invalid agent secret.")

    user_id = request.headers.get("X-On-Behalf-Of")
    if not user_id:
        raise HTTPException(status_code=400, detail="Missing X-On-Behalf-Of header.")

    db = get_db(request)
    row = await db.fetchrow(
        "SELECT id, email, role::text, full_name FROM users WHERE id = $1",
        user_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found.")

    return CurrentUser(id=str(row["id"]), email=row["email"], role=row["role"], full_name=row["full_name"])
```

- [ ] **Step 5: Create `backend/tests/__init__.py` and `backend/tests/test_auth.py`**

```python
# tests/test_auth.py
from jose import jwt

from src.config import settings


def test_jwt_encode_decode():
    payload = {"sub": "a0000000-0000-0000-0000-000000000001", "aud": "authenticated", "role": "authenticated"}
    token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    decoded = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], audience="authenticated")
    assert decoded["sub"] == "a0000000-0000-0000-0000-000000000001"


def test_jwt_invalid_secret():
    payload = {"sub": "test", "aud": "authenticated"}
    token = jwt.encode(payload, "wrong-secret-that-is-long-enough-for-hs256", algorithm="HS256")
    try:
        jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], audience="authenticated")
        assert False, "Should have raised"
    except Exception:
        pass
```

- [ ] **Step 6: Run tests**

```bash
cd backend && python -m pytest tests/test_auth.py -v
# Expected: 2 passed
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/auth/ backend/tests/
git commit -m "feat(backend): JWT auth, admin permissions, service-to-service auth"
```

---

### Task 4: Plan limits service

**Files:**
- Create: `backend/src/services/__init__.py`
- Create: `backend/src/services/plan_limits.py`

- [ ] **Step 1: Create `backend/src/services/__init__.py`**

Empty file.

- [ ] **Step 2: Create `backend/src/services/plan_limits.py`**

```python
import json
from datetime import date

import asyncpg
import redis.asyncio as aioredis
from fastapi import HTTPException

CACHE_TTL = 300


async def check_plan_limit(
    db: asyncpg.Pool,
    redis: aioredis.Redis,
    user_id: str,
    resource: str,
) -> dict:
    cache_key = f"plan:{user_id}"
    cached = await redis.get(cache_key)

    if cached:
        ctx = json.loads(cached)
    else:
        sub = await db.fetchrow(
            "SELECT plan_id FROM subscriptions WHERE user_id = $1 AND status = 'active'",
            user_id,
        )
        if not sub:
            raise HTTPException(status_code=402, detail="Nessun abbonamento attivo. Scegli un piano.")

        plan = await db.fetchrow("SELECT * FROM plans WHERE id = $1", sub["plan_id"])
        if not plan:
            raise HTTPException(status_code=500, detail="Piano non trovato.")

        usage = await db.fetchrow(
            "SELECT campaigns_used, messages_used, contacts_count FROM usage_counters WHERE user_id = $1 AND period_start = $2",
            user_id,
            date.today(),
        )

        ctx = {
            "plan": dict(plan),
            "usage": dict(usage) if usage else {"campaigns_used": 0, "messages_used": 0, "contacts_count": 0},
        }
        # Convert non-serializable types
        for k, v in ctx["plan"].items():
            if isinstance(v, date):
                ctx["plan"][k] = v.isoformat()
            elif hasattr(v, "__str__") and not isinstance(v, (str, int, float, bool, type(None))):
                ctx["plan"][k] = str(v)

        await redis.set(cache_key, json.dumps(ctx), ex=CACHE_TTL)

    limit_map = {
        "campaigns": (ctx["plan"]["max_campaigns_month"], ctx["usage"]["campaigns_used"]),
        "messages": (ctx["plan"]["max_messages_month"], ctx["usage"]["messages_used"]),
        "contacts": (ctx["plan"]["max_contacts"], ctx["usage"]["contacts_count"]),
        "templates": (ctx["plan"]["max_templates"], 0),
        "team_members": (ctx["plan"]["max_team_members"], 0),
    }

    limit, used = limit_map.get(resource, (0, 0))
    if limit != -1 and used >= limit:
        suggested = await db.fetchrow(
            "SELECT slug FROM plans WHERE price_cents > $1 ORDER BY price_cents LIMIT 1",
            ctx["plan"]["price_cents"],
        )
        raise HTTPException(
            status_code=402,
            detail=f"Hai raggiunto il limite del piano {ctx['plan']['name']} per {resource}.",
            headers={"X-Suggested-Plan": suggested["slug"] if suggested else ""},
        )

    return ctx
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/
git commit -m "feat(backend): plan limits service with Redis caching"
```

---

### Task 5: Encryption service

**Files:**
- Create: `backend/src/services/encryption.py`

- [ ] **Step 1: Create `backend/src/services/encryption.py`**

```python
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from src.config import settings


def encrypt(plaintext: str) -> str:
    key = settings.encryption_key.encode()
    if len(key) != 32:
        raise ValueError("ENCRYPTION_KEY must be exactly 32 bytes.")
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, plaintext.encode(), None)
    # AES-GCM appends 16-byte auth tag to ciphertext
    ct = ciphertext[:-16]
    tag = ciphertext[-16:]
    return f"{base64.b64encode(iv).decode()}:{base64.b64encode(tag).decode()}:{base64.b64encode(ct).decode()}"


def decrypt(ciphertext: str) -> str:
    key = settings.encryption_key.encode()
    parts = ciphertext.split(":")
    if len(parts) != 3:
        raise ValueError("Invalid ciphertext format.")
    iv = base64.b64decode(parts[0])
    tag = base64.b64decode(parts[1])
    ct = base64.b64decode(parts[2])
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ct + tag, None).decode()
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/encryption.py
git commit -m "feat(backend): AES-256-GCM encryption service"
```

---

### Task 6: API routes — /me/plan and /contacts

**Files:**
- Create: `backend/src/api/__init__.py`
- Create: `backend/src/api/router.py`
- Create: `backend/src/api/plan.py`
- Create: `backend/src/api/contacts.py`

- [ ] **Step 1: Create `backend/src/api/__init__.py`**

Empty file.

- [ ] **Step 2: Create `backend/src/api/plan.py`**

```python
from datetime import date

from fastapi import APIRouter, Depends, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db

router = APIRouter()


@router.get("/me/plan")
async def get_my_plan(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)

    sub = await db.fetchrow(
        "SELECT plan_id, status, current_period_end, cancel_at_period_end FROM subscriptions WHERE user_id = $1",
        user.id,
    )
    if not sub:
        return {"error": "Nessun abbonamento trovato."}, 404

    plan = await db.fetchrow("SELECT * FROM plans WHERE id = $1", sub["plan_id"])
    if not plan:
        return {"error": "Piano non trovato."}, 500

    usage = await db.fetchrow(
        "SELECT campaigns_used, messages_used, contacts_count FROM usage_counters WHERE user_id = $1 AND period_start = $2",
        user.id,
        date.today(),
    )

    plan_dict = dict(plan)
    # Convert UUID and date for JSON serialization
    for k, v in plan_dict.items():
        if hasattr(v, "hex"):
            plan_dict[k] = str(v)
        elif isinstance(v, date):
            plan_dict[k] = v.isoformat()

    return {
        "plan": plan_dict,
        "usage": dict(usage) if usage else {"campaigns_used": 0, "messages_used": 0, "contacts_count": 0},
        "subscription": {
            "status": sub["status"],
            "current_period_end": sub["current_period_end"].isoformat() if sub["current_period_end"] else None,
            "cancel_at_period_end": sub["cancel_at_period_end"],
        },
    }
```

- [ ] **Step 3: Create `backend/src/api/contacts.py`**

```python
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db, get_redis
from src.services.plan_limits import check_plan_limit

router = APIRouter(prefix="/contacts")


@router.get("")
async def list_contacts(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    search: str = "",
    tag: str | None = None,
    page: int = Query(1, ge=1),
):
    db = get_db(request)
    limit = 50
    offset = (page - 1) * limit

    base_query = "FROM contacts WHERE user_id = $1"
    params: list = [user.id]
    idx = 2

    if search:
        base_query += f" AND (name ILIKE ${idx} OR phone ILIKE ${idx} OR email ILIKE ${idx})"
        params.append(f"%{search}%")
        idx += 1

    if tag:
        base_query += f" AND ${idx} = ANY(tags)"
        params.append(tag)
        idx += 1

    count_row = await db.fetchrow(f"SELECT count(*) {base_query}", *params)
    total = count_row["count"] if count_row else 0

    rows = await db.fetch(
        f"SELECT * {base_query} ORDER BY created_at DESC LIMIT ${idx} OFFSET ${idx + 1}",
        *params,
        limit,
        offset,
    )

    contacts = []
    for r in rows:
        d = dict(r)
        for k, v in d.items():
            if hasattr(v, "hex"):
                d[k] = str(v)
            elif hasattr(v, "isoformat"):
                d[k] = v.isoformat()
        contacts.append(d)

    return {"contacts": contacts, "total": total, "page": page, "limit": limit}


@router.post("", status_code=201)
async def create_contact(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    redis = get_redis(request)
    await check_plan_limit(db, redis, user.id, "contacts")

    body = await request.json()
    phone = body.get("phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Il numero di telefono è obbligatorio.")

    try:
        row = await db.fetchrow(
            """INSERT INTO contacts (user_id, phone, name, email, language, tags, variables, opt_in, opt_in_date)
               VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
               RETURNING *""",
            user.id,
            phone,
            body.get("name"),
            body.get("email"),
            body.get("language", "it"),
            body.get("tags", []),
            body.get("variables", "{}"),
            datetime.utcnow(),
        )
    except Exception as e:
        if "23505" in str(e):
            raise HTTPException(status_code=409, detail="Questo contatto esiste già.")
        raise HTTPException(status_code=500, detail="Errore nella creazione del contatto.")

    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
        elif hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d
```

- [ ] **Step 4: Create `backend/src/api/router.py`**

```python
from fastapi import APIRouter

from src.api.plan import router as plan_router
from src.api.contacts import router as contacts_router

api_router = APIRouter()
api_router.include_router(plan_router, tags=["plan"])
api_router.include_router(contacts_router, tags=["contacts"])
```

- [ ] **Step 5: Mount router in `backend/src/main.py`**

Add after the CORS middleware:

```python
from src.api.router import api_router

app.include_router(api_router)
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/
git commit -m "feat(backend): /me/plan and /contacts CRUD endpoints"
```

---

### Task 7: API routes — /campaigns

**Files:**
- Create: `backend/src/api/campaigns.py`
- Modify: `backend/src/api/router.py`

- [ ] **Step 1: Create `backend/src/api/campaigns.py`**

```python
import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db, get_redis
from src.services.plan_limits import check_plan_limit

router = APIRouter(prefix="/campaigns")


def _serialize_row(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
        elif hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


@router.get("")
async def list_campaigns(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    status: str | None = None,
):
    db = get_db(request)
    if status:
        rows = await db.fetch(
            "SELECT * FROM campaigns WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC",
            user.id,
            status,
        )
    else:
        rows = await db.fetch(
            "SELECT * FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC",
            user.id,
        )
    return {"campaigns": [_serialize_row(r) for r in rows]}


@router.post("", status_code=201)
async def create_campaign(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    redis = get_redis(request)
    await check_plan_limit(db, redis, user.id, "campaigns")

    body = await request.json()
    name = body.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Il nome della campagna è obbligatorio.")

    scheduled_at = body.get("scheduled_at")
    row = await db.fetchrow(
        """INSERT INTO campaigns (user_id, name, template_id, group_id, segment_query, status, scheduled_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *""",
        user.id,
        name,
        body.get("template_id"),
        body.get("group_id"),
        json.dumps(body.get("segment_query", {})),
        "scheduled" if scheduled_at else "draft",
        scheduled_at,
    )
    return _serialize_row(row)


@router.get("/{campaign_id}")
async def get_campaign(
    request: Request,
    campaign_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    row = await db.fetchrow(
        """SELECT c.*, t.name as template_name, t.category as template_category
           FROM campaigns c
           LEFT JOIN templates t ON t.id = c.template_id
           WHERE c.id = $1 AND c.user_id = $2""",
        campaign_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")
    return _serialize_row(row)


@router.put("/{campaign_id}")
async def update_campaign(
    request: Request,
    campaign_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    body = await request.json()

    # Build dynamic SET clause
    fields = []
    params = []
    idx = 1
    for key in ["name", "template_id", "group_id", "segment_query", "status", "scheduled_at"]:
        if key in body:
            fields.append(f"{key} = ${idx}")
            val = body[key]
            if key == "segment_query" and isinstance(val, dict):
                val = json.dumps(val)
            params.append(val)
            idx += 1

    if not fields:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare.")

    params.extend([campaign_id, user.id])
    row = await db.fetchrow(
        f"UPDATE campaigns SET {', '.join(fields)}, updated_at = now() WHERE id = ${idx} AND user_id = ${idx + 1} RETURNING *",
        *params,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")
    return _serialize_row(row)


@router.post("/{campaign_id}/launch")
async def launch_campaign(
    request: Request,
    campaign_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    redis = get_redis(request)
    await check_plan_limit(db, redis, user.id, "campaigns")

    row = await db.fetchrow(
        "SELECT id, status FROM campaigns WHERE id = $1 AND user_id = $2",
        campaign_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")
    if row["status"] not in ("draft", "scheduled"):
        raise HTTPException(status_code=400, detail=f"La campagna è in stato '{row['status']}'.")

    # Enqueue for agent worker
    await redis.lpush("campaigns", campaign_id)
    await db.execute(
        "UPDATE campaigns SET status = 'running', started_at = now() WHERE id = $1",
        campaign_id,
    )

    return {"success": True, "campaign_id": str(row["id"]), "launched": True}
```

- [ ] **Step 2: Update `backend/src/api/router.py`**

```python
from fastapi import APIRouter

from src.api.plan import router as plan_router
from src.api.contacts import router as contacts_router
from src.api.campaigns import router as campaigns_router

api_router = APIRouter()
api_router.include_router(plan_router, tags=["plan"])
api_router.include_router(contacts_router, tags=["contacts"])
api_router.include_router(campaigns_router, tags=["campaigns"])
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/
git commit -m "feat(backend): /campaigns CRUD + launch endpoints"
```

---

### Task 8: API routes — /admin

**Files:**
- Create: `backend/src/api/admin.py`
- Modify: `backend/src/api/router.py`

- [ ] **Step 1: Create `backend/src/api/admin.py`**

```python
from datetime import date

from fastapi import APIRouter, Depends, Request

from src.auth.permissions import require_admin
from src.auth.jwt import CurrentUser
from src.dependencies import get_db

router = APIRouter(prefix="/admin")


@router.get("/overview")
async def admin_overview(request: Request, user: CurrentUser = Depends(require_admin)):
    db = get_db(request)

    total_users = await db.fetchval("SELECT count(*) FROM users")

    subs = await db.fetch(
        "SELECT s.plan_id, p.price_cents, p.slug FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status = 'active'"
    )
    mrr = sum(r["price_cents"] for r in subs)

    today = date.today()
    today_usage = await db.fetch(
        "SELECT messages_used FROM usage_counters WHERE period_start = $1", today
    )
    messages_today = sum(r["messages_used"] for r in today_usage)

    active_campaigns = await db.fetchval("SELECT count(*) FROM campaigns WHERE status = 'running'")

    plan_breakdown: dict[str, int] = {}
    for s in subs:
        slug = s["slug"] or "unknown"
        plan_breakdown[slug] = plan_breakdown.get(slug, 0) + 1

    return {
        "total_users": total_users or 0,
        "mrr_cents": mrr,
        "messages_today": messages_today,
        "active_campaigns": active_campaigns or 0,
        "plan_breakdown": plan_breakdown,
    }


@router.get("/users")
async def admin_users(request: Request, user: CurrentUser = Depends(require_admin)):
    db = get_db(request)

    users = await db.fetch("SELECT id, email, role::text, full_name, created_at FROM users ORDER BY created_at DESC")

    user_ids = [r["id"] for r in users]
    if not user_ids:
        return {"users": []}

    subs = await db.fetch(
        "SELECT s.user_id, s.status, p.name as plan_name, p.slug as plan_slug FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.user_id = ANY($1)",
        user_ids,
    )
    usage = await db.fetch(
        "SELECT user_id, messages_used FROM usage_counters WHERE user_id = ANY($1)",
        user_ids,
    )

    sub_map = {str(s["user_id"]): s for s in subs}
    usage_map = {str(u["user_id"]): u for u in usage}

    enriched = []
    for u in users:
        uid = str(u["id"])
        sub = sub_map.get(uid)
        usg = usage_map.get(uid)
        enriched.append({
            "id": uid,
            "email": u["email"],
            "role": u["role"],
            "full_name": u["full_name"],
            "created_at": u["created_at"].isoformat() if u["created_at"] else None,
            "subscription": {
                "status": sub["status"],
                "plans": {"name": sub["plan_name"], "slug": sub["plan_slug"]},
            } if sub else None,
            "messages_used": usg["messages_used"] if usg else 0,
        })

    return {"users": enriched}


@router.get("/campaigns")
async def admin_campaigns(request: Request, user: CurrentUser = Depends(require_admin)):
    db = get_db(request)

    rows = await db.fetch(
        """SELECT c.id, c.name, c.status, c.stats, c.started_at,
                  u.email as user_email, u.full_name as user_full_name
           FROM campaigns c
           JOIN users u ON u.id = c.user_id
           WHERE c.status IN ('running', 'scheduled')
           ORDER BY c.started_at DESC NULLS LAST"""
    )

    campaigns = []
    for r in rows:
        campaigns.append({
            "id": str(r["id"]),
            "name": r["name"],
            "status": r["status"],
            "stats": r["stats"],
            "started_at": r["started_at"].isoformat() if r["started_at"] else None,
            "user": {"email": r["user_email"], "full_name": r["user_full_name"]},
        })

    return {"campaigns": campaigns}
```

- [ ] **Step 2: Update `backend/src/api/router.py`**

```python
from fastapi import APIRouter

from src.api.plan import router as plan_router
from src.api.contacts import router as contacts_router
from src.api.campaigns import router as campaigns_router
from src.api.admin import router as admin_router

api_router = APIRouter()
api_router.include_router(plan_router, tags=["plan"])
api_router.include_router(contacts_router, tags=["contacts"])
api_router.include_router(campaigns_router, tags=["campaigns"])
api_router.include_router(admin_router, tags=["admin"])
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/
git commit -m "feat(backend): admin overview, users, campaigns endpoints"
```

---

### Task 9: API routes — /settings and /templates

**Files:**
- Create: `backend/src/api/settings.py`
- Create: `backend/src/api/templates.py`
- Modify: `backend/src/api/router.py`

- [ ] **Step 1: Create `backend/src/api/settings.py`**

```python
from fastapi import APIRouter, Depends, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db
from src.services.encryption import encrypt, decrypt

router = APIRouter(prefix="/settings")


@router.get("/whatsapp")
async def get_whatsapp(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    row = await db.fetchrow("SELECT * FROM whatsapp_config WHERE user_id = $1", user.id)
    if not row:
        return {"config": None}
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
    d.pop("encrypted_token", None)
    return {"config": d}


@router.post("/whatsapp")
async def update_whatsapp(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    body = await request.json()
    token = body.get("token")
    encrypted = encrypt(token) if token else None

    await db.execute(
        """INSERT INTO whatsapp_config (user_id, phone_number_id, waba_id, encrypted_token, business_name)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id) DO UPDATE SET
             phone_number_id = EXCLUDED.phone_number_id,
             waba_id = EXCLUDED.waba_id,
             encrypted_token = COALESCE(EXCLUDED.encrypted_token, whatsapp_config.encrypted_token),
             business_name = EXCLUDED.business_name,
             updated_at = now()""",
        user.id,
        body.get("phone_number_id"),
        body.get("waba_id"),
        encrypted.encode() if encrypted else None,
        body.get("business_name"),
    )
    return {"success": True}


@router.get("/ai")
async def get_ai(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    row = await db.fetchrow("SELECT * FROM ai_config WHERE user_id = $1", user.id)
    if not row:
        return {"config": {"mode": "shared", "model": "claude-haiku-4-5-20251001", "temperature": 0.7, "max_tokens": 500}}
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
    d.pop("encrypted_api_key", None)
    return {"config": d}


@router.post("/ai")
async def update_ai(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    body = await request.json()
    api_key = body.get("api_key")
    encrypted = encrypt(api_key) if api_key else None

    await db.execute(
        """INSERT INTO ai_config (user_id, mode, encrypted_api_key, model, temperature, max_tokens)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id) DO UPDATE SET
             mode = EXCLUDED.mode,
             encrypted_api_key = COALESCE(EXCLUDED.encrypted_api_key, ai_config.encrypted_api_key),
             model = EXCLUDED.model,
             temperature = EXCLUDED.temperature,
             max_tokens = EXCLUDED.max_tokens,
             updated_at = now()""",
        user.id,
        body.get("mode", "shared"),
        encrypted.encode() if encrypted else None,
        body.get("model", "claude-haiku-4-5-20251001"),
        body.get("temperature", 0.7),
        body.get("max_tokens", 500),
    )
    return {"success": True}
```

- [ ] **Step 2: Create `backend/src/api/templates.py`**

```python
import json

from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db, get_redis
from src.services.plan_limits import check_plan_limit

router = APIRouter(prefix="/templates")


def _serialize_row(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
        elif hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


@router.get("")
async def list_templates(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    rows = await db.fetch(
        "SELECT * FROM templates WHERE user_id = $1 ORDER BY created_at DESC", user.id
    )
    return {"templates": [_serialize_row(r) for r in rows]}


@router.post("", status_code=201)
async def create_template(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    redis = get_redis(request)
    await check_plan_limit(db, redis, user.id, "templates")

    body = await request.json()
    name = body.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Il nome del template è obbligatorio.")

    row = await db.fetchrow(
        """INSERT INTO templates (user_id, name, language, category, components, status)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *""",
        user.id,
        name,
        body.get("language", "it"),
        body.get("category", "marketing"),
        json.dumps(body.get("components", [])),
        body.get("status", "approved"),
    )
    return _serialize_row(row)


@router.get("/{template_id}")
async def get_template(request: Request, template_id: str, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    row = await db.fetchrow(
        "SELECT * FROM templates WHERE id = $1 AND user_id = $2", template_id, user.id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template non trovato.")
    return _serialize_row(row)


@router.put("/{template_id}")
async def update_template(request: Request, template_id: str, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    body = await request.json()

    fields = []
    params = []
    idx = 1
    for key in ["name", "language", "category", "components", "status"]:
        if key in body:
            fields.append(f"{key} = ${idx}")
            val = body[key]
            if key == "components" and isinstance(val, list):
                val = json.dumps(val)
            params.append(val)
            idx += 1

    if not fields:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare.")

    params.extend([template_id, user.id])
    row = await db.fetchrow(
        f"UPDATE templates SET {', '.join(fields)}, updated_at = now() WHERE id = ${idx} AND user_id = ${idx + 1} RETURNING *",
        *params,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template non trovato.")
    return _serialize_row(row)
```

- [ ] **Step 3: Update `backend/src/api/router.py`**

```python
from fastapi import APIRouter

from src.api.plan import router as plan_router
from src.api.contacts import router as contacts_router
from src.api.campaigns import router as campaigns_router
from src.api.admin import router as admin_router
from src.api.settings import router as settings_router
from src.api.templates import router as templates_router

api_router = APIRouter()
api_router.include_router(plan_router, tags=["plan"])
api_router.include_router(contacts_router, tags=["contacts"])
api_router.include_router(campaigns_router, tags=["campaigns"])
api_router.include_router(admin_router, tags=["admin"])
api_router.include_router(settings_router, tags=["settings"])
api_router.include_router(templates_router, tags=["templates"])
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/
git commit -m "feat(backend): settings and templates endpoints"
```

---

### Task 10: Docker Compose — backend + Kong + Redis Stack

**Files:**
- Modify: `docker-compose.yml`
- Modify: `supabase/kong.yml`

- [ ] **Step 1: Add backend service to `docker-compose.yml`**

Add after the agent service:

```yaml
  # ── Backend API ─────────────────────────────────────────
  backend:
    container_name: wcm-backend
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8200:8200"
    volumes:
      - ./backend:/app
    environment:
      - DATABASE_URL=${DATABASE_URL:-postgresql://supabase_admin:${POSTGRES_PASSWORD:-postgres}@supabase-db:5432/postgres}
      - REDIS_URL=${REDIS_URL:-redis://redis:6379}
      - JWT_SECRET=${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}
      - AGENT_SECRET=${AGENT_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
    depends_on:
      supabase-db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - wcm-network
```

- [ ] **Step 2: Update Redis to Redis Stack in `docker-compose.yml`**

Replace the redis service:

```yaml
  redis:
    container_name: wcm-redis
    image: redis/redis-stack:latest
    ports:
      - "6379:6379"
      - "8001:8001"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - wcm-network
```

Remove the `redis-commander` service (RedisInsight is included in Redis Stack on port 8001).

- [ ] **Step 3: Update `supabase/kong.yml` with new routes**

```yaml
_format_version: "1.1"

services:
  - name: auth-v1
    url: http://supabase-auth:9999
    routes:
      - name: auth-v1-routes
        strip_path: true
        paths:
          - /auth/v1/
    plugins:
      - name: cors

  - name: rest-v1
    url: http://supabase-rest:3000
    routes:
      - name: rest-v1-routes
        strip_path: true
        paths:
          - /rest/v1/
    plugins:
      - name: cors

  - name: api-v1
    url: http://backend:8200
    routes:
      - name: api-v1-routes
        strip_path: true
        paths:
          - /api/v1/
    plugins:
      - name: cors

  - name: agent-v1
    url: http://agent:8000
    routes:
      - name: agent-v1-routes
        strip_path: true
        paths:
          - /agent/v1/
    plugins:
      - name: cors
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml supabase/kong.yml
git commit -m "feat(docker): add backend service, Redis Stack, Kong routes for /api/v1"
```

---

### Task 11: Frontend — api-client and SWR migration

**Files:**
- Create: `frontend/src/lib/api-client.ts`
- Modify: `frontend/src/hooks/usePlan.ts`
- Modify: `frontend/src/app/(dashboard)/dashboard/page.tsx`
- Modify: `frontend/src/app/(admin)/admin/page.tsx`

- [ ] **Step 1: Create `frontend/src/lib/api-client.ts`**

```typescript
import { createClient } from "@/lib/supabase/client";

const KONG_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:8100";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = await getAuthHeaders();
  return fetch(`${KONG_URL}/api/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...options.headers,
    },
  });
}

export async function apiFetcher(path: string) {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Update `frontend/src/hooks/usePlan.ts`**

```typescript
"use client";

import useSWR from "swr";
import { apiFetcher } from "@/lib/api-client";
import type { UserPlanData, PlanResource } from "@/types/plans";

export function usePlan() {
  const { data, error, isLoading, mutate } = useSWR<UserPlanData>(
    "/me/plan",
    apiFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  function canUse(feature: keyof UserPlanData["plan"]["features"]): boolean {
    if (!data) return false;
    return data.plan.features[feature] === true;
  }

  function usagePercent(resource: PlanResource): number {
    if (!data) return 0;
    const limitMap: Record<PlanResource, { limit: number; used: number }> = {
      campaigns: { limit: data.plan.max_campaigns_month, used: data.usage.campaigns_used },
      messages: { limit: data.plan.max_messages_month, used: data.usage.messages_used },
      contacts: { limit: data.plan.max_contacts, used: data.usage.contacts_count },
      templates: { limit: data.plan.max_templates, used: 0 },
      team_members: { limit: data.plan.max_team_members, used: 0 },
    };
    const check = limitMap[resource];
    if (check.limit === -1) return 0;
    return Math.round((check.used / check.limit) * 100);
  }

  return {
    plan: data?.plan ?? null,
    usage: data?.usage ?? null,
    subscription: data?.subscription ?? null,
    isLoading,
    error,
    canUse,
    usagePercent,
    mutate,
  };
}
```

- [ ] **Step 3: Update dashboard page to use api-client**

In `frontend/src/app/(dashboard)/dashboard/page.tsx`, replace the fetch calls:

```typescript
// Replace these lines:
const [planRes, campRes] = await Promise.all([
  fetch("/api/me/plan").then((r) => r.json()),
  fetch("/api/campaigns").then((r) => r.json()),
]);

// With:
import { apiFetch } from "@/lib/api-client";

const [planRes, campRes] = await Promise.all([
  apiFetch("/me/plan").then((r) => r.json()),
  apiFetch("/campaigns").then((r) => r.json()),
]);
```

- [ ] **Step 4: Update admin page to use api-client**

In `frontend/src/app/(admin)/admin/page.tsx`, replace all 3 fetch calls:

```typescript
import { apiFetch } from "@/lib/api-client";

// Replace:
fetch("/api/admin/overview").then((r) => r.json()),
fetch("/api/admin/users").then((r) => r.json()),
fetch("/api/admin/campaigns").then((r) => r.json()),

// With:
apiFetch("/admin/overview").then((r) => r.json()),
apiFetch("/admin/users").then((r) => r.json()),
apiFetch("/admin/campaigns").then((r) => r.json()),
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api-client.ts frontend/src/hooks/usePlan.ts
git add frontend/src/app/\(dashboard\)/dashboard/page.tsx
git add frontend/src/app/\(admin\)/admin/page.tsx
git commit -m "feat(frontend): api-client via Kong, migrate SWR hooks"
```

---

### Task 12: End-to-end test

- [ ] **Step 1: Rebuild all containers**

```bash
docker compose down -v
docker compose up -d --build
```

Wait ~20 seconds for all services to start.

- [ ] **Step 2: Run seed**

```bash
make seed
```

- [ ] **Step 3: Verify backend health**

```bash
curl http://localhost:8100/api/v1/health
# Expected: {"status":"ok","service":"wcm-backend"}
```

- [ ] **Step 4: Test login**

Open `http://localhost:3000/login`, login as `admin@wcm.local` / `Admin123!`.
Expected: redirect to `/dashboard`.

- [ ] **Step 5: Test dashboard loads data**

The dashboard should show stats (contacts, messages, campaigns from seed data).

- [ ] **Step 6: Test admin panel**

Navigate to `/admin`. Should show overview with 3 users, plan breakdown, campaigns.

- [ ] **Step 7: Test plan limits**

Login as `user1@test.local` / `User123!` (Starter plan: 5 campaigns/month).
Try creating campaigns — after 5, should get 402 error.

- [ ] **Step 8: Commit final state**

```bash
git add -A
git commit -m "feat: Phase 1 complete — backend API, Kong wiring, frontend migration"
```
