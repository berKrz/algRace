#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "ministack:up: docker not on PATH." >&2
  exit 1
fi

if docker ps --format '{{.Names}}' | grep -q '^algrace-ministack$'; then
  echo "ministack:up: already running."
  exit 0
fi

echo "ministack:up: starting on :4566"
docker run -d --rm \
  --name algrace-ministack \
  -p 4566:4566 \
  ministackorg/ministack:latest >/dev/null

echo "ministack:up: ready at $AWS_ENDPOINT_URL"
