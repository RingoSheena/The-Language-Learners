# The-Language-Learners

Yomu — Japanese Reading & Flashcard Suite

## Reading progress and bookmarks

- Opening a book resumes your last reading position automatically. The bookshelf shows a Resume label and percentage for started books.
- Use **Add bookmark** in the reader to save the current passage. Open **Bookmarks** to jump to a saved passage or remove it.
- Positions follow text when you change font size, window size, or writing direction; image-only passages use percentage progress as a fallback.
- Progress and bookmarks are saved per book in this browser. They do not sync between devices, and clearing browser data removes them. Deleting a book also removes its reading state.

## Accounts, books and flashcards

- Learners register and log in with an email and password. Logging in starts a 7-day session, and **Log out** ends it. The bookshelf and flashcards pages send you to the login page if you aren't logged in.
- Uploaded books and saved flashcards are stored in the server's database under your account, so each learner only sees their own and they follow you to other devices.
- Flashcards are created from a word's definition popup in the reader; on the **Flashcards** page you can flip, edit, or remove them.

## Checks

Run `npm test`, `npm run lint`, and `npm run build` from `client/` to check the frontend, and `npm test` from `server/` to check the backend.

## Stack

- `client/` — React + Vite frontend
- `server/` — Node.js + Express API, Prisma ORM, SQLite

## Getting started

### Client

```
cd client
npm install
npm run dev
```

### Server

Create `server/.env` with:

```
DATABASE_URL="file:./dev.db"
PORT=3001
JWT_SECRET="any-long-random-string"
```

`JWT_SECRET` signs login sessions, so the server won't start without it. Use your own random value, e.g. from `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Then:

```
cd server
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

Start the server before the client. The client forwards `/api` requests to `http://localhost:3001`.

After pulling changes that add a migration, run `npx prisma migrate dev` in `server/` again to update your local database.
