// Creates a demo account with a year of made-up flashcard history, for
// trying out the stats, heatmap, and activity charts locally. Run with
// `npm run seed:demo`. Safe to run again: it deletes the demo account first
// and builds a fresh one, with history ending today.
//
// Cards are the premade deck words plus common words from the dictionary
// (when it's installed, see `npm run dictionary`), added a few at a time over
// the year. Reviews run through the real scheduler (shared/srs.js), so due
// dates and intervals look like real practice. How often cards are failed
// drifts over the year and jumps after each break, so retention has ups and
// downs.

import 'dotenv/config'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../src/generated/prisma/client.ts'
import { hashPassword } from '../src/auth.js'
import { DICTIONARY_PATH, lookupTerms } from '../src/dictionary.js'
import { reviewCard } from '../../shared/srs.js'
import { PREMADE_DECKS } from '../../client/src/data/premadeDecks.js'

const EMAIL = 'demo@yomu.test'
const PASSWORD = 'demo1234'
const DAYS = 365
const MINUTE_MS = 60 * 1000
// Dictionary words to add on top of the premade ones, most common first
const DICTIONARY_WORDS = 1500

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// Seeded (mulberry32), so every run builds the same history
let seed = 20261112
function random() {
  seed = (seed + 0x6d2b79f5) >>> 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const randomInt = (min, max) => min + Math.floor(random() * (max - min + 1))

// Common words with kanji from the dictionary's frequency list, skipping the
// very most common (mostly particles and grammar). Empty when the dictionary
// isn't installed.
function dictionaryWords(skip) {
  let dictionary
  try {
    dictionary = new Database(DICTIONARY_PATH, { readonly: true, fileMustExist: true })
  } catch {
    console.log('No dictionary installed, so only premade deck words are used.')
    return []
  }
  const terms = dictionary
    .prepare(
      `SELECT term FROM frequencies WHERE rank > 300
       GROUP BY term ORDER BY MIN(rank) LIMIT ?`
    )
    .all(DICTIONARY_WORDS * 3)
    .map((row) => row.term)
    .filter((term) => /\p{Script=Han}/u.test(term) && !skip.has(term))
  dictionary.close()

  const { entries } = lookupTerms(terms)
  return terms
    .filter((term) => entries[term]?.[0]?.r && entries[term][0].gloss.length)
    .slice(0, DICTIONARY_WORDS)
    .map((term) => {
      const { r, gloss } = entries[term][0]
      // The same "reading gloss" format the definition popup saves
      return { japanese: term, reading: r, definition: `${r} ${gloss.slice(0, 3).join('; ')}` }
    })
}

const premadeWords = [
  ...new Map(
    PREMADE_DECKS.flatMap((deck) => deck.cards).map((card) => [card.japanese, card])
  ).values(),
].map((card) => ({
  japanese: card.japanese,
  reading: card.reading,
  definition: `${card.reading} ${card.definition}`,
}))

// Every word once, shuffled
const words = [
  ...premadeWords,
  ...dictionaryWords(new Set(premadeWords.map((word) => word.japanese))),
]
  .map((word) => ({ word, order: random() }))
  .sort((a, b) => a.order - b.order)
  .map(({ word }) => word)

// Two breaks of about a week, so the streak and heatmap have gaps
const breaks = [
  [randomInt(60, 120), randomInt(5, 9)],
  [randomInt(200, 280), randomInt(4, 8)],
]
const onBreak = (dayIndex) =>
  breaks.some(([start, length]) => dayIndex >= start && dayIndex < start + length)

// How much more (or less) often than usual cards are failed on a day: drifts
// between good and bad stretches over the year, and is much worse for the
// two weeks after coming back from a break
function failFactor(dayIndex) {
  const drift = 1 + 0.45 * Math.sin(dayIndex / 23) + 0.25 * Math.sin(dayIndex / 7)
  const sinceBreak = Math.min(
    ...breaks.map(([start, length]) => {
      const days = dayIndex - (start + length)
      return days >= 0 ? days : Infinity
    })
  )
  return drift * (sinceBreak < 14 ? 1.9 - sinceBreak * 0.06 : 1)
}

const cards = []
const logs = []
let nextWord = 0

const today = new Date()
today.setHours(0, 0, 0, 0)

for (let dayIndex = 0; dayIndex < DAYS; dayIndex += 1) {
  const day = new Date(today)
  day.setDate(day.getDate() - (DAYS - 1 - dayIndex))
  const isToday = dayIndex === DAYS - 1

  // Skips about one day in eight, plus the breaks
  if (onBreak(dayIndex) || (!isToday && random() < 0.12)) continue

  // A session sometime between 8am and 10pm (earlier today, so it's in the past)
  let at = day.getTime() + randomInt(8 * 60, isToday ? 9 * 60 : 22 * 60) * MINUTE_MS
  if (isToday) at = Math.min(at, Date.now() - 2 * 60 * MINUTE_MS)

  // Adds new cards most days, spread so the words last the whole year
  const daysLeft = DAYS - dayIndex
  const pace = (words.length - nextWord) / (daysLeft * 0.85)
  const newCount = Math.min(
    random() < 0.8 ? randomInt(Math.floor(pace * 0.5), Math.ceil(pace * 1.6)) : 0,
    words.length - nextWord
  )
  for (let i = 0; i < newCount; i += 1) {
    const word = words[nextWord++]
    cards.push({
      id: crypto.randomUUID(),
      ...word,
      createdAt: new Date(at),
      dueAt: new Date(at).toISOString(),
      intervalDays: 0,
      stability: null,
      difficulty: null,
      lapses: 0,
      lastReviewedAt: null,
    })
  }

  // Reviews what's due, up to a daily limit; a failed card comes back a few
  // minutes later, and is sometimes failed again before it's passed
  const due = cards
    .filter((card) => Date.parse(card.dueAt) <= at)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
    .slice(0, randomInt(80, 150))

  const factor = failFactor(dayIndex)
  for (const card of due) {
    // New and harder cards are failed more often
    const baseChance = card.stability === null ? 0.35 : 0.08 + (card.difficulty ?? 5) * 0.025
    const grades = []
    if (random() < Math.min(0.85, baseChance * factor)) {
      grades.push('fail')
      while (grades.length < 3 && random() < 0.3) grades.push('fail')
    }
    grades.push('medium')

    for (const grade of grades) {
      const durationMs = randomInt(1500, grade === 'fail' ? 15000 : 8000)
      at += durationMs + (grade === 'fail' ? randomInt(2, 6) * MINUTE_MS : 0)
      const schedule = reviewCard(card, grade, new Date(at))
      logs.push({
        cardId: card.id,
        grade,
        reviewedAt: new Date(at),
        durationMs,
        intervalDays: card.intervalDays,
        newIntervalDays: schedule.intervalDays,
      })
      Object.assign(card, schedule)
    }
  }

  // Now and then, some premade deck practice too: logged, but with no saved card
  if (random() < 0.1) {
    for (let i = randomInt(5, 15); i > 0; i -= 1) {
      const durationMs = randomInt(1500, 8000)
      at += durationMs
      logs.push({
        cardId: null,
        grade: random() < 0.2 ? 'fail' : 'medium',
        reviewedAt: new Date(at),
        durationMs,
        intervalDays: 0,
        newIntervalDays: 1,
      })
    }
  }
}

await prisma.user.deleteMany({ where: { email: EMAIL } })
const user = await prisma.user.create({
  data: { email: EMAIL, passwordHash: hashPassword(PASSWORD) },
})

await prisma.flashcard.createMany({
  data: cards.map((card) => ({
    ...card,
    dueAt: new Date(card.dueAt),
    lastReviewedAt: card.lastReviewedAt && new Date(card.lastReviewedAt),
    userId: user.id,
  })),
})
await prisma.reviewLog.createMany({
  data: logs.map((log) => ({ ...log, userId: user.id })),
})

console.log(`Created ${EMAIL} (password: ${PASSWORD})`)
console.log(`${cards.length} cards, ${logs.length} reviews over the past ${DAYS} days`)
await prisma.$disconnect()
