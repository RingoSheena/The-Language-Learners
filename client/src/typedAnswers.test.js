import test from 'node:test'
import assert from 'node:assert/strict'
import { romajiToKana, checkReadingAnswer } from './kana.js'

test('romaji converts digraphs, doubled consonants and syllabic n', () => {
  for (const [input, expected] of [['taberu', 'たべる'], ['gakkou', 'がっこう'], ['shukudai', 'しゅくだい'], ["kan'i", 'かんい'], ['hon', 'ほん'], ['konnichiha', 'こんにちは']]) {
    assert.equal(romajiToKana(input), expected)
  }
})

test('reading checks accept kana, romaji and normalized katakana without hiding mistakes', () => {
  assert.ok(checkReadingAnswer(' TABERU ', 'たべる'))
  assert.ok(checkReadingAnswer('タベル', 'たべる'))
  assert.ok(checkReadingAnswer('ｶﾀｶﾅ', 'カタカナ'))
  assert.ok(!checkReadingAnswer('taberu!', 'たべる'))
  assert.ok(!checkReadingAnswer('taber', 'たべる'))
  assert.ok(!checkReadingAnswer('', ''))
  assert.ok(!checkReadingAnswer('たべた', 'たべる'))
})
