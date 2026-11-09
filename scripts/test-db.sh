#!/usr/bin/env bash
# Prueba las migraciones y las reglas de base de datos en un PostgreSQL local (nunca contra Neon de producción).
# Uso: PGHOST=... PGPORT=... PGUSER=postgres ./scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DB="preloved_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT

DATABASE_URL="postgres://${PGUSER:-postgres}@/${DB}?host=${PGHOST:-/var/run/postgresql}&port=${PGPORT:-5432}" node scripts/migrate.mjs
psql -qtA -v ON_ERROR_STOP=1 -d "$DB" -f db/tests/integration.sql | grep -v "^$"
