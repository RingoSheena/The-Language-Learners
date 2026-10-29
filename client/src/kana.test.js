import test from 'node:test'
import assert from 'node:assert/strict'
import { isKanaOnly } from './kana.js'

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
