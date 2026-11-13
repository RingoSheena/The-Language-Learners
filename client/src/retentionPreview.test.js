import test from 'node:test'
import assert from 'node:assert/strict'
import { averageReviews, passIntervals } from './retentionPreview.js'

test('a higher target recall means more reviews', () => {
  const low = averageReviews(0.7)
  const medium = averageReviews(0.9)
  const high = averageReviews(0.97)

  assert.ok(low >= 1)
  assert.ok(low < medium, `${low} < ${medium}`)
  assert.ok(medium < high, `${medium} < ${high}`)
})

test('the simulation is the same every time', () => {
  assert.equal(averageReviews(0.85), averageReviews(0.85))
})

test('a remembered card comes back after growing intervals, sooner at higher targets', () => {
  const at90 = passIntervals(0.9)
  assert.equal(at90.length, 5)
  for (let i = 1; i < at90.length; i += 1) assert.ok(at90[i] > at90[i - 1])

  const at97 = passIntervals(0.97)
  assert.ok(at97[4] < at90[4])
})
