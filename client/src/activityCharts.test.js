import test from 'node:test'
import assert from 'node:assert/strict'
import {
  axisTicks,
  bucketDaysFor,
  cardsAddedIn,
  cardsDueIn,
  CHART_RANGES,
  countSeries,
  earliestDay,
  futureBuckets,
  latestDay,
  pastBuckets,
  retentionSeries,
} from './activityCharts.js'

const range = (id) => CHART_RANGES.find((option) => option.id === id)
const TODAY = '2026-03-31'

test('longer spans use wider bars', () => {
  assert.equal(bucketDaysFor(30), 1)
  assert.equal(bucketDaysFor(182), 7)
  assert.equal(bucketDaysFor(365), 7)
  assert.equal(bucketDaysFor(900), 30)
})

test('past bars end today and cover the whole range', () => {
  const month = pastBuckets(range('month'), TODAY)
  assert.equal(month.length, 30)
  assert.deepEqual(month[0], { start: '2026-03-02', end: '2026-03-02' })
  assert.deepEqual(month.at(-1), { start: TODAY, end: TODAY })

  const halfYear = pastBuckets(range('half-year'), TODAY)
  assert.equal(halfYear.length, 26)
  assert.deepEqual(halfYear.at(-1), { start: '2026-03-25', end: TODAY })
})

test('all time starts at the first activity', () => {
  const all = pastBuckets(range('all'), TODAY, '2026-03-20')
  assert.equal(all.length, 12)
  assert.equal(all[0].start, '2026-03-20')

  // No activity yet: just today
  assert.deepEqual(pastBuckets(range('all'), TODAY, null), [{ start: TODAY, end: TODAY }])
})

test('future bars start today; all time runs to the last due day', () => {
  const month = futureBuckets(range('month'), TODAY)
  assert.deepEqual(month[0], { start: TODAY, end: TODAY })
  assert.equal(month.at(-1).end, '2026-04-29')

  const all = futureBuckets(range('all'), TODAY, '2026-04-02')
  assert.deepEqual(
    all.map((bucket) => bucket.start),
    ['2026-03-31', '2026-04-01', '2026-04-02']
  )
})

test('counts are summed per bar and retention is passed over reviewed', () => {
  const buckets = [
    { start: '2026-03-01', end: '2026-03-07' },
    { start: '2026-03-08', end: '2026-03-14' },
  ]
  const reviews = { '2026-03-01': 3, '2026-03-07': 1, '2026-03-08': 0 }
  const passed = { '2026-03-01': 2, '2026-03-07': 1 }

  assert.deepEqual(
    countSeries(reviews, buckets).map((bar) => bar.value),
    [4, 0]
  )
  assert.deepEqual(retentionSeries(reviews, passed, buckets), [
    { ...buckets[0], reviews: 4, passed: 3, value: 0.75 },
    { ...buckets[1], reviews: 0, passed: 0, value: null },
  ])
})

test('a bar lists the cards added or due in its local practice days', () => {
  const TZ = 'Asia/Tokyo' // UTC+9
  // Tokyo-local time on a day in March 2026
  const at = (day, hour) => new Date(Date.UTC(2026, 2, day, hour - 9)).toISOString()
  const cards = [
    { id: 'a', createdAt: at(10, 12), dueAt: at(1, 12) }, // overdue: due today
    { id: 'b', createdAt: at(11, 2), dueAt: at(31, 18) }, // 2am: added on the 10th
    { id: 'c', createdAt: at(9, 12), dueAt: at(31, 20) },
    { id: 'd', createdAt: at(12, 12), dueAt: at(40, 12) },
  ]

  const ids = (list) => list.map((card) => card.id)
  assert.deepEqual(ids(cardsAddedIn(cards, { start: '2026-03-10', end: '2026-03-10' }, TZ)), [
    'a',
    'b',
  ])
  assert.deepEqual(ids(cardsAddedIn(cards, { start: '2026-03-09', end: '2026-03-15' }, TZ)), [
    'c',
    'a',
    'b',
    'd',
  ])
  assert.deepEqual(ids(cardsDueIn(cards, { start: TODAY, end: TODAY }, TODAY, TZ)), [
    'a',
    'b',
    'c',
  ])
  assert.deepEqual(ids(cardsDueIn(cards, { start: '2026-04-09', end: '2026-04-09' }, TODAY, TZ)), [
    'd',
  ])
})

test('y axis ticks are round whole numbers reaching the tallest bar', () => {
  assert.deepEqual(axisTicks(150), [0, 50, 100, 150])
  assert.deepEqual(axisTicks(163), [0, 50, 100, 150, 200])
  assert.deepEqual(axisTicks(3), [0, 1, 2, 3])
  assert.deepEqual(axisTicks(1), [0, 1])
  // An empty chart still has an axis
  assert.deepEqual(axisTicks(0), [0, 1])
  assert.deepEqual(axisTicks(1234), [0, 500, 1000, 1500])
})

test('earliest and latest days look across every map', () => {
  assert.equal(earliestDay({ '2026-02-01': 1 }, { '2026-01-15': 2 }), '2026-01-15')
  assert.equal(latestDay({ '2026-02-01': 1 }, { '2026-01-15': 2 }), '2026-02-01')
  assert.equal(earliestDay({}), null)
})
