#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Stopping app processes..."
pkill -f "/workspaces/The-Language-Learners/client.*vite" || true
pkill -f "/workspaces/The-Language-Learners/server.*nodemon src/index.js" || true
pkill -f "/workspaces/The-Language-Learners/server.*node src/index.js" || true

printf "\nStopped local dev environment.\n"
