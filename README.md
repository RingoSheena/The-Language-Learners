# The-Language-Learners

Yomu — Japanese Reading & Flashcard Suite

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
