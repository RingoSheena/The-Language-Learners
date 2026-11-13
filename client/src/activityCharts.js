import { addDays, practiceDayKey } from '../../shared/practiceDay.js'

// Bars for the flashcard activity charts, built from the server's daily
// counts ({ "YYYY-MM-DD": count }, see server/src/flashcardStats.js). Pure
// functions, so they're easy to test.

export const CHART_RANGES = [
  { id: 'month', label: '1 month', days: 30 },
  { id: 'half-year', label: '6 months', days: 182 },
  { id: 'year', label: '1 year', days: 365 },
  { id: 'all', label: 'All time', days: null },
]

const DAY_MS = 24 * 60 * 60 * 1000

const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

export const formatDayKey = (key, options = { year: 'numeric' }) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...options,
  })

// Y axis ticks for a chart whose tallest bar is `max`: whole numbers in
// round steps (1, 2, or 5 times a power of ten) from 0 up to the first tick
// at or above `max`, about `count` steps. The last tick is the chart's top.
export function axisTicks(max, count = 4) {
  const rough = Math.max(max, 1) / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = Math.max(1, [1, 2, 5, 10].find((factor) => factor * magnitude >= rough) * magnitude)
  const top = Math.max(step, Math.ceil(max / step) * step)
  const ticks = []
  for (let tick = 0; tick <= top; tick += step) ticks.push(tick)
  return ticks
}

// Days per bar, so even all-time charts stay at a readable number of bars
export function bucketDaysFor(spanDays) {
  if (spanDays <= 31) return 1
  if (spanDays <= 366) return 7
  return 30
}

// The earliest and latest day with a count across `countMaps`, or null
export function earliestDay(...countMaps) {
  const keys = countMaps.flatMap((counts) => Object.keys(counts))
  return keys.length ? keys.reduce((a, b) => (a < b ? a : b)) : null
}

export function latestDay(...countMaps) {
  const keys = countMaps.flatMap((counts) => Object.keys(counts))
  return keys.length ? keys.reduce((a, b) => (a > b ? a : b)) : null
}

function makeBuckets(first, spanDays) {
  const size = bucketDaysFor(spanDays)
  const buckets = []
  for (let offset = 0; offset < spanDays; offset += size) {
    const start = addDays(first, offset)
    buckets.push({ start, end: addDays(start, size - 1) })
  }
  return buckets
}

// Bars for a past range, oldest first. The last bar ends today, so a range
// "All time" starts at `earliest` (the first day with any activity).
export function pastBuckets(range, today, earliest) {
  const span = range.days ?? (earliest && earliest < today ? daysBetween(earliest, today) + 1 : 1)
  const size = bucketDaysFor(span)
  const count = Math.ceil(span / size)
  return makeBuckets(addDays(today, -(count * size - 1)), count * size)
}

// Bars for a future range, starting today. "All time" runs to `latest` (the
// last day anything is due).
export function futureBuckets(range, today, latest) {
  const span = range.days ?? (latest && latest > today ? daysBetween(today, latest) + 1 : 1)
  return makeBuckets(today, span)
}

function sumDays(counts, { start, end }) {
  let total = 0
  for (let day = start; day <= end; day = addDays(day, 1)) total += counts[day] ?? 0
  return total
}

// Each bucket with `value`: the total count over its days
export const countSeries = (counts, buckets) =>
  buckets.map((bucket) => ({ ...bucket, value: sumDays(counts, bucket) }))

// The cards behind a bar of the "Cards added" or "Coming due" chart, counted
// the same way the server counts them (see activityHistory in
// server/src/flashcardStats.js): by local practice day, with overdue cards
// due today. Oldest first.
const inDays = (day, { start, end }) => day >= start && day <= end

export const cardsAddedIn = (cards, days, timeZone) =>
  cards
    .filter((card) => inDays(practiceDayKey(card.createdAt, timeZone), days))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

export function cardsDueIn(cards, days, today, timeZone) {
  return cards
    .filter((card) => {
      const dueDay = practiceDayKey(card.dueAt, timeZone)
      return inDays(dueDay < today ? today : dueDay, days)
    })
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
}

// Each bucket with `value`: the share of reviews not failed, or null when
// there were none, plus `reviews` and `passed`: how many there were
export const retentionSeries = (reviews, passed, buckets) =>
  buckets.map((bucket) => {
    const total = sumDays(reviews, bucket)
    const passedTotal = sumDays(passed, bucket)
    return {
      ...bucket,
      reviews: total,
      passed: passedTotal,
      value: total > 0 ? passedTotal / total : null,
    }
  })
