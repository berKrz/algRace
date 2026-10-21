#!/usr/bin/env bash
set -euo pipefail
pg_ctl -D "$PGDATA" stop -m fast
