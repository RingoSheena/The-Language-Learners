// Spaced repetition for flashcard practice: FSRS-6.
// https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
//
// Shared by the client (previews and picking the next card) and the server
// (the saved schedule), so both always agree. Two pure functions, no React
// and no network, so they're easy to test:
//   reviewCard    -- the card's new schedule after the user grades it
//   pickNextCard  -- which card to show next
//
// A card's schedule is: dueAt, intervalDays, stability, difficulty, lapses,
// lastReviewedAt. Stability is how many days until the chance of recalling
// the card drops to 90%; difficulty runs from 1 (easy) to 10 (hard). Both
// are null until the card's first review. A card is "due" once dueAt is in
// the past. Grading a card sets dueAt = now + intervalDays.

export const GRADES = ['fail', 'hard', 'medium', 'easy']

const DAY_MS = 24 * 60 * 60 * 1000

// FSRS-6 default parameters (w0..w20), as used by ts-fsrs and Anki.
const W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912,
  0.0658, 0.1542,
]

// Cards are scheduled for when the chance of recalling them is expected to
// drop to the learner's target recall (a setting). Lower targets mean fewer
// reviews but more forgetting; above about 97% reviews pile up fast for
// little gain, so the setting is kept to this range.
export const DEFAULT_RETENTION = 0.9
export const MIN_RETENTION = 0.7
export const MAX_RETENTION = 0.97

export const isValidRetention = (value) =>
  Number.isFinite(value) && value >= MIN_RETENTION && value <= MAX_RETENTION

const DECAY = -W[20]
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1

const MIN_STABILITY = 0.001
const MIN_DIFFICULTY = 1
const MAX_DIFFICULTY = 10
const MAX_INTERVAL_DAYS = 36500

// Intervals shorter than this count as this long when judging how overdue
// a card is, so brand-new and just-failed cards don't divide by ~zero.
const MIN_INTERVAL_DAYS = 1

// How many of the most recently shown cards are kept out of the next pick.
export const RECENT_BUFFER_SIZE = 3

const toTime = (date) => new Date(date).getTime()
const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// FSRS rates grades 1 (again) to 4 (easy).
const rating = (grade) => GRADES.indexOf(grade) + 1

// Chance of recalling a card `days` after its last review.
const retrievability = (days, stability) =>
  Math.pow(1 + (FACTOR * days) / stability, DECAY)

const initialDifficulty = (r) =>
  clamp(W[4] - Math.exp(W[5] * (r - 1)) + 1, MIN_DIFFICULTY, MAX_DIFFICULTY)

function nextDifficulty(difficulty, r) {
  // Changes shrink as difficulty nears 10, then drift slightly back
  // toward the "easy" starting point so cards don't get stuck at the top.
  const delta = -W[6] * (r - 3)
  const damped = difficulty + (delta * (10 - difficulty)) / 9
  const reverted = W[7] * initialDifficulty(4) + (1 - W[7]) * damped
  return clamp(reverted, MIN_DIFFICULTY, MAX_DIFFICULTY)
}

function recallStability(stability, difficulty, recall, r) {
  const hardPenalty = r === 2 ? W[15] : 1
  const easyBonus = r === 4 ? W[16] : 1
  return (
    stability *
    (1 +
      Math.exp(W[8]) *
        (11 - difficulty) *
        Math.pow(stability, -W[9]) *
        (Math.exp(W[10] * (1 - recall)) - 1) *
        hardPenalty *
        easyBonus)
  )
}

function forgetStability(stability, difficulty, recall) {
  const forgotten =
    W[11] *
    Math.pow(difficulty, -W[12]) *
    (Math.pow(stability + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - recall))
  // Forgetting never leaves a card more stable than a same-day review would.
  return Math.min(forgotten, stability / Math.exp(W[17] * W[18]))
}

// A second review on the same day: recall barely decayed, so the long-term
// formulas don't apply. Passing never lowers stability.
function sameDayStability(stability, r) {
  const growth = Math.exp(W[17] * (r - 3 + W[18])) * Math.pow(stability, -W[19])
  return stability * (r >= 3 ? Math.max(growth, 1) : growth)
}

// Whole days until recall drops to the target, at least 1.
const intervalFor = (stability, desiredRetention) =>
  clamp(
    Math.round((stability / FACTOR) * (Math.pow(desiredRetention, 1 / DECAY) - 1)),
    1,
    MAX_INTERVAL_DAYS
  )

// Returns the card's new schedule fields. `now` is a parameter instead of
// Date.now() so tests can use fixed times.
//   desiredRetention -- the learner's target recall, see DEFAULT_RETENTION
export function reviewCard(
  card,
  grade,
  now = new Date(),
  { desiredRetention = DEFAULT_RETENTION } = {}
) {
  if (!GRADES.includes(grade)) {
    throw new Error(`Unknown grade: ${grade}`)
  }
  if (!isValidRetention(desiredRetention)) {
    throw new Error(`Target recall out of range: ${desiredRetention}`)
  }

  const reviewedAt = new Date(now)
  const r = rating(grade)
  let stability
  let difficulty

  if (card.stability == null || card.difficulty == null) {
    stability = W[r - 1]
    difficulty = initialDifficulty(r)
  } else {
    // FSRS works from the time that has really passed, so practicing ahead
    // grows a card less than reviewing it on time.
    const elapsedDays = card.lastReviewedAt
      ? Math.max(0, (reviewedAt.getTime() - toTime(card.lastReviewedAt)) / DAY_MS)
      : card.intervalDays
    const recall = retrievability(elapsedDays, card.stability)

    difficulty = nextDifficulty(card.difficulty, r)
    if (elapsedDays < 1) {
      stability = sameDayStability(card.stability, r)
    } else if (r === 1) {
      stability = forgetStability(card.stability, card.difficulty, recall)
    } else {
      stability = recallStability(card.stability, card.difficulty, recall, r)
    }
  }
  stability = Math.max(stability, MIN_STABILITY)

  // A failed card is due again right away. The recent-cards buffer in
  // pickNextCard is what stops it from repeating back to back.
  const intervalDays = grade === 'fail' ? 0 : intervalFor(stability, desiredRetention)

  return {
    dueAt: new Date(reviewedAt.getTime() + intervalDays * DAY_MS).toISOString(),
    intervalDays,
    stability,
    difficulty,
    lapses: card.lapses + (grade === 'fail' ? 1 : 0),
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
  const difficulty = card.difficulty ?? 5
  return lateness + 0.25 * Math.min(card.lapses, 4) + 0.05 * (difficulty - 5)
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


// Random practice: any card not yet passed this session, due or not, in no
// particular order. Random sessions are drilling only and save nothing, so
// schedules stay as they are. A failed card stays out of seenIds and comes
// back later; justShownId keeps it from repeating immediately unless it's
// the only card left.
export function pickRandomCard(
  cards,
  { seenIds = [], justShownId = null, random = Math.random } = {}
) {
  const seen = new Set(seenIds)
  const remaining = cards.filter((card) => !seen.has(card.id))
  const others = remaining.filter((card) => card.id !== justShownId)
  const pool = others.length > 0 ? others : remaining

  if (pool.length === 0) return null
  return pool[Math.floor(random() * pool.length)]
}
