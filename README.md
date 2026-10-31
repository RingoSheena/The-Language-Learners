# The-Language-Learners

Yomu 
Japanese Reading & Flashcard Suite

## Reading progress and bookmarks

- Opening a book resumes your last reading position automatically. The bookshelf shows a Resume label and percentage for started books.
- Use **Add bookmark** in the reader to save the current passage. Open **Bookmarks** to jump to a saved passage or remove it.
- Positions follow text when you change font size, window size, or writing direction; image-only passages use percentage progress as a fallback.
- Progress and bookmarks are saved per book to your account, so they follow you to other devices. Progress saved in a browser before syncing existed is moved to your account the first time you open that book there. Deleting a book also removes its reading state.

## Accounts, books and flashcards

- Learners register and log in with an email and password. Logging in starts a 7-day session, and **Log out** ends it. The bookshelf and flashcards pages send you to the login page if you aren't logged in.
- Uploaded books and saved flashcards are stored in the server's database under your account, so each learner only sees their own and they follow you to other devices.
- Flashcards are created from a word's definition popup in the reader. On the **Flashcards** page, **Practice** reviews the cards that are due, and **Browse** opens a table of every card where you can search, edit, or remove them. Search matches the Japanese word, its reading, or the English definition; hiragana and katakana find each other, and width and capitalization don't matter.
- The **Flashcards** page shows your practice stats: streak (days in a row with at least one review), cards reviewed and time spent today, a 7-day daily average, retention (how often you pass cards you know well), cards due soon, a new/learning/young/mature breakdown, and a year-long heatmap of reviews per day. A day ends at 4am local time, and each answer counts for at most 60 seconds.
- The **Browse** table shows each card's review count, pass rate, and average answer time. Cards failed 8 or more times are marked **Leech**; click it to reword the card.

## Dictionary

- Holding the definition hotkey over a word in the reader looks it up in [JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project), the full English edition (over 200,000 entries). Conjugated words are traced back to their dictionary form, and a conjugation only matches words of the right part of speech.
- The dictionary is stored on the server in `server/dictionary.db`, which isn't in git. `start-dev.sh` builds it the first time; run `npm run dictionary` in `server/` (with the server stopped) to update it to the latest JMdict release from [jmdict-simplified](https://github.com/scriptin/jmdict-simplified).
- JMdict is the property of the [EDRDG](https://www.edrdg.org/edrdg/licence.html) and used under CC BY-SA 4.0. The definition popup credits it.

## Checks

Run `npm test`, `npm run lint`, and `npm run build` from `client/` to check the frontend, and `npm test` from `server/` to check the backend and the spaced-repetition code in `shared/`.

## Stack

- `client/` — React + Vite frontend
- `server/` — Node.js + Express API, Prisma ORM, SQLite
- `shared/` — code used by both, currently the spaced-repetition scheduler (`srs.js`)

## Getting started

You need [Node.js](https://nodejs.org) 22.18 or newer.

Run this in a terminal to install:
```
winget install OpenJS.NodeJS.LTS
```

Then, from the repo root:

```
./start-dev.sh
```

Open http://localhost:5173. Press Ctrl+C to stop both servers.

The script does all the setup a fresh clone needs, and skips whatever is already done, so run it every time (including after pulling changes):

- installs dependencies in `server/` and `client/` when they're missing, when `package-lock.json` has changed, or when you've switched Node versions
- creates `server/.env` with a random `JWT_SECRET`, or adds any settings an older `.env` is missing (existing values are kept)
- generates the Prisma client and applies any new database migrations
- starts the backend (http://localhost:3001) and the frontend, which forwards `/api` requests to the backend

If Yomu is already running, it stops and tells you instead of starting a second copy. If your local database can't be migrated (for example, it was made with `prisma db push`), it tells you which file to delete to start fresh.

On Windows, run it from Git Bash.
