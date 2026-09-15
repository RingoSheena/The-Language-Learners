# The-Language-Learners

Yomu — Japanese Reading & Flashcard Suite

## Stack

- `client/` — React + Vite frontend
- `server/` — Node.js + Express API, Prisma ORM, PostgreSQL

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
cp .env.example .env   # then point DATABASE_URL at your local Postgres
npx prisma migrate dev
npm run dev
```
