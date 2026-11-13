-- Google sign-in: accounts made through Google have no password, so
-- passwordHash becomes optional, and googleId records which Google account
-- an account belongs to. SQLite can't change a column's nullability in
-- place, so the User table is rebuilt (existing rows are copied across).

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desiredRetention" REAL NOT NULL DEFAULT 0.9
);
INSERT INTO "new_User" ("createdAt", "desiredRetention", "email", "id", "passwordHash") SELECT "createdAt", "desiredRetention", "email", "id", "passwordHash" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
