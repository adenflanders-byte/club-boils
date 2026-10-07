#!/usr/bin/env bash
# Usage: db/test/run.sh "<psql connection args>"   e.g. "-h /tmp -p 5433 -U postgres"
set -euo pipefail
CONN="$1"
P="psql $CONN -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists cbtest" -c "create database cbtest"
for f in db/test/00_supabase_stub.sql db/test/01_existing_schema.sql \
         db/migrations/001_secure_foundation_and_school_events.sql \
         db/migrations/001_secure_foundation_and_school_events.sql \
         db/migrations/002_lock_down_public_access.sql \
         db/migrations/002_lock_down_public_access.sql; do
  $P -d cbtest -f "$f" 2>&1 | { grep -v NOTICE || true; }
done
$P -d cbtest -f db/test/10_database_tests.sql 2>&1 | grep -E "passed|ERROR" | sed 's/^psql:[^ ]* //'
