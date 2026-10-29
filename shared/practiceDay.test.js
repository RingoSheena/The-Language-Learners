import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, dayOfWeek, isValidTimeZone, practiceDayKey } from './practiceDay.js'

test('a practice day runs from 4am to 4am in the learner\'s time zone', () => {
  // 2026-01-10 09:00 in Tokyo (UTC+9)
  assert.equal(practiceDayKey('2026-01-10T00:00:00Z', 'Asia/Tokyo'), '2026-01-10')
  // 2026-01-10 03:59 in Tokyo still counts as the 9th
  assert.equal(practiceDayKey('2026-01-09T18:59:00Z', 'Asia/Tokyo'), '2026-01-09')
  // 2026-01-10 04:00 in Tokyo starts the 10th
  assert.equal(practiceDayKey('2026-01-09T19:00:00Z', 'Asia/Tokyo'), '2026-01-10')
  // The same instant is a different day in New York (UTC-5)
  assert.equal(practiceDayKey('2026-01-10T00:00:00Z', 'America/New_York'), '2026-01-09')
})

test('day keys add across months and years', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01')
  assert.equal(addDays('2026-01-01', -1), '2025-12-31')
  assert.equal(addDays('2026-03-08', 1), '2026-03-09') // US daylight saving starts
  assert.equal(dayOfWeek('2026-01-04'), 0) // a Sunday
})

test('only real time zones are accepted', () => {
  assert.equal(isValidTimeZone('Asia/Tokyo'), true)
  assert.equal(isValidTimeZone('Not/AZone'), false)
  assert.equal(isValidTimeZone(''), false)
  assert.equal(isValidTimeZone(undefined), false)
})
