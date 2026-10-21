#!/usr/bin/env bash
set -euo pipefail

if [ -d "$PGDATA" ]; then
  echo "db:init: $PGDATA already exists - nothing to do."
  exit 0
fi

mkdir -p "$PWD/.pg-socket"
echo "db:init: initializing cluster at $PGDATA"
initdb \
  --username="$PGUSER" \
  --encoding=UTF8 \
  --locale=C \
  --auth-local=trust \
  --auth-host=trust \
  -D "$PGDATA" >/dev/null

{
  echo "listen_addresses = '127.0.0.1'"
  echo "port = $PGPORT"
  echo "unix_socket_directories = '$PWD/.pg-socket'"
} >>"$PGDATA/postgresql.conf"

echo "db:init: done. Run 'bun run db:up' to start."
