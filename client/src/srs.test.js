import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewCard, pickNextCard } from './srs.js'

const NOW = new Date('2026-01-10T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

const newCard = (id, overrides = {}) => ({
  id,
  dueAt: NOW.toISOString(),
  intervalDays: 0,
  ease: 2.5,
  streak: 0,
  lapses: 0,
  ...overrides,
})

const daysUntilDue = (result) => (new Date(result.dueAt) - NOW) / DAY

test('first review schedules by grade: hard and medium 1 day, easy 3', () => {
  const hard = reviewCard(newCard('a'), 'hard', NOW)
  const medium = reviewCard(newCard('a'), 'medium', NOW)
  const easy = reviewCard(newCard('a'), 'easy', NOW)
  assert.equal(daysUntilDue(hard), 1)
  assert.equal(daysUntilDue(medium), 1)
  assert.equal(daysUntilDue(easy), 3)
  for (const result of [hard, medium, easy]) assert.equal(result.streak, 1)
})

test('repeated medium passes grow the interval 1 -> 3 -> interval * ease', () => {
  let card = newCard('a')
  const intervals = []
  for (let i = 0; i < 3; i++) {
    // Review each time the card comes due, like a real learner would.
    card = { ...card, ...reviewCard(card, 'medium', new Date(card.dueAt)) }
    intervals.push(card.intervalDays)
  }
  assert.deepEqual(intervals, [1, 3, 7.5])
})

test('hard lowers ease and grows the interval slowly; easy raises ease', () => {
  const card = newCard('a', { streak: 2, intervalDays: 3 })
  const hard = reviewCard(card, 'hard', NOW)
  const medium = reviewCard(card, 'medium', NOW)
  const easy = reviewCard(card, 'easy', NOW)
  assert.ok(hard.ease < card.ease)
  assert.equal(medium.ease, card.ease)
  assert.ok(easy.ease > card.ease)
  assert.ok(hard.intervalDays < medium.intervalDays)
  assert.ok(medium.intervalDays < easy.intervalDays)
})

test('fail resets the streak, counts a lapse, and is due immediately', () => {
  const card = newCard('a', { streak: 4, intervalDays: 10, dueAt: NOW.toISOString() })
  const result = reviewCard(card, 'fail', NOW)
  assert.equal(result.streak, 0)
  assert.equal(result.lapses, 1)
  assert.equal(result.intervalDays, 0)
  assert.equal(result.dueAt, NOW.toISOString())
  assert.ok(result.ease < card.ease)
})

test('ease never drops below the floor', () => {
  let card = newCard('a')
  for (let i = 0; i < 20; i++) card = { ...card, ...reviewCard(card, 'fail', NOW) }
  assert.equal(card.ease, 1.3)
  const hard = reviewCard(card, 'hard', NOW)
  assert.equal(hard.ease, 1.3)
})

test('a failed card restarts with first-time intervals', () => {
  const failed = { ...newCard('a', { streak: 5, intervalDays: 20 }) }
  const afterFail = { ...failed, ...reviewCard(failed, 'fail', NOW) }
  assert.equal(daysUntilDue(reviewCard(afterFail, 'medium', NOW)), 1)
})

test('unknown grades are rejected', () => {
  assert.throws(() => reviewCard(newCard('a'), 'pass', NOW))
})

test('hard lowers ease, so it still grows the interval slower than medium', () => {
  let hard = newCard('a')
  let medium = newCard('a')
  for (let i = 0; i < 4; i++) {
    hard = { ...hard, ...reviewCard(hard, 'hard', new Date(hard.dueAt)) }
    medium = { ...medium, ...reviewCard(medium, 'medium', new Date(medium.dueAt)) }
  }
  assert.ok(hard.intervalDays < medium.intervalDays)
})

test('an early medium or easy pass never shortens the schedule', () => {
  const reviewed = new Date(NOW.getTime() - DAY)
  const card = newCard('a', {
    streak: 3,
    intervalDays: 10,
    lastReviewedAt: reviewed.toISOString(),
    dueAt: new Date(reviewed.getTime() + 10 * DAY).toISOString(),
  })
  for (const grade of ['medium', 'easy']) {
    assert.ok(reviewCard(card, grade, NOW).intervalDays >= 10)
  }
})

test('an early hard grade is based on elapsed time and can shorten it', () => {
  const reviewed = new Date(NOW.getTime() - DAY)
  const card = newCard('a', {
    streak: 3,
    intervalDays: 10,
    lastReviewedAt: reviewed.toISOString(),
    dueAt: new Date(reviewed.getTime() + 10 * DAY).toISOString(),
  })
  assert.ok(reviewCard(card, 'hard', NOW).intervalDays < 10)
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
  const struggled = newCard('struggled', { lapses: 3, ease: 1.6 })
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
  const failed = newCard('failed', { lapses: 5, ease: 1.3 })
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
