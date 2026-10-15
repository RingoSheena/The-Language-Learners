# The-Language-Learners

Yomu — Japanese Reading & Flashcard Suite

## Reading progress and bookmarks

- Opening a book resumes your last reading position automatically. The bookshelf shows a Resume label and percentage for started books.
- Use **Add bookmark** in the reader to save the current passage. Open **Bookmarks** to jump to a saved passage or remove it.
- Positions follow text when you change font size, window size, or writing direction; image-only passages use percentage progress as a fallback.
- Progress and bookmarks are saved per uploaded book in this browser, alongside the existing local library. They do not sync between devices, and clearing browser data removes them. Deleting a book also removes its reading state.

Run `npm test`, `npm run lint`, and `npm run build` from `client/` to check the frontend.

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

```
cd server
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```
