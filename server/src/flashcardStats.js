import { addDays, practiceDayKey } from '../../shared/practiceDay.js'

// Practice stats, computed from review logs and cards already loaded from
// the database. Pure functions, so they're easy to test.

// Cards with an interval this long are "mature": the learner really knows them
export const MATURE_INTERVAL_DAYS = 21
// A card failed this many times is a "leech": rewording it usually helps more
// than reviewing it again
export const LEECH_LAPSES = 8

const WEEK_DAYS = 7
const RETENTION_DAYS = 30
const HEATMAP_DAYS = 365

// Consecutive practice days ending today. Today only breaks the streak once
// it's over, so before the first review of the day the streak still counts
// through yesterday.
export function computeStreak(practicedDays, today) {
  const practicedToday = practicedDays.has(today)
  let current = 0
  let day = practicedToday ? today : addDays(today, -1)
  while (practicedDays.has(day)) {
    current += 1
    day = addDays(day, -1)
  }

  let longest = 0
  let run = 0
  let previous = null
  for (const key of [...practicedDays].sort()) {
    run = previous && addDays(previous, 1) === key ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = key
  }

  return { current, longest, practicedToday }
}

function cardStage(card) {
  if (!card.lastReviewedAt) return 'new'
  if (card.intervalDays < 1) return 'learning'
  return card.intervalDays < MATURE_INTERVAL_DAYS ? 'young' : 'mature'
}

const increment = (counts, key) => {
  counts[key] = (counts[key] ?? 0) + 1
}

// Daily counts over all time, for the activity charts: cards added, reviews,
// passed (non-fail) reviews, and cards coming due. Overdue cards count as due
// today. Each is a { "YYYY-MM-DD": count } object with no zero days.
export function activityHistory({ logs, cards, today, timeZone }) {
  const added = {}
  const reviews = {}
  const passed = {}
  const due = {}

  for (const log of logs) {
    const day = practiceDayKey(log.reviewedAt, timeZone)
    increment(reviews, day)
    if (log.grade !== 'fail') increment(passed, day)
  }

  for (const card of cards) {
    increment(added, practiceDayKey(card.createdAt, timeZone))
    const dueDay = practiceDayKey(card.dueAt, timeZone)
    increment(due, dueDay < today ? today : dueDay)
  }

  return { added, reviews, passed, due }
}

// The reviews from `logs` that fall on practice days `start` through `end`
// (inclusive), oldest first.
export function reviewsInDays(logs, start, end, timeZone) {
  return logs
    .filter((log) => {
      const day = practiceDayKey(log.reviewedAt, timeZone)
      return day >= start && day <= end
    })
    .sort((a, b) => new Date(a.reviewedAt) - new Date(b.reviewedAt))
}

// logs:  every review, as { reviewedAt, durationMs, grade, intervalDays }
// cards: every card, as { createdAt, dueAt, intervalDays, lastReviewedAt }
export function summarizePractice({ logs, cards, now = new Date(), timeZone }) {
  const today = practiceDayKey(now, timeZone)
  const weekStart = addDays(today, -(WEEK_DAYS - 1))
  const retentionStart = addDays(today, -(RETENTION_DAYS - 1))
  const heatmapStart = addDays(today, -(HEATMAP_DAYS - 1))

  const reviewsByDay = new Map()
  let todayTimeMs = 0
  let weekReviews = 0
  let matureReviews = 0
  let maturePassed = 0

  for (const log of logs) {
    const day = practiceDayKey(log.reviewedAt, timeZone)
    reviewsByDay.set(day, (reviewsByDay.get(day) ?? 0) + 1)
    if (day === today) todayTimeMs += log.durationMs
    if (day >= weekStart) weekReviews += 1
    if (day >= retentionStart && log.intervalDays >= MATURE_INTERVAL_DAYS) {
      matureReviews += 1
      if (log.grade !== 'fail') maturePassed += 1
    }
  }

  const tomorrow = addDays(today, 1)
  const weekEnd = addDays(today, WEEK_DAYS - 1)
  const due = { today: 0, tomorrow: 0, week: 0 }
  const stages = { new: 0, learning: 0, young: 0, mature: 0 }

  for (const card of cards) {
    const dueDay = practiceDayKey(card.dueAt, timeZone)
    if (dueDay <= today) due.today += 1
    if (dueDay === tomorrow) due.tomorrow += 1
    if (dueDay <= weekEnd) due.week += 1
    stages[cardStage(card)] += 1
  }

  const heatmapDays = {}
  for (const [day, count] of reviewsByDay) {
    if (day >= heatmapStart && day <= today) heatmapDays[day] = count
  }

  return {
    today: { reviews: reviewsByDay.get(today) ?? 0, timeMs: todayTimeMs },
    week: { reviews: weekReviews, averagePerDay: weekReviews / WEEK_DAYS },
    due,
    streak: computeStreak(new Set(reviewsByDay.keys()), today),
    // Share of reviews of mature cards that weren't failed; null until there
    // are any
    retention: {
      rate: matureReviews > 0 ? maturePassed / matureReviews : null,
      reviews: matureReviews,
    },
    cards: stages,
    heatmap: { today, days: heatmapDays },
    history: activityHistory({ logs, cards, today, timeZone }),
  }
}

// Per-card totals from two groupBy results over review logs, keyed by card:
// all reviews (with _count and _avg.durationMs) and passed (non-fail) reviews.
export function cardReviewStats(card, all, passed) {
  const reviews = all?._count ?? 0
  return {
    reviews,
    passRate: reviews > 0 ? (passed?._count ?? 0) / reviews : null,
    averageTimeMs: reviews > 0 ? Math.round(all._avg.durationMs ?? 0) : null,
    leech: card.lapses >= LEECH_LAPSES,
  }
}
