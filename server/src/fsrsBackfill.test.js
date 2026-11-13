import test from 'node:test'
import assert from 'node:assert/strict'
import { replayReviews } from './fsrsBackfill.js'
import { reviewCard } from '../../shared/srs.js'

const card = { lapses: 4 }
const at = (iso) => new Date(iso).toISOString()

test('a card with no logged reviews is left alone', () => {
  assert.equal(replayReviews(card, []), null)
})

test('a history that starts from a new card matches reviewing it live', () => {
  const logs = [
    { grade: 'fail', reviewedAt: at('2026-10-01T10:00:00Z'), intervalDays: 0 },
    { grade: 'medium', reviewedAt: at('2026-10-01T10:05:00Z'), intervalDays: 0 },
  ]
  let live = { intervalDays: 0, stability: null, difficulty: null, lastReviewedAt: null, lapses: 0 }
  for (const log of logs) live = { ...live, ...reviewCard(live, log.grade, log.reviewedAt) }

  const replayed = replayReviews(card, logs)
  assert.equal(replayed.stability, live.stability)
  assert.equal(replayed.difficulty, live.difficulty)
  assert.equal(replayed.dueAt, live.dueAt)
})

test('a history that starts partway through is seeded from its first interval', () => {
  const logs = [{ grade: 'medium', reviewedAt: at('2026-10-10T10:00:00Z'), intervalDays: 3 }]
  const replayed = replayReviews(card, logs)
  // Reviewed on time at stability 3, so a pass grows it past 3.
  assert.ok(replayed.stability > 3)
  assert.equal(replayed.lastReviewedAt, logs[0].reviewedAt)
})

test('the saved lapse count is kept', () => {
  const logs = [{ grade: 'fail', reviewedAt: at('2026-10-10T10:00:00Z'), intervalDays: 3 }]
  assert.equal(replayReviews(card, logs).lapses, 4)
})
