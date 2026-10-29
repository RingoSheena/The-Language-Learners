import test from 'node:test'
import assert from 'node:assert/strict'
import { loadLocalReadingState, removeLocalReadingState, readingProgress, restorePosition } from './readingState.js'

test('old browser-stored reading state is read per book and validated', () => {
  const data = new Map()
  globalThis.localStorage = {
    getItem: (key) => data.get(key),
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  }
  const state = { position: { progress: 0.4, path: [0, 2], offset: 5 }, bookmarks: [{ id: 'one', position: { progress: 0.2 } }] }
  data.set('yomu-reading:a', JSON.stringify(state))
  assert.deepEqual(loadLocalReadingState('a'), state)
  assert.deepEqual(loadLocalReadingState('b'), { position: null, bookmarks: [] })
  data.set('yomu-reading:broken', '{')
  assert.deepEqual(loadLocalReadingState('broken'), { position: null, bookmarks: [] })
  data.set('yomu-reading:invalid', JSON.stringify({ position: { progress: 4 }, bookmarks: [{ id: 'bad', position: { progress: -1 } }] }))
  assert.deepEqual(loadLocalReadingState('invalid'), { position: null, bookmarks: [] })
  removeLocalReadingState('a')
  assert.equal(loadLocalReadingState('a').position, null)
})

test('storage denial is recoverable', () => {
  globalThis.localStorage = { getItem() { throw Error('denied') }, removeItem() { throw Error('denied') } }
  assert.equal(loadLocalReadingState('a').position, null)
  assert.doesNotThrow(() => removeLocalReadingState('a'))
})

test('progress runs right to left vertically and top to bottom horizontally', () => {
  const clip = { scrollWidth: 1000, clientWidth: 200, scrollLeft: 600, scrollHeight: 2000, clientHeight: 400, scrollTop: 400 }
  assert.equal(readingProgress(clip, true), 0.25)
  assert.equal(readingProgress(clip, false), 0.25)
  restorePosition(null, clip, true, { progress: 0.75 })
  assert.equal(clip.scrollLeft, 200)
  restorePosition(null, clip, false, { progress: 0.75, path: [99] })
  assert.equal(clip.scrollTop, 1200)
  assert.equal(readingProgress({ scrollHeight: 20, clientHeight: 100 }, false), 0)
})
