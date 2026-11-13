-- sessionVersion is stamped into each session token. Bumping it logs out
-- every existing session for that account (see attachUser in src/index.js).
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
