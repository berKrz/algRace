#!/usr/bin/env bash
set -euo pipefail

if [ ! -d "$PGDATA" ]; then
  echo "db:up: no cluster at $PGDATA. Run 'bun run db:init' first." >&2
  exit 1
fi

if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  echo "db:up: already running."
else
  pg_ctl -D "$PGDATA" -l "$PGDATA/postgres.log" start >/dev/null
fi

until pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null 2>&1; do
  sleep 0.1
done

if ! psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -lqt |
  cut -d \| -f 1 | grep -qw "$PGDATABASE"; then
  createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$PGDATABASE"
fi

echo "db:up: ready at $DATABASE_URL"
