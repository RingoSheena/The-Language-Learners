-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Flashcard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "japanese" TEXT NOT NULL,
    "reading" TEXT NOT NULL DEFAULT '',
    "definition" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "dueAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intervalDays" REAL NOT NULL DEFAULT 0,
    "ease" REAL NOT NULL DEFAULT 2.5,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" DATETIME,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Flashcard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Flashcard" ("createdAt", "definition", "id", "japanese", "reading", "updatedAt", "userId") SELECT "createdAt", "definition", "id", "japanese", "reading", "updatedAt", "userId" FROM "Flashcard";
DROP TABLE "Flashcard";
ALTER TABLE "new_Flashcard" RENAME TO "Flashcard";
CREATE UNIQUE INDEX "Flashcard_userId_japanese_key" ON "Flashcard"("userId", "japanese");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
