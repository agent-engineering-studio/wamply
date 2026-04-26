.PHONY: up up-full up-debug down reset seed test test-e2e logs migrate setup env clean rebuild build dev dev-services

# ── Shell detection (Windows compat) ─────────────────────
ifdef OS
  SHELL := cmd.exe
  .SHELLFLAGS := /c
  COPY_ENV = if not exist .env copy .env.example .env
  SLEEP = timeout /nobreak 12 >nul
  CAT_SEED = type supabase\seed.sql | docker compose exec -T supabase-db psql -h localhost -U supabase_admin -d postgres
  RM_CLEAN = if exist frontend\node_modules rmdir /s /q frontend\node_modules & if exist frontend\.next rmdir /s /q frontend\.next
  RM_NEXT = if exist frontend\.next rmdir /s /q frontend\.next
else
  COPY_ENV = test -f .env || cp .env.example .env
  SLEEP = sleep 12
  CAT_SEED = cat supabase/seed.sql | docker compose exec -T supabase-db psql -h localhost -U supabase_admin -d postgres
  RM_CLEAN = rm -rf frontend/node_modules frontend/.next agent/.venv agent/__pycache__ backend/.venv backend/__pycache__
  RM_NEXT = rm -rf frontend/.next
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

build:
	docker compose build

rebuild:
	docker compose build backend agent
	docker compose stop frontend
	$(RM_NEXT)
	docker compose up -d
	@echo Stack completo riavviato con il codice aggiornato.

refresh: down build up-full
	@echo Stack completo riavviato con le immagini ricostruite.
	
reset:
	docker compose down -v
	docker compose up -d --build
	@echo Waiting for DB and services to be ready...
	@$(SLEEP)
	$(MAKE) seed
	@echo Reset complete. Seed data loaded.

setup: env reset
	@echo.
	@echo ========================================================
	@echo   Wamply dev environment ready!
	@echo.
	@echo   Frontend:    http://localhost:3000
	@echo   Dashboard:   http://localhost:3000/dashboard
	@echo   Admin:       http://localhost:3000/admin
	@echo   Backend API: http://localhost:8100/api/v1/health
	@echo   Kong:        http://localhost:8100
	@echo   RedisInsight: http://localhost:8001
	@echo.
	@echo   Login credentials:
	@echo   Admin:  admin@wcm.local     / Admin123!
	@echo   User 1: user1@test.local    / User123!
	@echo   User 2: user2@test.local    / User123!
	@echo ========================================================

# ── Local Debug (no app containers) ──────────────────────

dev-services:
	docker compose stop frontend backend agent 2>nul & docker compose up -d supabase-db redis supabase-auth supabase-rest supabase-kong

dev:
	scripts\dev-all.bat

# ── Database ──────────────────────────────────────────────

seed:
	$(CAT_SEED)

migrate:
	docker compose exec -T supabase-db bash -c "for f in /docker-entrypoint-initdb.d/*.sql; do echo Running $$f...; psql -h localhost -U supabase_admin -d postgres -f $$f; done"

db-shell:
	docker compose exec supabase-db psql -h localhost -U supabase_admin -d postgres

# ── Testing ───────────────────────────────────────────────

test:
	cd frontend && npm run test
	cd backend && python -m pytest tests/ -v

test-e2e:
	cd frontend && npx playwright test

# ── Logs ──────────────────────────────────────────────────

logs:
	docker compose logs -f

logs-frontend:
	docker compose logs -f frontend

logs-backend:
	docker compose logs -f backend

logs-agent:
	docker compose logs -f agent

# ── Health Checks ─────────────────────────────────────────

health:
	@echo --- Kong Gateway ---
	@curl -s http://localhost:8100/api/v1/health 2>nul || echo UNREACHABLE
	@echo.
	@echo --- GoTrue Auth ---
	@curl -s http://localhost:8100/auth/v1/health 2>nul || echo UNREACHABLE
	@echo.
	@echo --- PostgREST ---
	@curl -s http://localhost:3001/ 2>nul || echo UNREACHABLE
	@echo.

# ── Stripe ────────────────────────────────────────────────

stripe-listen:
	stripe listen --forward-to http://localhost:8100/api/v1/billing/webhook

# ── Utilities ─────────────────────────────────────────────

env:
	@$(COPY_ENV)
	@echo .env file ready

clean:
	docker compose down -v --remove-orphans
	$(RM_CLEAN)
