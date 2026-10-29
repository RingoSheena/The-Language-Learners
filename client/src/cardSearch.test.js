import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesTerms, normalizeForSearch, queryTerms, searchableText } from './cardSearch.js'

const find = (card, query) => matchesTerms(searchableText(card), queryTerms(query))

const neko = { japanese: '猫', reading: 'ねこ', definition: 'ねこ cat; feline' }
const coffee = { japanese: 'コーヒー', reading: 'コーヒー', definition: 'coffee' }

test('finds a card by its word, reading, or definition', () => {
  assert.equal(find(neko, '猫'), true)
  assert.equal(find(neko, 'ねこ'), true)
  assert.equal(find(neko, 'feline'), true)
  assert.equal(find(neko, 'dog'), false)
})

test('hiragana and katakana find each other', () => {
  assert.equal(find(neko, 'ネコ'), true)
  assert.equal(find(coffee, 'こーひー'), true)
  assert.equal(find(coffee, 'コーヒー'), true)
})

test('width and case don\'t matter', () => {
  assert.equal(find(coffee, 'ｺｰﾋｰ'), true) // half-width katakana
  assert.equal(find(neko, 'ＣＡＴ'), true) // full-width letters
  assert.equal(find(neko, 'Cat'), true)
})

test('every term in the query has to match', () => {
  assert.equal(find(neko, 'cat feline'), true)
  assert.equal(find(neko, 'cat coffee'), false)
  assert.deepEqual(queryTerms('   '), [])
  assert.equal(find(neko, '  '), true) // an empty search shows everything
})

test('normalizing leaves kanji and other text alone', () => {
  assert.equal(normalizeForSearch('猫カフェ Café'), '猫かふぇ café')
  assert.equal(normalizeForSearch(undefined), '')
})
