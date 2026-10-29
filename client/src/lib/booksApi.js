// Books live on the server, tied to the logged-in user's account, so
// each learner only sees their own library. The EPUB file itself is
// only downloaded when a book is opened.

import { loadLocalReadingState, removeLocalReadingState } from '../readingState.js'

async function request(path, options = {}) {
  const response = await fetch(path, options)

  if (response.status === 204) return null

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const error = new Error(data.error || 'Something went wrong.')
    error.status = response.status
    throw error
  }

  return response
}

// Shape the server's book into what the bookshelf and reader expect.
function fromServer(book) {
  return {
    id: book.id,
    name: book.title,
    coverImage: book.coverImage,
    addedAt: Date.parse(book.createdAt),
    lastOpenedAt: book.lastOpenedAt ? Date.parse(book.lastOpenedAt) : undefined,
    readingPosition: book.readingPosition ?? null,
  }
}

export async function listBooks() {
  const response = await request('/api/books')
  return (await response.json()).map(fromServer)
}

export async function uploadBook({ file, title, coverImage }) {
  const form = new FormData()
  form.append('book', file)
  form.append('title', title)
  if (coverImage) form.append('coverImage', coverImage)

  const response = await request('/api/books', { method: 'POST', body: form })
  return fromServer(await response.json())
}

export async function downloadBook(id) {
  const response = await request(`/api/books/${id}`)
  return response.arrayBuffer()
}

export function touchBook(id, lastOpenedAt) {
  return request(`/api/books/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lastOpenedAt: new Date(lastOpenedAt).toISOString() }),
  })
}

export function deleteBook(id) {
  return request(`/api/books/${id}`, { method: 'DELETE' })
}

const jsonBody = (body) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

// Where the learner left off in a book, and its bookmarks. Progress saved
// before this synced exists only in this browser, so the first time a book
// with nothing on the server is opened here, that copy is moved to the
// account.
export async function loadReadingState(id) {
  const response = await request(`/api/books/${id}/reading`)
  const saved = await response.json()
  const local = loadLocalReadingState(id)

  if (saved.position || saved.bookmarks.length > 0 || (!local.position && local.bookmarks.length === 0)) {
    return saved
  }

  const bookmarks = []
  for (const bookmark of local.bookmarks) {
    bookmarks.push(await createBookmark(id, {
      label: bookmark.label || `Bookmark at ${Math.round(bookmark.position.progress * 100)}%`,
      position: bookmark.position,
    }))
  }
  if (local.position) await saveReadingPosition(id, local.position)
  removeLocalReadingState(id)

  return { position: local.position, bookmarks }
}

// keepalive lets the save finish even if the page is closing.
export function saveReadingPosition(id, position, { keepalive = false } = {}) {
  return request(`/api/books/${id}/position`, {
    method: 'PUT',
    keepalive,
    ...jsonBody({ position }),
  })
}

export async function createBookmark(id, { label, position }) {
  const response = await request(`/api/books/${id}/bookmarks`, {
    method: 'POST',
    ...jsonBody({ label, position }),
  })
  return response.json()
}

export function deleteBookmark(id, bookmarkId) {
  return request(`/api/books/${id}/bookmarks/${bookmarkId}`, { method: 'DELETE' })
}
