"""Popola la tabella contacts con ~30 contatti fake per un utente.

Uso (dentro il container backend):

    docker compose exec backend python -m scripts.seed_fake_contacts \\
        --user-id 336fc883-7c5c-486e-a531-f7502cb304ef

Oppure passa l'email invece dell'id:

    docker compose exec backend python -m scripts.seed_fake_contacts \\
        --email gzileni@hotmail.com

NB: script SOLO dev — non invocato dalle migrazioni, non committato al DB di
produzione. Skippa via `ON CONFLICT DO NOTHING` i contatti già presenti con lo
stesso phone.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

import asyncpg


FAKE_CONTACTS: list[dict] = [
    # ── VIP clienti (Milano/Nord) ────────────────────────────
    {"phone": "+39 333 1010101", "name": "Marco Rossi", "email": "marco.rossi@example.it",
     "tags": ["vip", "clienti"], "language": "it", "variables": {"city": "Milano", "last_order": "2026-03-14"}},
    {"phone": "+39 333 1010202", "name": "Giulia Bianchi", "email": "giulia.bianchi@example.it",
     "tags": ["vip", "clienti", "newsletter"], "language": "it", "variables": {"city": "Milano"}},
    {"phone": "+39 333 1010303", "name": "Andrea Colombo", "email": "a.colombo@example.it",
     "tags": ["vip", "clienti"], "language": "it", "variables": {"city": "Monza"}},
    {"phone": "+39 340 2020101", "name": "Chiara Moretti", "email": "chiara.m@example.it",
     "tags": ["vip"], "language": "it", "variables": {"city": "Brescia"}},

    # ── Clienti standard ─────────────────────────────────────
    {"phone": "+39 345 3030101", "name": "Luca Ferrari", "email": "luca.ferrari@example.it",
     "tags": ["clienti"], "language": "it", "variables": {"city": "Bologna"}},
    {"phone": "+39 345 3030202", "name": "Sara Esposito", "email": "sara.e@example.it",
     "tags": ["clienti", "newsletter"], "language": "it", "variables": {"city": "Napoli"}},
    {"phone": "+39 345 3030303", "name": "Paolo Greco", "email": "paolo.greco@example.it",
     "tags": ["clienti"], "language": "it", "variables": {"city": "Roma"}},
    {"phone": "+39 345 3030404", "name": "Martina Romano", "email": "martina.r@example.it",
     "tags": ["clienti"], "language": "it", "variables": {"city": "Firenze"}},
    {"phone": "+39 345 3030505", "name": "Federico Galli", "email": "federico.g@example.it",
     "tags": ["clienti"], "language": "it", "variables": {"city": "Torino"}},

    # ── Newsletter only ──────────────────────────────────────
    {"phone": "+39 347 4040101", "name": "Silvia Conti", "email": "silvia.conti@example.it",
     "tags": ["newsletter"], "language": "it", "variables": {"city": "Genova"}},
    {"phone": "+39 347 4040202", "name": "Davide Ricci", "email": "davide.ricci@example.it",
     "tags": ["newsletter"], "language": "it", "variables": {"city": "Padova"}},
    {"phone": "+39 347 4040303", "name": "Valentina Marino", "email": "v.marino@example.it",
     "tags": ["newsletter"], "language": "it", "variables": {"city": "Verona"}},
    {"phone": "+39 347 4040404", "name": "Roberto Fontana", "email": "r.fontana@example.it",
     "tags": ["newsletter"], "language": "it", "variables": {"city": "Parma"}},

    # ── Lead freddi (potenziali clienti) ─────────────────────
    {"phone": "+39 339 5050101", "name": "Elena Russo", "email": "elena.russo@example.it",
     "tags": ["lead"], "language": "it", "variables": {"city": "Bari", "source": "sito"}},
    {"phone": "+39 339 5050202", "name": "Gabriele Costa", "email": "g.costa@example.it",
     "tags": ["lead"], "language": "it", "variables": {"city": "Cagliari", "source": "facebook"}},
    {"phone": "+39 339 5050303", "name": "Francesca Gallo", "email": "francesca.g@example.it",
     "tags": ["lead"], "language": "it", "variables": {"city": "Palermo", "source": "instagram"}},
    {"phone": "+39 339 5050404", "name": "Stefano De Luca", "email": "stefano.dl@example.it",
     "tags": ["lead"], "language": "it", "variables": {"city": "Messina"}},

    # ── Contatti stranieri (en/es/de/fr) ─────────────────────
    {"phone": "+44 7700 900101", "name": "John Smith", "email": "john.smith@example.co.uk",
     "tags": ["clienti", "newsletter"], "language": "en", "variables": {"city": "London"}},
    {"phone": "+44 7700 900202", "name": "Emily Johnson", "email": "emily.j@example.co.uk",
     "tags": ["vip"], "language": "en", "variables": {"city": "Manchester"}},
    {"phone": "+1 415 555 0101", "name": "Michael Brown", "email": "m.brown@example.com",
     "tags": ["lead"], "language": "en", "variables": {"city": "San Francisco"}},
    {"phone": "+34 612 345 678", "name": "María García", "email": "maria.g@example.es",
     "tags": ["clienti"], "language": "es", "variables": {"city": "Barcelona"}},
    {"phone": "+34 612 345 679", "name": "Carlos Fernández", "email": "c.fernandez@example.es",
     "tags": ["newsletter"], "language": "es", "variables": {"city": "Madrid"}},
    {"phone": "+49 151 234 5678", "name": "Hans Müller", "email": "h.mueller@example.de",
     "tags": ["clienti", "vip"], "language": "de", "variables": {"city": "München"}},
    {"phone": "+49 151 234 5679", "name": "Anna Schmidt", "email": "a.schmidt@example.de",
     "tags": ["newsletter"], "language": "de", "variables": {"city": "Berlin"}},
    {"phone": "+33 6 12 34 56 78", "name": "Sophie Martin", "email": "sophie.martin@example.fr",
     "tags": ["clienti"], "language": "fr", "variables": {"city": "Paris"}},
    {"phone": "+33 6 12 34 56 79", "name": "Pierre Dubois", "email": "p.dubois@example.fr",
     "tags": ["lead"], "language": "fr", "variables": {"city": "Lyon"}},

    # ── Senza tag (candidati per smart-tag suggest) ──────────
    {"phone": "+39 366 6060101", "name": "Alessia Barbieri", "email": "a.barbieri@example.it",
     "tags": [], "language": "it", "variables": {"city": "Trieste"}},
    {"phone": "+39 366 6060202", "name": "Matteo Rizzo", "email": "m.rizzo@example.it",
     "tags": [], "language": "it", "variables": {"city": "Catania"}},
    {"phone": "+39 366 6060303", "name": "Giorgia Caruso", "email": "g.caruso@example.it",
     "tags": [], "language": "it", "variables": {}},
    {"phone": "+39 366 6060404", "name": "Riccardo Bruno", "email": None,
     "tags": [], "language": "it", "variables": {}},
]


async def resolve_user_id(
    pool: asyncpg.Pool, user_id: str | None, email: str | None
) -> str:
    if user_id:
        row = await pool.fetchrow("SELECT id FROM users WHERE id = $1", user_id)
        if not row:
            sys.exit(f"Nessun utente con id {user_id}")
        return str(row["id"])
    if email:
        row = await pool.fetchrow("SELECT id FROM users WHERE email = $1", email)
        if not row:
            sys.exit(f"Nessun utente con email {email}")
        return str(row["id"])
    sys.exit("Passa --user-id oppure --email")


async def main(user_id: str | None, email: str | None) -> None:
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL non settata. Esegui lo script via `docker compose exec backend ...`")

    pool = await asyncpg.create_pool(dsn)
    uid = await resolve_user_id(pool, user_id, email)

    print(f"→ Seed {len(FAKE_CONTACTS)} contatti per user_id={uid}")
    inserted = 0
    skipped = 0
    async with pool.acquire() as conn, conn.transaction():
        for c in FAKE_CONTACTS:
            result = await conn.execute(
                """INSERT INTO contacts
                     (user_id, phone, name, email, language, tags, variables, opt_in, opt_in_date)
                   VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, true, now())
                   ON CONFLICT (user_id, phone) DO NOTHING""",
                uid, c["phone"], c["name"], c.get("email"), c["language"],
                c["tags"], json.dumps(c.get("variables") or {}),
            )
            if result.endswith(" 1"):
                inserted += 1
            else:
                skipped += 1

    total = await pool.fetchval(
        "SELECT count(*) FROM contacts WHERE user_id = $1", uid,
    )
    print(f"✓ Inseriti: {inserted} · Saltati (già presenti): {skipped} · Totale ora: {total}")
    await pool.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed fake contacts for dev/test")
    parser.add_argument("--user-id", help="UUID dell'utente")
    parser.add_argument("--email", help="Email utente (in alternativa a --user-id)")
    args = parser.parse_args()
    asyncio.run(main(args.user_id, args.email))
