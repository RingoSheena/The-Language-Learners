import test from 'node:test'
import assert from 'node:assert/strict'
import { lookupAround } from './lib/dictionary.js'

// A tiny stand-in for the server's JMdict, in the shape it answers with
const JMDICT = {
  読む: [{ r: 'よむ', gloss: ['to read'], pos: ['v5m', 'vt'], c: 0 }],
  読み: [{ r: 'よみ', gloss: ['reading'], pos: ['n'], c: 0 }],
  書く: [{ r: 'かく', gloss: ['to write'], pos: ['v5k', 'vt'], c: 0 }],
  行く: [{ r: 'いく', gloss: ['to go'], pos: ['v5k-s', 'vi'], c: 0 }],
  食べる: [{ r: 'たべる', gloss: ['to eat'], pos: ['v1', 'vt'], c: 0 }],
  帰る: [{ r: 'かえる', gloss: ['to return home'], pos: ['v5r', 'vi'], c: 0 }],
  楽しい: [{ r: 'たのしい', gloss: ['enjoyable'], pos: ['adj-i'], c: 0 }],
  勉強: [{ r: 'べんきょう', gloss: ['study'], pos: ['n', 'vs'], c: 0 }],
  勉強する: [{ r: 'べんきょうする', gloss: ['to study'], pos: ['vs-i'], c: 0 }],
  行う: [{ r: 'おこなう', gloss: ['to perform'], pos: ['v5u', 'vt'], c: 0 }],
  担う: [{ r: 'になう', gloss: ['to shoulder'], pos: ['v5u', 'vt'], c: 0 }],
  になう: [{ r: 'になう', gloss: ['to shoulder'], pos: ['v5u', 'vt'], c: 1 }],
  なる: [{ r: 'なる', gloss: ['to become'], pos: ['v5r', 'vi'], c: 0 }],
  に: [{ r: 'に', gloss: ['at, in, to'], pos: ['prt'], c: 0 }],
  は: [
    { r: 'は', gloss: ['tooth'], pos: ['n'], c: 0 },
    { r: 'は', gloss: ['topic marker'], pos: ['prt'], c: 0 },
  ],
  かう: [{ r: 'かう', gloss: ['to buy'], pos: ['v5u', 'vt'], c: 0 }],
  かつ: [{ r: 'かつ', gloss: ['to win'], pos: ['v5t', 'vi'], c: 0 }],
  戯言: [
    { r: 'ざれごと', gloss: ['joke'], pos: ['n'], c: 1 },
    { r: 'たわごと', gloss: ['nonsense'], pos: ['n'], c: 0 },
  ],
}

// Ranks from the server's frequency list (lower is more frequent)
const FREQUENCIES = {
  かう: [{ r: null, v: 900, disp: '900㋕' }],
  かつ: [{ r: null, v: 300, disp: '300㋕' }],
}

let requests = []
let serverUp = true
globalThis.fetch = async (url, { body }) => {
  const { terms } = JSON.parse(body)
  requests.push(terms)
  if (!serverUp) throw new Error('connection refused')
  const pick = (source) => Object.fromEntries(terms.filter((t) => source[t]).map((t) => [t, source[t]]))
  return { ok: true, json: async () => ({ entries: pick(JMDICT), frequencies: pick(FREQUENCIES) }) }
}
console.log = () => {} // "dictionary miss:" lines
console.warn = () => {}

// Looks up a word written as one piece, as when the tokenizer leaves it whole
const lookup = async (text) => (await lookupAround([{ t: text, w: true }], 0)).info

test('a dictionary-form word is found as written', async () => {
  const info = await lookup('食べる')
  assert.equal(info.word, '食べる')
  assert.deepEqual(info.defs[0].gloss, ['to eat'])
})

test('conjugated words are traced back to their dictionary form', async () => {
  assert.equal((await lookup('食べました')).word, '食べる')
  assert.equal((await lookup('書いた')).word, '書く')
  assert.equal((await lookup('行った')).word, '行く')
  assert.equal((await lookup('帰って')).word, '帰る')
  assert.equal((await lookup('楽しかった')).word, '楽しい')
  assert.equal((await lookup('勉強しました')).word, '勉強する')
})

test('行った is 行く rather than the less common 行う', async () => {
  assert.equal((await lookup('行った')).word, '行く')
})

test('a particle shows its particle meaning first', async () => {
  assert.deepEqual((await lookup('は')).defs[0].gloss, ['topic marker'])
})

test('a run starting with a particle is not read as a conjugated verb', async () => {
  const pieces = ['に', 'なっ', 'て', 'い', 'た'].map((t) => ({ t, w: true }))
  assert.equal((await lookupAround(pieces, 1)).info.word, 'なる')
})

test('when a conjugation fits two words, the more frequent one wins', async () => {
  // かって is かう's or かつ's て-form. Without ranks かう would win, as
  // its rule comes first.
  assert.equal((await lookup('かって')).word, 'かつ')
})

test('the frequency rank comes with the match', async () => {
  assert.deepEqual((await lookup('かった')).freq, [{ r: null, v: 300, disp: '300㋕' }])
})

test('ば forms of godan and ichidan verbs are both found', async () => {
  assert.equal((await lookup('書けば')).word, '書く')
  assert.equal((await lookup('帰れば')).word, '帰る')
  assert.equal((await lookup('食べれば')).word, '食べる')
})

test('a verb stem is not mistaken for a noun spelled the same', async () => {
  // 読み is a noun, but in 読みます it's the stem of 読む
  assert.equal((await lookup('読みます')).word, '読む')
  assert.equal((await lookup('読み')).word, '読み')
})

test('a conjugation the word does not have is no match', async () => {
  // 書く makes 書いた, not 書った
  assert.equal(await lookup('書った'), null)
})

test("every entry for a spelling is kept, in the server's order", async () => {
  assert.deepEqual((await lookup('戯言')).defs.map((d) => d.r), ['ざれごと', 'たわごと'])
})

test('a run of tokenizer pieces is matched as one word', async () => {
  const pieces = ['食', 'べ', 'ます'].map((t) => ({ t, w: true }))
  const result = await lookupAround(pieces, 1)
  assert.equal(result.info.word, '食べる')
  assert.deepEqual([result.i, result.j], [0, 2])
})

test('spellings already looked up are not fetched again', async () => {
  await lookup('食べました')
  requests = []
  await lookup('食べました')
  assert.deepEqual(requests, [])
})

test('the built-in word list answers when the server is down', async () => {
  serverUp = false
  try {
    assert.deepEqual((await lookup('猫')).defs[0].gloss, ['cat'])
    assert.equal(await lookup('帰宅'), null) // not in the built-in list
  } finally {
    serverUp = true
  }
})
