// Search and status filtering for the bookshelf. Kept free of React and
// browser APIs so it can be tested with `node --test`.

// Progress at or above this counts as finished, so a learner who reaches the
// last page (but not the exact last pixel) still sees the book as done.
export const FINISHED_AT = 0.98

export const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Not started' },
  { id: 'reading', label: 'In progress' },
  { id: 'finished', label: 'Finished' },
]

export function bookStatus(progress) {
  if (!Number.isFinite(progress)) return 'unread'
  return progress >= FINISHED_AT ? 'finished' : 'reading'
}

// NFKC folds full-width letters/digits and half-width katakana, so typing
// "ｎａｒｕｔｏ" or "ﾅﾙﾄ" finds "Naruto" / "ナルト".
export function normalizeText(text) {
  return String(text ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function matchesQuery(book, query) {
  const needle = normalizeText(query)
  if (!needle) return true
  return normalizeText(book.name).includes(needle)
}

// getProgress(book) returns a 0..1 number, or null/undefined if never opened.
export function filterBooks(books, { query = '', status = 'all' } = {}, getProgress = () => null) {
  return books.filter(
    (book) =>
      matchesQuery(book, query) &&
      (status === 'all' || bookStatus(getProgress(book)) === status)
  )
}

// Counts for each status chip, based on books that match the search text.
export function countByStatus(books, query = '', getProgress = () => null) {
  const counts = { all: 0, unread: 0, reading: 0, finished: 0 }
  for (const book of books) {
    if (!matchesQuery(book, query)) continue
    counts.all += 1
    counts[bookStatus(getProgress(book))] += 1
  }
  return counts
}