# syntax=docker/dockerfile:1.7
# Custom Postgres image baking the Wamply migrations + seed inside
# /docker-entrypoint-initdb.d/. Used by demo/docker-compose.demo.yml so the
# end-user only needs `docker pull` — no checked-out repo, no bind mount.
#
# Build context must be the repo root (./) because we need both supabase/
# and demo/db/ in scope. The demo/docker-publish workflow handles this.

FROM supabase/postgres:15.8.1.060

# All numbered migrations are copied verbatim. The Postgres entrypoint runs
# every *.sql file in alphabetical order on first boot only (i.e. when the
# data volume is empty).
COPY supabase/migrations/*.sql /docker-entrypoint-initdb.d/

# Final seed (Z-prefix forces it to run AFTER all numbered migrations).
COPY supabase/seed.sql /docker-entrypoint-initdb.d/zz_seed.sql
