import { reviewCard } from '../../shared/srs.js'

// What a target recall setting means in practice, for the visualizer in
// Settings. Runs the real scheduler (shared/srs.js) on made-up cards.

const DAY_MS = 24 * 60 * 60 * 1000
// A forgotten card is relearned (and passed) this long after failing it
const RELEARN_MS = 10 * 60 * 1000
const START = Date.UTC(2026, 0, 1)

const NEW_CARD = {
  dueAt: new Date(START).toISOString(),
  intervalDays: 0,
  stability: null,
  difficulty: null,
  lapses: 0,
  lastReviewedAt: null,
}

// Small seeded random number generator (mulberry32), so the simulation gives
// the same numbers every time the page loads.
function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Average reviews a new card takes in its first `days` days. Cards come up
// when recall is expected to drop to the target, so each review of a due card
// is remembered with that chance; the first review (learning the card) always
// passes.
export function averageReviews(desiredRetention, { days = 365, cards = 400, seed = 1 } = {}) {
  const random = seededRandom(seed)
  const end = START + days * DAY_MS
  let total = 0

  for (let i = 0; i < cards; i += 1) {
    let card = NEW_CARD
    let at = START
    let mustPass = true

    while (at < end) {
      const grade = mustPass || random() < desiredRetention ? 'medium' : 'fail'
      card = { ...card, ...reviewCard(card, grade, new Date(at), { desiredRetention }) }
      total += 1
      mustPass = grade === 'fail'
      at = mustPass ? at + RELEARN_MS : Date.parse(card.dueAt)
    }
  }

  return total / cards
}

// The intervals, in days, of a card that's remembered at every review
export function passIntervals(desiredRetention, count = 5) {
  const intervals = []
  let card = NEW_CARD
  for (let i = 0; i < count; i += 1) {
    card = { ...card, ...reviewCard(card, 'medium', card.dueAt, { desiredRetention }) }
    intervals.push(card.intervalDays)
  }
  return intervals
}
