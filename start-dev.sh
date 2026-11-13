#!/usr/bin/env bash
# Sets up everything a fresh clone needs, then starts the backend and frontend.
# Safe to run every time: each setup step is skipped when it's already done,
# and older installs are brought up to date.
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT=3001
FRONTEND_PORT=5173

# The server imports Prisma's generated TypeScript directly, which needs
# Node's built-in type stripping (Node 22.18+, or 23.6+).
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node 22.18 or newer from https://nodejs.org" >&2
  exit 1
fi

if ! node -e '
  const [major, minor] = process.versions.node.split(".").map(Number)
  process.exit(major >= 24 || (major === 23 && minor >= 6) || (major === 22 && minor >= 18) ? 0 : 1)
'; then
  echo "Node $(node -v) is too old. Install Node 22.18 or newer from https://nodejs.org" >&2
  exit 1
fi

# If the app is already running (say, in another terminal), the backend would
# crash on its port. Stop now with a clear message instead.
for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  # Exits 0 if anything accepts a connection on the port, over IPv4 or IPv6.
  # Connections are closed politely so whatever is listening isn't disturbed.
  if node -e '
    const net = require("net")
    const port = Number(process.argv[1])
    let pending = 2
    let inUse = false
    for (const host of ["127.0.0.1", "::1"]) {
      const socket = net.connect({ port, host })
      socket.on("connect", () => { inUse = true; socket.end() })
      socket.on("error", () => {})
      socket.on("close", () => { if (--pending === 0) process.exit(inUse ? 0 : 1) })
    }
  ' "$port"; then
    echo "Port $port is already in use. Yomu may already be running in another terminal;" >&2
    echo "stop it there (Ctrl+C) and run this again." >&2
    exit 1
  fi
done

# Install dependencies when they're missing, when package-lock.json has
# changed since the last install (e.g. after pulling a branch that adds one),
# or when Node has changed since then: better-sqlite3 is compiled for the
# Node version it was installed with, and crashes under another one.
install_deps() {
  local dir="$1"
  local stamp="$dir/node_modules/.installed-node-version"
  if [ ! -f "$dir/node_modules/.package-lock.json" ] ||
     [ "$dir/package-lock.json" -nt "$dir/node_modules/.package-lock.json" ] ||
     [ "$(cat "$stamp" 2>/dev/null)" != "$(node -v)" ]; then
    echo "Installing dependencies in $(basename "$dir")/..."
    (cd "$dir" && npm ci)
    node -v > "$stamp"
  fi
}

install_deps "$ROOT_DIR/server"
install_deps "$ROOT_DIR/client"

# server/.env is gitignored, so a fresh clone doesn't have one, and one from
# an older version of the project may be missing settings added since. Add
# whatever is missing and leave existing values alone.
ENV_FILE="$ROOT_DIR/server/.env"
add_env_default() {
  local name="$1" value="$2"
  if ! grep -q "^$name=" "$ENV_FILE" 2>/dev/null; then
    # Don't glue the new line onto a last line that has no newline
    if [ -s "$ENV_FILE" ] && [ -n "$(tail -c 1 "$ENV_FILE")" ]; then
      echo >> "$ENV_FILE"
    fi
    echo "$name=$value" >> "$ENV_FILE"
    echo "Added $name to server/.env"
  fi
}

add_env_default DATABASE_URL '"file:./dev.db"'
add_env_default PORT "$BACKEND_PORT"
# The project's shared Google OAuth client ID (public, not a secret); the
# client's copy is committed in client/.env. Keeps an existing value, so
# someone using their own client ID isn't overwritten.
add_env_default GOOGLE_CLIENT_ID '"438904717555-j3g3g835m5cklkm9fmnqv089qodsg31k.apps.googleusercontent.com"'
# JWT_SECRET signs login sessions, so it's random per machine
add_env_default JWT_SECRET "\"$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')\""

echo "Generating Prisma client and running migrations..."
cd "$ROOT_DIR/server"
npx prisma generate

if ! MIGRATE_OUTPUT="$(npx prisma migrate deploy 2>&1)"; then
  echo "$MIGRATE_OUTPUT" >&2
  # P3005: the database has tables but no migration history (e.g. it was made
  # with `prisma db push`). P3009/P3018: a migration failed partway.
  if grep -qE "P3005|P3009|P3018" <<< "$MIGRATE_OUTPUT"; then
    # The database file DATABASE_URL points at, e.g. "file:./dev.db" -> dev.db
    DB_FILE="$(sed -nE 's/^DATABASE_URL="?file:(\.\/)?([^"]*)"?.*/\2/p' "$ENV_FILE")"
    DB_FILE="server/${DB_FILE:-dev.db}"
    echo >&2
    echo "Your local database ($DB_FILE) can't be updated automatically." >&2
    echo "If you don't need its data, delete $DB_FILE and run this again;" >&2
    echo "a fresh database will be created with every migration applied." >&2
  fi
  exit 1
fi
echo "$MIGRATE_OUTPUT"

# The dictionary is built from a download rather than kept in git, so a
# fresh clone doesn't have it. Build it once; `npm run dictionary` in
# server/ updates it to a newer JMdict later. Without it the reader still
# works, but word lookups only know a short built-in list.
if [ ! -f "$ROOT_DIR/server/dictionary.db" ]; then
  echo "Building the dictionary (one-time download of about 18 MB)..."
  if ! npm run dictionary; then
    echo "Couldn't build the dictionary. Word lookups will only know a few common words" >&2
    echo "until you run \`npm run dictionary\` in server/." >&2
  fi
fi

echo "Starting backend..."
( npm run dev ) &
BACKEND_PID=$!

sleep 2

echo "Starting frontend..."
cd "$ROOT_DIR/client"
( npm run dev ) &
FRONTEND_PID=$!

# Stop both servers together, whether one crashes or you press Ctrl+C.
trap 'kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null' EXIT

printf "\nDevelopment servers started. Open http://localhost:%s\n" "$FRONTEND_PORT"
printf "Backend PID: %s\n" "$BACKEND_PID"
printf "Frontend PID: %s\n" "$FRONTEND_PID"
wait "$BACKEND_PID" "$FRONTEND_PID"
