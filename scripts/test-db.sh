#!/usr/bin/env bash
# Applies the migrations to a throwaway database on a local PostgreSQL (with a small Supabase
# shim) and runs the behaviour tests.
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DB="boston_home_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT

psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/supabase_shim.sql
for f in supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/test_init.sql
