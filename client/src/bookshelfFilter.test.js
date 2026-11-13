import test from 'node:test'
import assert from 'node:assert/strict'
import { bookStatus, countByStatus, filterBooks, normalizeText } from './bookshelfFilter.js'

const books = [
  { id: 'a', name: 'Naruto Vol 1' },
  { id: 'b', name: 'ナルト 第二巻' },
  { id: 'c', name: 'Kiki’s Delivery Service' },
  { id: 'd', name: '魔女の宅急便' },
]
const progress = { a: 0.4, b: 1, d: 0.99 }
const getProgress = (book) => progress[book.id]

test('status comes from reading progress', () => {
  assert.equal(bookStatus(null), 'unread')
  assert.equal(bookStatus(undefined), 'unread')
  assert.equal(bookStatus(0), 'reading')
  assert.equal(bookStatus(0.5), 'reading')
  assert.equal(bookStatus(0.98), 'finished')
  assert.equal(bookStatus(1), 'finished')
})

test('search is case-insensitive and folds full/half-width characters', () => {
  assert.equal(normalizeText('  ＮＡＲＵＴＯ  '), 'naruto')
  assert.equal(normalizeText('ﾅﾙﾄ'), 'ナルト')
  assert.deepEqual(filterBooks(books, { query: 'naruto' }).map((b) => b.id), ['a'])
  assert.deepEqual(filterBooks(books, { query: 'ﾅﾙﾄ' }).map((b) => b.id), ['b'])
  assert.deepEqual(filterBooks(books, { query: '宅急便' }).map((b) => b.id), ['d'])
  assert.deepEqual(filterBooks(books, { query: '   ' }).map((b) => b.id), ['a', 'b', 'c', 'd'])
})

test('status filter and search combine', () => {
  assert.deepEqual(filterBooks(books, { status: 'unread' }, getProgress).map((b) => b.id), ['c'])
  assert.deepEqual(filterBooks(books, { status: 'reading' }, getProgress).map((b) => b.id), ['a'])
  assert.deepEqual(filterBooks(books, { status: 'finished' }, getProgress).map((b) => b.id), ['b', 'd'])
  assert.deepEqual(filterBooks(books, { query: 'ナルト', status: 'reading' }, getProgress), [])
})

test('counts follow the search text', () => {
  assert.deepEqual(countByStatus(books, '', getProgress), { all: 4, unread: 1, reading: 1, finished: 2 })
  assert.deepEqual(countByStatus(books, 'naruto', getProgress), { all: 1, unread: 0, reading: 1, finished: 0 })
})