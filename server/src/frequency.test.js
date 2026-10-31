import test from 'node:test'
import assert from 'node:assert/strict'
import { entryRank, frequencyRows, sortByFrequency } from './frequency.js'

test("a kanji spelling's kana-form rank is left out", () => {
  const bank = [
    ['行る', 'freq', { reading: 'やる', frequency: { value: 46, displayValue: '46㋕' } }],
    ['行る', 'freq', { reading: 'やる', frequency: { value: 75931, displayValue: '75931' } }],
    ['やる', 'freq', { value: 46, displayValue: '46㋕' }],
  ]
  assert.deepEqual(frequencyRows(bank), [
    ['行る', 'やる', 75931, '75931'],
    ['やる', null, 46, '46㋕'],
  ])
})

test('rows are read from both shapes of a Yomitan frequency list', () => {
  const bank = [
    ['来る', 'freq', { reading: 'くる', frequency: { value: 63, displayValue: '63' } }],
    ['は', 'freq', { value: 2, displayValue: '2㋕' }],
    ['猫', 'freq', 1200],
    ['猫', 'pitch', { reading: 'ねこ', pitches: [] }],
  ]
  assert.deepEqual(frequencyRows(bank), [
    ['来る', 'くる', 63, '63'],
    ['は', null, 2, '2㋕'],
    ['猫', null, 1200, '1200'],
  ])
})

const KURU = [
  { r: 'くる', v: 63, disp: '63' },
  { r: 'くる', v: 34, disp: '34㋕' },
  { r: 'きたる', v: 6967, disp: '6967㋕' },
]

test("an entry's rank is the best one for its reading", () => {
  assert.equal(entryRank({ r: 'くる' }, KURU), 34)
  assert.equal(entryRank({ r: 'きたる' }, KURU), 6967)
  assert.equal(entryRank({ r: 'らい' }, KURU), null)
})

test('a rank with no reading applies to every reading', () => {
  assert.equal(entryRank({ r: 'は' }, [{ r: null, v: 2, disp: '2㋕' }]), 2)
})

test('among equally ranked entries, words normally written in kana come first', () => {
  const entries = [{ r: 'よ', uk: false }, { r: 'よ', uk: true }, { r: 'よ', uk: false }]
  const sorted = sortByFrequency(entries, [{ r: null, v: 11, disp: '11㋕' }])
  assert.deepEqual(sorted, [entries[1], entries[0], entries[2]])
})

test('entries sort most frequent first, unranked ones after in their order', () => {
  const entries = [{ r: 'らい' }, { r: 'きたる' }, { r: 'こ' }, { r: 'くる' }]
  assert.deepEqual(
    sortByFrequency(entries, KURU).map((entry) => entry.r),
    ['くる', 'きたる', 'らい', 'こ']
  )
})
