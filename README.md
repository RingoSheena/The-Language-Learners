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
- The login and register pages also offer **Sign in with Google** (see [Google sign-in](#google-sign-in) for setup). Signing in with a Google account whose email matches an existing password account links the two, so there is one account either way. Linking removes that account's password and logs out its other sessions, so from then on it signs in with Google only. A new Google email creates an account with no password. Google sign-in only appears once it's configured.
- Uploaded books and saved flashcards are stored in the server's database under your account, so each learner only sees their own and they follow you to other devices.
- Flashcards are created from a word's definition popup in the reader. On the **Flashcards** page, **Practice** reviews the cards that are due (set **Card order** to **Random** to drill every card once in random order instead; failed cards come back later in the session, and random practice doesn't change schedules or stats), and **Browse** opens a table of every card where you can search, edit, or remove them. Search matches the Japanese word, its reading, or the English definition; hiragana and katakana find each other, and width and capitalization don't matter.
- The **Flashcards** page shows your practice stats: streak (days in a row with at least one review), cards reviewed and time spent today, a 7-day daily average, retention (how often you pass cards you know well), cards due soon, a new/learning/young/mature breakdown, and a year-long heatmap of reviews per day. A day ends at 4am local time, and each answer counts for at most 60 seconds.
- The **Browse** table shows each card's word frequency (its JPDB rank, lower is more common), review count, pass rate, and average answer time. Cards failed 8 or more times are marked **Leech**; click it to reword the card.

## Dictionary

- Holding the definition hotkey over a word in the reader looks it up in [JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project), the full English edition (over 200,000 entries). Conjugated words are traced back to their dictionary form, and a conjugation only matches words of the right part of speech.
- The dictionary is stored on the server in `server/dictionary.db`, which isn't in git. `start-dev.sh` builds it the first time, downloading JMdict and the JPDB frequency list; run `npm run dictionary` in `server/` (with the server stopped) to update it to the latest JMdict release from [jmdict-simplified](https://github.com/scriptin/jmdict-simplified).
- When a conjugated word fits more than one dictionary word, or a word has several readings, the most frequent one comes first. Frequencies come from the [JPDB](https://jpdb.io) frequency list, which `npm run dictionary` downloads into `server/dictionaries/` the first time (from [jpdb-freq-list](https://github.com/MarvNC/jpdb-freq-list)). Other Yomitan-format frequency lists placed there as `.zip` files are used too. That folder isn't in git, since the lists aren't ours to share; if the download fails, lookups fall back to JMdict's "common word" flag.
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
- creates `server/.env` with a random `JWT_SECRET` and the shared Google client ID, or adds any settings an older `.env` is missing (existing values are kept)
- generates the Prisma client and applies any new database migrations (including the one that adds Google sign-in to the `User` table, which keeps existing accounts)
- starts the backend (http://localhost:3001) and the frontend, which forwards `/api` requests to the backend

`server/.env` is not committed. The script creates it, including the shared Google client ID. For Google sign-in itself, you also need to be a test user; see [Google sign-in](#google-sign-in).

If Yomu is already running, it stops and tells you instead of starting a second copy. If your local database can't be migrated (for example, it was made with `prisma db push`), it tells you which file to delete to start fresh.

On Windows, run it from Git Bash.

## Google sign-in

Google sign-in uses Google's ID-token flow, so there is no client secret and no redirect URI, only a public **client ID**. The project's shared client ID is already in the repo, so it works out of the box.

### The shared client ID

The project has one Google Cloud OAuth client, and everyone uses it:

- `client/.env` (committed) sets `VITE_GOOGLE_CLIENT_ID` for the frontend.
- `./start-dev.sh` adds `GOOGLE_CLIENT_ID` to your `server/.env` the first time it runs, if it isn't already there. Existing values are kept.

The client ID is public (it's visible in the page), so keeping it in git is fine. If you already have a `server/.env` from before Google sign-in, just run `./start-dev.sh` again, which adds the line, and restart so Vite and the server pick it up.

The only manual step is being a **test user**: the consent screen is in *Testing* mode, so Google only lets listed accounts sign in (up to 100); anyone else sees "Access blocked". The owner of the Google Cloud project adds you under *Google Cloud Console → APIs & Services → OAuth consent screen → Test users*.

The server checks that every Google token was issued for its `GOOGLE_CLIENT_ID`, so the client and server IDs must match, or sign-in fails with "Google sign-in failed".

### Making your own client ID (to work independently)

1. In [Google Cloud Console](https://console.cloud.google.com), create a project.
2. *APIs & Services → OAuth consent screen*: choose **External**, enter an app name, and add your Google account as a test user.
3. *Credentials → Create credentials → OAuth client ID → Web application*. Under **Authorized JavaScript origins**, add both `http://localhost:5173` and `http://localhost` (Google asks for both when testing on localhost; without the second, **Use another account** shows a 400 error). Leave redirect URIs empty.
4. Put your ID in `server/.env` as `GOOGLE_CLIENT_ID="..."` and in `client/.env.local` as `VITE_GOOGLE_CLIENT_ID="..."` (both gitignored; `.env.local` overrides the committed `client/.env`). Restart `./start-dev.sh`. Don't edit the committed `client/.env` for this.

### Notes

- **The page must be served from an authorized origin.** The client dev server is fixed to port 5173 for this reason. A deployed site's URL must be added to the OAuth client's authorized origins before Google sign-in works there. Google doesn't allow wildcards, so preview deployments with changing URLs can't use it.
- **Google emails must be verified.** If Google hasn't verified the email on an account, it is refused, so it can't be used to take over someone else's account. An account already linked to one Google account can't be linked to a second.
- **Linking turns a password account into a Google-only one.** Registering never confirms an email address, so anyone could have registered your address with their own password before you signed in with Google. To lock them out, linking removes the password and ends every existing session for that account.
- **Google accounts have no password.** Logging in with a password for one of them tells you to use Google sign-in instead.
