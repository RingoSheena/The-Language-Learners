import test from 'node:test'
import assert from 'node:assert/strict'
import { pickRandomCard } from './srs.js'

const cards = [
  { id: 'a', dueAt: '2030-01-01T00:00:00.000Z' },
  { id: 'b', dueAt: '2020-01-01T00:00:00.000Z' },
  { id: 'c', dueAt: '2040-01-01T00:00:00.000Z' },
]

test('random practice includes cards that are not due yet', () => {
  assert.equal(pickRandomCard(cards, { random: () => 0 }).id, 'a')
  assert.equal(pickRandomCard(cards, { random: () => 0.99 }).id, 'c')
})

test('random practice never selects previously seen cards', () => {
  const next = pickRandomCard(cards, { seenIds: ['a', 'b'], random: () => 0 })
  assert.equal(next.id, 'c')
})

test('a random session visits every card exactly once then ends', () => {
  const seenIds = []
  for (let i = 0; i < cards.length; i++) {
    const next = pickRandomCard(cards, { seenIds, random: () => 0 })
    assert.ok(next)
    assert.ok(!seenIds.includes(next.id))
    seenIds.push(next.id)
  }
  assert.equal(new Set(seenIds).size, cards.length)
  assert.equal(pickRandomCard(cards, { seenIds }), null)
})

test('random practice handles empty decks and does not alter its cards', () => {
  assert.equal(pickRandomCard([]), null)
  const original = cards.map((card) => ({ ...card }))
  pickRandomCard(cards, { seenIds: ['a'], random: () => 0.5 })
  assert.deepEqual(cards, original)
})
