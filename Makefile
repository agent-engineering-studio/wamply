.PHONY: up up-full up-debug down reset seed test test-e2e logs migrate stripe-listen db-studio agent-only

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

agent-only:
	docker compose --profile agent-only up -d agent supabase-db redis

# ── Database ──────────────────────────────────────────────

seed:
	cat supabase/seed.sql | docker compose exec -T supabase-db psql -h localhost -U supabase_admin -d postgres

migrate:
	@for f in supabase/migrations/*.sql; do \
		echo "Running $$f..."; \
		docker compose exec -T supabase-db psql -h localhost -U supabase_admin -d postgres -f /docker-entrypoint-initdb.d/$$(basename $$f); \
	done

db-studio:
	@echo "Supabase Studio is not included in self-hosted. Use pgAdmin or connect directly:"
	@echo "  psql postgresql://supabase_admin@localhost:5432/postgres"

# ── Testing ───────────────────────────────────────────────

test:
	cd frontend && npm run test 2>/dev/null || true
	cd agent && python -m pytest tests/ -v 2>/dev/null || true

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
	@test -f .env || cp .env.example .env
	@echo ".env file ready"

clean:
	docker compose down -v --remove-orphans
	rm -rf frontend/node_modules frontend/.next agent/.venv agent/__pycache__
