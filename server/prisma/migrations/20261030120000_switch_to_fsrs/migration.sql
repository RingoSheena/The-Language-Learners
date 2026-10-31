-- Switch flashcard scheduling from SM-2 to FSRS: replace ease and streak
-- with stability and difficulty. Reviewed cards keep their due dates and
-- get FSRS values estimated from their SM-2 schedule: stability from the
-- current interval, difficulty from ease (2.5 -> 5, 1.3 -> 10). FSRS
-- corrects both over the next few reviews. Unreviewed cards stay new.

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
    "stability" REAL,
    "difficulty" REAL,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" DATETIME,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Flashcard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Flashcard" ("createdAt", "definition", "dueAt", "id", "intervalDays", "japanese", "lapses", "lastReviewedAt", "reading", "updatedAt", "userId", "stability", "difficulty")
SELECT "createdAt", "definition", "dueAt", "id", "intervalDays", "japanese", "lapses", "lastReviewedAt", "reading", "updatedAt", "userId",
    CASE WHEN "lastReviewedAt" IS NULL THEN NULL ELSE MAX("intervalDays", 0.5) END,
    CASE WHEN "lastReviewedAt" IS NULL THEN NULL ELSE MIN(10, MAX(1, 5 + (2.5 - "ease") * 5 / 1.2)) END
FROM "Flashcard";
DROP TABLE "Flashcard";
ALTER TABLE "new_Flashcard" RENAME TO "Flashcard";
CREATE UNIQUE INDEX "Flashcard_userId_japanese_key" ON "Flashcard"("userId", "japanese");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
