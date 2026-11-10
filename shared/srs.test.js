import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewCard, pickNextCard, DEFAULT_RETENTION } from './srs.js'

const NOW = new Date('2026-01-10T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

const newCard = (id, overrides = {}) => ({
  id,
  dueAt: NOW.toISOString(),
  intervalDays: 0,
  stability: null,
  difficulty: null,
  lapses: 0,
  lastReviewedAt: null,
  ...overrides,
})

// A card last reviewed `daysAgo` days before NOW and due at the end of its
// interval (on time by default).
const reviewed = (overrides, daysAgo = overrides.intervalDays) => {
  const lastReviewedAt = new Date(NOW.getTime() - daysAgo * DAY)
  return newCard('a', {
    lastReviewedAt: lastReviewedAt.toISOString(),
    dueAt: new Date(lastReviewedAt.getTime() + overrides.intervalDays * DAY).toISOString(),
    ...overrides,
  })
}

const daysUntilDue = (result) => (new Date(result.dueAt) - NOW) / DAY

test('first review schedules by grade from the starting stabilities', () => {
  const hard = reviewCard(newCard('a'), 'hard', NOW)
  const medium = reviewCard(newCard('a'), 'medium', NOW)
  const easy = reviewCard(newCard('a'), 'easy', NOW)
  assert.equal(daysUntilDue(hard), 1)
  assert.equal(daysUntilDue(medium), 2)
  assert.equal(daysUntilDue(easy), 8)
  assert.ok(hard.difficulty > medium.difficulty)
  assert.ok(medium.difficulty > easy.difficulty)
})

test('intervals are whole days', () => {
  let card = newCard('a')
  for (let i = 0; i < 5; i++) {
    card = { ...card, ...reviewCard(card, 'medium', new Date(card.dueAt)) }
    assert.ok(Number.isInteger(card.intervalDays))
  }
})

test('repeated on-time medium passes keep growing the interval', () => {
  let card = newCard('a')
  const intervals = []
  for (let i = 0; i < 4; i++) {
    // Review each time the card comes due, like a real learner would.
    card = { ...card, ...reviewCard(card, 'medium', new Date(card.dueAt)) }
    intervals.push(card.intervalDays)
  }
  for (let i = 1; i < intervals.length; i++) {
    assert.ok(intervals[i] > intervals[i - 1], `intervals: ${intervals}`)
  }
})

test('on a reviewed card, hard < medium < easy', () => {
  const card = reviewed({ intervalDays: 10, stability: 10, difficulty: 5 })
  const hard = reviewCard(card, 'hard', NOW)
  const medium = reviewCard(card, 'medium', NOW)
  const easy = reviewCard(card, 'easy', NOW)
  assert.ok(hard.intervalDays < medium.intervalDays)
  assert.ok(medium.intervalDays < easy.intervalDays)
  assert.ok(hard.difficulty > card.difficulty)
  assert.ok(easy.difficulty < card.difficulty)
})

test('fail counts a lapse, lowers stability, and is due immediately', () => {
  const card = reviewed({ intervalDays: 10, stability: 10, difficulty: 5 })
  const result = reviewCard(card, 'fail', NOW)
  assert.equal(result.lapses, 1)
  assert.equal(result.intervalDays, 0)
  assert.equal(result.dueAt, NOW.toISOString())
  assert.ok(result.stability < card.stability)
  assert.ok(result.difficulty > card.difficulty)
})

test('difficulty stays between 1 and 10', () => {
  let card = newCard('a')
  for (let i = 0; i < 30; i++) card = { ...card, ...reviewCard(card, 'fail', NOW) }
  assert.ok(card.difficulty <= 10)
  for (let i = 0; i < 30; i++) {
    card = { ...card, ...reviewCard(card, 'easy', new Date(card.dueAt)) }
  }
  assert.ok(card.difficulty >= 1)
})

test('a failed card comes back after a short interval once passed', () => {
  const card = reviewed({ intervalDays: 30, stability: 30, difficulty: 5 })
  const afterFail = { ...card, ...reviewCard(card, 'fail', NOW) }
  const afterPass = reviewCard(afterFail, 'medium', NOW)
  assert.ok(afterPass.intervalDays < 30)
  assert.ok(afterPass.intervalDays >= 1)
})

test('unknown grades are rejected', () => {
  assert.throws(() => reviewCard(newCard('a'), 'pass', NOW))
})

test('an early pass grows the card less than an on-time one, but never shrinks it', () => {
  const card = reviewed({ intervalDays: 10, stability: 10, difficulty: 5 }, 2)
  const early = reviewCard(card, 'medium', NOW)
  const onTime = reviewCard(card, 'medium', card.dueAt)
  assert.ok(early.stability >= card.stability)
  assert.ok(early.intervalDays >= card.intervalDays)
  assert.ok(early.stability < onTime.stability)
})

test('a same-day medium or easy pass never lowers stability', () => {
  const card = { ...newCard('a'), ...reviewCard(newCard('a'), 'medium', NOW) }
  const later = new Date(NOW.getTime() + 60 * 60 * 1000)
  for (const grade of ['medium', 'easy']) {
    assert.ok(reviewCard(card, grade, later).stability >= card.stability)
  }
})

test('a lower target recall schedules longer intervals, a higher one shorter', () => {
  const card = reviewed({ intervalDays: 10, stability: 10, difficulty: 5 })
  const low = reviewCard(card, 'medium', NOW, { desiredRetention: 0.8 })
  const normal = reviewCard(card, 'medium', NOW)
  const high = reviewCard(card, 'medium', NOW, { desiredRetention: 0.95 })
  assert.ok(low.intervalDays > normal.intervalDays)
  assert.ok(high.intervalDays < normal.intervalDays)
  // Target recall only changes the interval, not what FSRS learned.
  assert.equal(low.stability, normal.stability)
})

test('the default target recall is 90%', () => {
  const card = reviewed({ intervalDays: 10, stability: 10, difficulty: 5 })
  assert.deepEqual(
    reviewCard(card, 'medium', NOW),
    reviewCard(card, 'medium', NOW, { desiredRetention: DEFAULT_RETENTION })
  )
  assert.equal(DEFAULT_RETENTION, 0.9)
})

test('target recall outside 70-97% is rejected', () => {
  for (const desiredRetention of [0.5, 0.99, NaN]) {
    assert.throws(() => reviewCard(newCard('a'), 'medium', NOW, { desiredRetention }))
  }
})

test('pickNextCard skips cards that are not due yet', () => {
  const future = newCard('later', { dueAt: new Date(NOW.getTime() + DAY).toISOString() })
  const due = newCard('now')
  assert.equal(pickNextCard([future, due], { now: NOW }).id, 'now')
  assert.equal(pickNextCard([future], { now: NOW }), null)
})

test('includeNotDue lets practice continue, soonest-due card first', () => {
  const soon = newCard('soon', { dueAt: new Date(NOW.getTime() + DAY).toISOString(), intervalDays: 1 })
  const later = newCard('later', { dueAt: new Date(NOW.getTime() + 9 * DAY).toISOString(), intervalDays: 10 })
  assert.equal(pickNextCard([later, soon], { now: NOW }), null)
  assert.equal(pickNextCard([later, soon], { now: NOW, includeNotDue: true }).id, 'soon')
})

test('includeNotDue still keeps recent cards out of the pick', () => {
  const cards = ['a', 'b', 'c', 'd', 'e'].map((id) =>
    newCard(id, { dueAt: new Date(NOW.getTime() + DAY).toISOString() })
  )
  const next = pickNextCard(cards, { now: NOW, includeNotDue: true, recentIds: ['a', 'b', 'c'] })
  assert.ok(['d', 'e'].includes(next.id))
})

test('pickNextCard returns null for an empty deck', () => {
  assert.equal(pickNextCard([], { now: NOW }), null)
})

test('pickNextCard prefers the most overdue card', () => {
  const slightly = newCard('slightly', {
    intervalDays: 1,
    dueAt: new Date(NOW.getTime() - 0.1 * DAY).toISOString(),
  })
  const very = newCard('very', {
    intervalDays: 1,
    dueAt: new Date(NOW.getTime() - 3 * DAY).toISOString(),
  })
  assert.equal(pickNextCard([slightly, very], { now: NOW }).id, 'very')
})

test('pickNextCard prefers a card with lapses when equally overdue', () => {
  const plain = newCard('plain')
  const struggled = newCard('struggled', { lapses: 3, difficulty: 8 })
  assert.equal(pickNextCard([plain, struggled], { now: NOW }).id, 'struggled')
})

test('pickNextCard keeps recently shown cards out of the pick', () => {
  const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => newCard(id))
  for (let i = 0; i < 20; i++) {
    const next = pickNextCard(cards, { now: NOW, recentIds: ['a', 'b', 'c'] })
    assert.ok(['d', 'e'].includes(next.id))
  }
})

test('a failed card does not come straight back while others are due', () => {
  const failed = newCard('failed', { lapses: 5, difficulty: 9 })
  const others = [newCard('x'), newCard('y')]
  const next = pickNextCard([failed, ...others], { now: NOW, recentIds: ['failed'] })
  assert.notEqual(next.id, 'failed')
})

test('small decks relax the buffer instead of deadlocking', () => {
  const cards = [newCard('a'), newCard('b')]
  assert.equal(pickNextCard(cards, { now: NOW, recentIds: ['a'] }).id, 'b')
})

test('a single due card is not shown twice in a row', () => {
  const only = newCard('only')
  assert.equal(pickNextCard([only], { now: NOW }).id, 'only')
  assert.equal(pickNextCard([only], { now: NOW, recentIds: ['only'] }), null)
})

test('only-recent due cards fall back to any but the one just shown', () => {
  const cards = [newCard('a'), newCard('b'), newCard('c', { dueAt: new Date(NOW.getTime() + DAY).toISOString() })]
  // a and b are the only due cards and both are recent; a was shown last.
  assert.equal(pickNextCard(cards, { now: NOW, recentIds: ['b', 'a'] }).id, 'b')
})
