// Spaced repetition for flashcard practice: a simplified SM-2.
//
// Two pure functions, no React and no network, so they're easy to test:
//   reviewCard    -- the card's new schedule after the user grades it
//   pickNextCard  -- which card to show next
//
// A card's schedule is: dueAt, intervalDays, ease, streak, lapses.
// A card is "due" once dueAt is in the past. Grading a card sets
// dueAt = now + intervalDays, so every interval below is in whole days.

export const GRADES = ['fail', 'hard', 'medium', 'easy']

const DAY_MS = 24 * 60 * 60 * 1000

const MIN_EASE = 1.3
const FAIL_EASE_PENALTY = 0.2
const HARD_EASE_PENALTY = 0.15
const EASY_EASE_BONUS = 0.15
const HARD_INTERVAL_FACTOR = 1.2
const EASY_INTERVAL_FACTOR = 1.3

// Intervals (in days) for a card with no streak: brand new, or just failed.
const FIRST_INTERVAL_DAYS = { hard: 1, medium: 1, easy: 3 }
const SECOND_MEDIUM_INTERVAL_DAYS = 3

// Intervals shorter than this count as this long when judging how overdue
// a card is, so brand-new and just-failed cards don't divide by ~zero.
const MIN_INTERVAL_DAYS = 1

// How many of the most recently shown cards are kept out of the next pick.
export const RECENT_BUFFER_SIZE = 3

const toTime = (date) => new Date(date).getTime()

function nextInterval(card, grade) {
  const { intervalDays, ease, streak } = card

  if (grade === 'hard') {
    return streak === 0
      ? FIRST_INTERVAL_DAYS.hard
      : Math.max(intervalDays, FIRST_INTERVAL_DAYS.hard) * HARD_INTERVAL_FACTOR
  }

  if (grade === 'medium') {
    if (streak === 0) return FIRST_INTERVAL_DAYS.medium
    if (streak === 1) return SECOND_MEDIUM_INTERVAL_DAYS
    return intervalDays * ease
  }

  // Easy never schedules sooner than its first-time interval.
  return streak === 0
    ? FIRST_INTERVAL_DAYS.easy
    : Math.max(intervalDays * ease * EASY_INTERVAL_FACTOR, FIRST_INTERVAL_DAYS.easy)
}

// Returns the card's new schedule fields. `now` is a parameter instead of
// Date.now() so tests can use fixed times.
export function reviewCard(card, grade, now = new Date()) {
  if (!GRADES.includes(grade)) {
    throw new Error(`Unknown grade: ${grade}`)
  }

  const reviewedAt = new Date(now)

  // Reviewing before dueAt (practicing ahead) only counts for the time that
  // has really passed since the last review, so growth stays honest.
  const early = reviewedAt.getTime() < toTime(card.dueAt)
  const elapsedDays = card.lastReviewedAt
    ? (reviewedAt.getTime() - toTime(card.lastReviewedAt)) / DAY_MS
    : card.intervalDays
  const basis = early
    ? { ...card, intervalDays: Math.min(card.intervalDays, elapsedDays) }
    : card

  // A failed card is due again right away. The recent-cards buffer in
  // pickNextCard is what stops it from repeating back to back.
  if (grade === 'fail') {
    return {
      dueAt: reviewedAt.toISOString(),
      intervalDays: 0,
      ease: Math.max(MIN_EASE, card.ease - FAIL_EASE_PENALTY),
      streak: 0,
      lapses: card.lapses + 1,
      lastReviewedAt: reviewedAt.toISOString(),
    }
  }

  const ease =
    grade === 'hard'
      ? Math.max(MIN_EASE, card.ease - HARD_EASE_PENALTY)
      : grade === 'easy'
        ? card.ease + EASY_EASE_BONUS
        : card.ease
  let intervalDays = nextInterval(basis, grade)

  // An early pass never shortens a card's schedule. Hard still can, since
  // it means the card needs more attention.
  if (early && grade !== 'hard') {
    intervalDays = Math.max(intervalDays, card.intervalDays)
  }

  return {
    dueAt: new Date(reviewedAt.getTime() + intervalDays * DAY_MS).toISOString(),
    intervalDays,
    ease,
    streak: card.streak + 1,
    lapses: card.lapses,
    lastReviewedAt: reviewedAt.toISOString(),
  }
}

// Higher means "show me sooner". Past due: how far past due relative to the
// interval. Not due yet (practicing ahead): fewer days left is higher.
// Either way, cards the user has struggled with get a nudge up.
function priority(card, now) {
  const daysLate = (now - toTime(card.dueAt)) / DAY_MS
  const lateness =
    daysLate >= 0 ? daysLate / Math.max(card.intervalDays, MIN_INTERVAL_DAYS) : daysLate
  return lateness + 0.25 * Math.min(card.lapses, 4) + 0.2 * (2.5 - card.ease)
}

// Returns the next card to show, or null when the session is over.
//   recentIds -- ids of cards already shown, oldest first
//   random    -- breaks ties; injectable for tests
//   includeNotDue -- practice ahead: cards not yet due can be picked too,
//                    soonest-due first
export function pickNextCard(
  cards,
  {
    now = new Date(),
    recentIds = [],
    random = Math.random,
    includeNotDue = false,
  } = {}
) {
  const nowMs = toTime(now)
  const due = includeNotDue
    ? cards
    : cards.filter((card) => toTime(card.dueAt) <= nowMs)

  const choose = (candidates) =>
    candidates
      .map((card) => ({ card, score: priority(card, nowMs), tie: random() }))
      .sort((a, b) => b.score - a.score || b.tie - a.tie)[0]?.card ?? null

  // Keep the last few cards out of the pick, but never so many that the
  // deck runs dry (a 2-card deck can only exclude 1).
  const bufferSize = Math.min(RECENT_BUFFER_SIZE, cards.length - 1)
  const recent = recentIds.slice(-bufferSize)
  const fresh = due.filter((card) => !recent.includes(card.id))
  if (fresh.length > 0) return choose(fresh)

  // Only recently shown cards are left. Allow any of them except the one
  // just shown; if that's the only one, the session ends.
  const justShown = recentIds[recentIds.length - 1]
  return choose(due.filter((card) => card.id !== justShown))
}
