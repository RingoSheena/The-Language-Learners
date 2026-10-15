import test from 'node:test'
import assert from 'node:assert/strict'
import { loadReadingState, saveReadingState, removeReadingState, readingProgress, restorePosition } from './readingState.js'

test('reading state is isolated by book and survives a storage round trip', () => {
  const data = new Map()
  globalThis.localStorage = {
    getItem: (key) => data.get(key),
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  }
  const state = { position: { progress: 0.4, path: [0, 2], offset: 5 }, bookmarks: [{ id: 'one', position: { progress: 0.2 } }] }
  assert.equal(saveReadingState('a', state), true)
  assert.deepEqual(loadReadingState('a'), state)
  assert.deepEqual(loadReadingState('b'), { position: null, bookmarks: [] })
  data.set('yomu-reading:broken', '{')
  assert.deepEqual(loadReadingState('broken'), { position: null, bookmarks: [] })
  data.set('yomu-reading:invalid', JSON.stringify({ position: { progress: 4 }, bookmarks: [{ id: 'bad', position: { progress: -1 } }] }))
  assert.deepEqual(loadReadingState('invalid'), { position: null, bookmarks: [] })
  removeReadingState('a')
  assert.equal(loadReadingState('a').position, null)
})

test('storage denial is recoverable', () => {
  globalThis.localStorage = { getItem() { throw Error('denied') }, setItem() { throw Error('quota') } }
  assert.equal(loadReadingState('a').position, null)
  assert.equal(saveReadingState('a', {}), false)
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
