#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "ministack:up: docker not on PATH." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q '^algrace-ministack$'; then
  echo "ministack:up: starting on :4566"
  docker run -d --rm \
    --name algrace-ministack \
    -p 4566:4566 \
    ministackorg/ministack:latest >/dev/null
fi

echo "ministack:up: waiting for :4566"
for i in {1..100}; do
  if curl -s --max-time 1 http://127.0.0.1:4566/ >/dev/null 2>&1; then
    echo "ministack:up: ready at $AWS_ENDPOINT_URL"
    exit 0
  fi
  sleep 0.1
done

echo "ministack:up: timed out waiting for :4566" >&2
exit 1
