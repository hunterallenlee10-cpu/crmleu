#!/usr/bin/env bash
# Runs supabase/migrations + supabase/tests against a throwaway local Postgres,
# for machines without Docker. Needs Postgres 15+ server binaries, pgTAP and
# pg_prove installed (e.g. apt install postgresql-16 postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl).
# With Docker, prefer: npx supabase start && npx supabase test db
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PORT:-54329}"
TMP="$(mktemp -d)"
trap '"$PGBIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

"$PGBIN/initdb" -D "$TMP/data" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null

export PGHOST="$TMP" PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/db-test/supabase-stub.sql"
psql -q -v ON_ERROR_STOP=1 -c 'create extension pgtap with schema extensions'
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate: $(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -f "$f"
done

pg_prove --ext .sql -r "$ROOT/supabase/tests"
