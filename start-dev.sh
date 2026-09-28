#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_NAME="yomu-postgres"

if ! docker ps -a --format '{{.Names}}' | grep -qx "$DB_NAME"; then
  echo "Starting Postgres container..."
  docker run -d --name "$DB_NAME" \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=yomu \
    -p 5432:5432 \
    postgres:16-alpine
else
  if ! docker ps --format '{{.Names}}' | grep -qx "$DB_NAME"; then
    echo "Starting existing Postgres container..."
    docker start "$DB_NAME"
  fi
fi

until pg_isready -h localhost -p 5432 >/dev/null 2>&1; do
  echo "Waiting for Postgres..."
  sleep 1
done

echo "Running Prisma migrations..."
cd "$ROOT_DIR/server"
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
