import test from 'node:test'
import assert from 'node:assert/strict'
import { isKanaOnly, kanaToRomaji } from './kana.js'

test('words written only in hiragana or katakana are kana-only', () => {
  assert.equal(isKanaOnly('ねこ'), true)
  assert.equal(isKanaOnly('コーヒー'), true)
  assert.equal(isKanaOnly('ｺｰﾋｰ'), true) // half-width
  assert.equal(isKanaOnly('ひらがなカタカナ'), true)
})

test('words with kanji or other text are not', () => {
  assert.equal(isKanaOnly('猫'), false)
  assert.equal(isKanaOnly('食べる'), false)
  assert.equal(isKanaOnly('Tシャツ'), false)
  assert.equal(isKanaOnly(''), false)
  assert.equal(isKanaOnly(undefined), false)
})

test('kana is converted to romaji', () => {
  assert.equal(kanaToRomaji('ありがとう'), 'arigatou')
  assert.equal(kanaToRomaji('でんしゃ'), 'densha')
  assert.equal(kanaToRomaji('チェック'), 'chekku')
  assert.equal(kanaToRomaji('ディズニー'), 'dizunii')
  assert.equal(kanaToRomaji('ヴァイオリン'), 'vaiorin')
})

test('small tsu doubles the next consonant', () => {
  assert.equal(kanaToRomaji('がっこう'), 'gakkou')
  assert.equal(kanaToRomaji('きって'), 'kitte')
  assert.equal(kanaToRomaji('まっちゃ'), 'matcha')
})

test('long vowel marks repeat the vowel', () => {
  assert.equal(kanaToRomaji('コーヒー'), 'koohii')
  assert.equal(kanaToRomaji('ラーメン'), 'raamen')
})

test('n before a vowel or y gets an apostrophe', () => {
  assert.equal(kanaToRomaji('かんい'), "kan'i")
  assert.equal(kanaToRomaji('ほんや'), "hon'ya")
  assert.equal(kanaToRomaji('しんぶん'), 'shinbun')
})

test('greetings read with the particle wa', () => {
  assert.equal(kanaToRomaji('こんにちは'), 'konnichiwa')
  assert.equal(kanaToRomaji('こんばんは'), 'konbanwa')
})

test('text that is not all kana gives nothing', () => {
  assert.equal(kanaToRomaji('食べる'), '')
  assert.equal(kanaToRomaji(''), '')
  assert.equal(kanaToRomaji(undefined), '')
})
