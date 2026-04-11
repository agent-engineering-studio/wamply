.PHONY: up up-full up-debug down reset seed test test-e2e logs migrate stripe-listen db-studio agent-only setup env clean

# ── Shell detection (Windows compat) ─────────────────────
ifdef OS
  SHELL := cmd.exe
  .SHELLFLAGS := /c
  COPY_ENV = if not exist .env copy .env.example .env
  SLEEP = timeout /nobreak 8 >nul
  CAT_SEED = type supabase\seed.sql | docker compose exec -T supabase-db psql -h localhost -U supabase_admin -d postgres
  RM_CLEAN = if exist frontend\node_modules rmdir /s /q frontend\node_modules & if exist frontend\.next rmdir /s /q frontend\.next
else
  COPY_ENV = test -f .env || cp .env.example .env
  SLEEP = sleep 8
  CAT_SEED = cat supabase/seed.sql | docker compose exec -T supabase-db psql -h localhost -U supabase_admin -d postgres
  RM_CLEAN = rm -rf frontend/node_modules frontend/.next agent/.venv agent/__pycache__
endif

# ── Docker Compose ────────────────────────────────────────

up:
	docker compose up -d

up-full:
	docker compose --profile full up -d

up-debug:
	docker compose --profile debug up -d

down:
	docker compose down

reset:
	docker compose down -v
	docker compose up -d
	@echo Waiting for DB to be ready...
	@$(SLEEP)
	$(MAKE) seed
	@echo Reset complete. Seed data loaded.

setup: env reset
	@echo.
	@echo ========================================================
	@echo   Wamply dev environment ready!
	@echo.
	@echo   Frontend:  http://localhost:3000
	@echo   Admin:     http://localhost:3000/admin
	@echo   GoTrue:    http://localhost:9999
	@echo   PostgREST: http://localhost:3001
	@echo.
	@echo   Login credentials:
	@echo   Admin:  admin@wcm.local     / Admin123!
	@echo   User 1: user1@test.local    / User123!
	@echo   User 2: user2@test.local    / User123!
	@echo ========================================================

agent-only:
	docker compose --profile agent-only up -d agent supabase-db redis

# ── Database ──────────────────────────────────────────────

seed:
	$(CAT_SEED)

migrate:
	docker compose exec -T supabase-db bash -c "for f in /docker-entrypoint-initdb.d/*.sql; do echo Running $$f...; psql -h localhost -U supabase_admin -d postgres -f $$f; done"

db-studio:
	@echo Supabase Studio is not included in self-hosted. Use pgAdmin or connect directly:
	@echo   psql postgresql://supabase_admin@localhost:5432/postgres

# ── Testing ───────────────────────────────────────────────

test:
	cd frontend && npm run test

test-e2e:
	cd frontend && npx playwright test

# ── Logs ──────────────────────────────────────────────────

logs:
	docker compose logs -f

logs-agent:
	docker compose logs -f agent

logs-frontend:
	docker compose logs -f frontend

# ── Stripe ────────────────────────────────────────────────

stripe-listen:
	stripe listen --forward-to localhost:3000/api/billing/webhook

# ── Utilities ─────────────────────────────────────────────

env:
	@$(COPY_ENV)
	@echo .env file ready

clean:
	docker compose down -v --remove-orphans
	$(RM_CLEAN)
