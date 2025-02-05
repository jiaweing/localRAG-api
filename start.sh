#!/bin/sh

set -e

echo "Building application..."
pnpm build

echo "Running database migrations..."
pnpm db:migrate

echo "Starting API..."
exec pnpm dev
