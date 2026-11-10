import test from 'node:test'
import assert from 'node:assert/strict'
import { compactWord, formatEntry, wordSpellings } from './jmdict.js'

const sense = (gloss, overrides = {}) => ({
  partOfSpeech: [],
  appliesToKanji: ['*'],
  appliesToKana: ['*'],
  related: [],
  misc: [],
  gloss: gloss.map((text) => ({ lang: 'eng', text })),
  ...overrides,
})

// Shaped like jmdict-simplified's 戯言 entries, merged into one to cover
// readings and senses that only apply to some spellings
const GIGEN = {
  id: '1',
  kanji: [
    { common: true, text: '戯言', tags: [] },
    { common: false, text: '戯れ言', tags: [] },
  ],
  kana: [
    { common: true, text: 'たわごと', tags: [], appliesToKanji: ['*'] },
    { common: false, text: 'ざれごと', tags: [], appliesToKanji: ['戯れ言'] },
  ],
  sense: [
    sense(['nonsense', 'drivel'], { partOfSpeech: ['n'] }),
    sense(['joke'], { appliesToKanji: ['戯れ言'], appliesToKana: ['ざれごと'] }),
  ],
}

const YO = {
  id: '2',
  kanji: [],
  kana: [{ common: true, text: 'よ', tags: [], appliesToKanji: ['*'] }],
  sense: [sense(['hey'], { partOfSpeech: ['prt'] })],
}

const MATA = {
  id: '3',
  kanji: [{ common: true, text: '又', tags: [] }],
  kana: [{ common: true, text: 'また', tags: [], appliesToKanji: ['*'] }],
  sense: [sense(['again'], { partOfSpeech: ['adv'], misc: ['uk'] })],
}

test('a sense with no part of speech takes the one before it', () => {
  const word = compactWord(GIGEN)
  assert.deepEqual(word.sense.map((s) => s.partOfSpeech), [['n'], ['n']])
  assert.deepEqual(word.sense[1].gloss, ['joke'])
})

test('kanji and kana spellings can both be looked up', () => {
  assert.deepEqual(wordSpellings(GIGEN), [
    { text: '戯言', common: true },
    { text: '戯れ言', common: false },
    { text: 'たわごと', common: true },
    { text: 'ざれごと', common: false },
  ])
})

test('a kanji spelling shows the reading and senses that go with it', () => {
  const word = compactWord(GIGEN)
  assert.deepEqual(formatEntry(word, '戯言'), {
    r: 'たわごと',
    gloss: ['nonsense, drivel'],
    pos: ['n'],
    c: 0,
    uk: false,
  })
  assert.deepEqual(formatEntry(word, '戯れ言').gloss, ['nonsense, drivel', 'joke'])
  assert.equal(formatEntry(word, '戯れ言').c, 1)
})

test('a kana spelling is its own reading', () => {
  const word = compactWord(GIGEN)
  assert.deepEqual(formatEntry(word, 'ざれごと'), {
    r: 'ざれごと',
    gloss: ['nonsense, drivel', 'joke'],
    pos: ['n'],
    c: 1,
    uk: false,
  })
  assert.deepEqual(formatEntry(word, 'たわごと').gloss, ['nonsense, drivel'])
})

test('a kana spelling says whether the word is normally written in kana', () => {
  assert.equal(formatEntry(compactWord(YO), 'よ').uk, true)
  assert.equal(formatEntry(compactWord(MATA), 'また').uk, true)
  assert.equal(formatEntry(compactWord(MATA), '又').uk, false)
  assert.equal(formatEntry(compactWord(GIGEN), 'たわごと').uk, false)
})
