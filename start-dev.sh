#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Generating Prisma client and running migrations..."
cd "$ROOT_DIR/server"
npx prisma generate
npx prisma migrate deploy

echo "Starting backend..."
( npm run dev ) &
BACKEND_PID=$!

sleep 2

echo "Starting frontend..."
cd "$ROOT_DIR/client"
( npm run dev ) &
FRONTEND_PID=$!

printf "\nDevelopment servers started.\n"
printf "Backend PID: %s\n" "$BACKEND_PID"
printf "Frontend PID: %s\n" "$FRONTEND_PID"
wait "$BACKEND_PID" "$FRONTEND_PID"
