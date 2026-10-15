// Books live on the server, tied to the logged-in user's account, so
// each learner only sees their own library. The EPUB file itself is
// only downloaded when a book is opened.

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
