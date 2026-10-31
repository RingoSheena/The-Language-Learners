// Rebuilds a card's FSRS schedule by replaying its logged reviews through
// shared/srs.js. Used once after switching from SM-2 (scripts/backfillFsrs.js).
//
// Review logs only started recently, so a card's history often begins
// partway through. When the first logged review shows the card already had
// an interval, the replay starts from an estimate of that state: stability
// equal to the interval, average difficulty, last reviewed one interval
// before that first log.

import { reviewCard } from '../../shared/srs.js'

const DAY_MS = 24 * 60 * 60 * 1000
const AVERAGE_DIFFICULTY = 5

// logs: the card's reviews, oldest first, as { grade, reviewedAt, intervalDays }
// Returns the new schedule fields, or null when there's nothing to replay.
export function replayReviews(card, logs) {
  if (logs.length === 0) return null

  const [first] = logs
  const firstAt = new Date(first.reviewedAt).getTime()
  let state =
    first.intervalDays > 0
      ? {
          intervalDays: first.intervalDays,
          stability: first.intervalDays,
          difficulty: AVERAGE_DIFFICULTY,
          lastReviewedAt: new Date(firstAt - first.intervalDays * DAY_MS).toISOString(),
          dueAt: new Date(firstAt).toISOString(),
          lapses: 0,
        }
      : { intervalDays: 0, stability: null, difficulty: null, lastReviewedAt: null, lapses: 0 }

  for (const log of logs) {
    state = { ...state, ...reviewCard(state, log.grade, log.reviewedAt) }
  }

  // The saved lapse count also covers reviews from before logging began.
  const { lapses: _replayedLapses, ...schedule } = state
  return { ...schedule, lapses: card.lapses }
}
