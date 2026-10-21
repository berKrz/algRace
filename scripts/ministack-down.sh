#!/usr/bin/env bash
set -euo pipefail
docker stop algrace-ministack >/dev/null 2>&1 || true
