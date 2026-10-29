import test from 'node:test'
import assert from 'node:assert/strict'
import { cardReviewStats, computeStreak, summarizePractice } from './flashcardStats.js'

const TZ = 'Asia/Tokyo' // UTC+9, no daylight saving
// Noon on 2026-01-10 in Tokyo
const NOW = new Date('2026-01-10T03:00:00Z')

// A review at the given Tokyo-local day and hour
const review = (day, hour, overrides = {}) => ({
  reviewedAt: new Date(Date.UTC(2026, 0, day, hour - 9)),
  durationMs: 5000,
  grade: 'medium',
  intervalDays: 1,
  ...overrides,
})

const card = (overrides = {}) => ({
  dueAt: NOW,
  intervalDays: 1,
  lastReviewedAt: NOW,
  ...overrides,
})

test('the streak counts consecutive days and survives until today ends', () => {
  const days = new Set(['2026-01-05', '2026-01-06', '2026-01-08', '2026-01-09'])
  assert.deepEqual(computeStreak(days, '2026-01-10'), {
    current: 2,
    longest: 2,
    practicedToday: false,
  })

  days.add('2026-01-10')
  assert.deepEqual(computeStreak(days, '2026-01-10'), {
    current: 3,
    longest: 3,
    practicedToday: true,
  })

  // Missing a whole day resets it
  assert.equal(computeStreak(days, '2026-01-12').current, 0)
  assert.deepEqual(computeStreak(new Set(), '2026-01-10'), {
    current: 0,
    longest: 0,
    practicedToday: false,
  })
})

test('reviews are grouped into local practice days ending at 4am', () => {
  const stats = summarizePractice({
    logs: [
      review(10, 9),
      review(10, 1), // 1am on the 10th still counts toward the 9th
      review(9, 20),
      review(4, 12), // 6 days ago: inside the 7-day window
      review(3, 12), // 7 days ago: outside it
    ],
    cards: [],
    now: NOW,
    timeZone: TZ,
  })

  assert.deepEqual(stats.today, { reviews: 1, timeMs: 5000 })
  assert.equal(stats.week.reviews, 4)
  assert.equal(stats.week.averagePerDay, 4 / 7)
  assert.deepEqual(stats.streak, { current: 2, longest: 2, practicedToday: true })
  assert.deepEqual(stats.heatmap, {
    today: '2026-01-10',
    days: { '2026-01-10': 1, '2026-01-09': 2, '2026-01-04': 1, '2026-01-03': 1 },
  })
})

test('retention only counts reviews of mature cards in the past 30 days', () => {
  const stats = summarizePractice({
    logs: [
      review(10, 12, { intervalDays: 30 }),
      review(10, 12, { intervalDays: 25, grade: 'fail' }),
      review(9, 12, { intervalDays: 21, grade: 'hard' }),
      review(10, 12, { intervalDays: 3, grade: 'fail' }), // young: ignored
    ],
    cards: [],
    now: NOW,
    timeZone: TZ,
  })

  assert.deepEqual(stats.retention, { rate: 2 / 3, reviews: 3 })

  const none = summarizePractice({ logs: [], cards: [], now: NOW, timeZone: TZ })
  assert.deepEqual(none.retention, { rate: null, reviews: 0 })
})

test('cards are counted by when they are due and how well they are known', () => {
  const at = (day, hour) => new Date(Date.UTC(2026, 0, day, hour - 9))
  const stats = summarizePractice({
    logs: [],
    cards: [
      card({ dueAt: at(2, 12), lastReviewedAt: null, intervalDays: 0 }), // overdue, new
      card({ dueAt: at(11, 2), intervalDays: 0 }), // 2am tomorrow is still today; learning
      card({ dueAt: at(11, 12), intervalDays: 1 }), // tomorrow; young
      card({ dueAt: at(16, 12), intervalDays: 30 }), // 6 days out; mature
      card({ dueAt: at(17, 12), intervalDays: 40 }), // 7 days out: past this week
    ],
    now: NOW,
    timeZone: TZ,
  })

  assert.deepEqual(stats.due, { today: 2, tomorrow: 1, week: 4 })
  assert.deepEqual(stats.cards, { new: 1, learning: 1, young: 1, mature: 2 })
})

test('per-card stats give pass rate, average time, and the leech flag', () => {
  assert.deepEqual(
    cardReviewStats(
      { lapses: 8 },
      { _count: 4, _avg: { durationMs: 4250.4 } },
      { _count: 3 }
    ),
    { reviews: 4, passRate: 0.75, averageTimeMs: 4250, leech: true }
  )
  assert.deepEqual(cardReviewStats({ lapses: 0 }, undefined, undefined), {
    reviews: 0,
    passRate: null,
    averageTimeMs: null,
    leech: false,
  })
})
