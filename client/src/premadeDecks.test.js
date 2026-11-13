import test from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORIES, DIFFICULTIES, PREMADE_DECKS } from './data/premadeDecks.js'
import { isKanaOnly } from './kana.js'

test('there is a deck for every category and difficulty', () => {
  assert.equal(PREMADE_DECKS.length, CATEGORIES.length * DIFFICULTIES.length)
  for (const deck of PREMADE_DECKS) {
    assert.ok(deck.title && deck.description, `${deck.id} needs a title and description`)
  }
})

test('every card has a word, a kana reading, and a definition', () => {
  for (const deck of PREMADE_DECKS) {
    for (const card of deck.cards) {
      const where = `${deck.id}: ${card.japanese}`
      assert.ok(card.japanese, `${where} has no word`)
      assert.ok(isKanaOnly(card.reading), `${where} reading "${card.reading}" isn't kana`)
      assert.ok(card.definition.trim(), `${where} has no definition`)
    }
  }
})

test('no deck repeats a word', () => {
  for (const deck of PREMADE_DECKS) {
    const words = deck.cards.map((card) => card.japanese)
    assert.equal(new Set(words).size, words.length, `${deck.id} has a duplicate`)
  }
})

test('all decks contain at least twenty cards and daily verbs covers every level', () => {
  for (const deck of PREMADE_DECKS) assert.ok(deck.cards.length >= 20, deck.id)
  assert.equal(PREMADE_DECKS.filter((deck) => deck.category === 'daily-verbs').length, 3)
})
