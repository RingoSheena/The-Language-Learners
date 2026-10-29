// Practice days, shared by the client (the stats heatmap) and the server
// (grouping reviews into days for stats and streaks).
//
// A practice day ends at 4am local time rather than midnight, so a
// late-night session still counts toward the day it started in (Anki does
// the same). Days are identified by "YYYY-MM-DD" keys, which sort and
// compare as plain strings.

export const DAY_ROLLOVER_HOUR = 4

const HOUR_MS = 60 * 60 * 1000

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

// Building a formatter is slow and stats bucket every review, so keep one
// per time zone.
const formatters = new Map()

function formatterFor(timeZone) {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

// The key of the practice day `date` falls in, for a learner in `timeZone`.
export function practiceDayKey(date, timeZone) {
  const shifted = new Date(new Date(date).getTime() - DAY_ROLLOVER_HOUR * HOUR_MS)
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(shifted)
      .map(({ type, value }) => [type, value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

// Calendar arithmetic on keys, done in UTC so daylight saving can't skew it.
export function addDays(key, days) {
  const date = new Date(`${key}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

// 0 = Sunday ... 6 = Saturday
export function dayOfWeek(key) {
  return new Date(`${key}T00:00:00Z`).getUTCDay()
}
