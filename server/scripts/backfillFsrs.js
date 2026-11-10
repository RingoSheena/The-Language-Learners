// One-off: rebuild every card's FSRS schedule from its logged reviews.
// Run after the switch_to_fsrs migration with `npm run backfill:fsrs`.
// Cards with no logged reviews keep the schedule the migration estimated.
// Safe to run again: each run replays the full log from the start.

import 'dotenv/config'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../src/generated/prisma/client.ts'
import { replayReviews } from '../src/fsrsBackfill.js'

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const cards = await prisma.flashcard.findMany({
  select: {
    id: true,
    japanese: true,
    lapses: true,
    reviewLogs: {
      orderBy: { reviewedAt: 'asc' },
      select: { grade: true, reviewedAt: true, intervalDays: true },
    },
  },
})

let updated = 0
for (const card of cards) {
  const schedule = replayReviews(card, card.reviewLogs)
  if (!schedule) continue

  await prisma.flashcard.update({ where: { id: card.id }, data: schedule })
  updated += 1
  console.log(
    `${card.japanese}: ${card.reviewLogs.length} reviews -> ` +
      `due in ${schedule.intervalDays}d, stability ${schedule.stability.toFixed(2)}, ` +
      `difficulty ${schedule.difficulty.toFixed(2)}`
  )
}

console.log(`Rebuilt ${updated} of ${cards.length} cards from their review logs.`)
await prisma.$disconnect()
