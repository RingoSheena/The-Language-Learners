// Flashcards live on the server, tied to the logged-in user's account
// (the session cookie identifies them), so they follow the learner
// across logins and devices instead of staying in this browser.

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body
      ? { 'Content-Type': 'application/json', ...options.headers }
      : options.headers,
  })

  if (response.status === 204) return null

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong.')
    error.status = response.status
    error.data = data
    throw error
  }

  return data
}

// The definition popup checks "is this word already saved?" on every
// hover, so keep one shared copy of the saved words instead of asking
// the server each time. Any change below resets it.
let savedWords = null

export function getSavedWords() {
  savedWords ??= listFlashcards()
    .then((cards) => new Set(cards.map((card) => card.japanese)))
    .catch((error) => {
      savedWords = null
      throw error
    })

  return savedWords
}

// Also called on logout so the next account doesn't see this one's
// saved words.
export function forgetSavedWords() {
  savedWords = null
}

export function listFlashcards() {
  return request('/api/flashcards')
}

export async function createFlashcard(card) {
  try {
    return await request('/api/flashcards', {
      method: 'POST',
      body: JSON.stringify(card),
    })
  } finally {
    forgetSavedWords()
  }
}

export async function updateFlashcard(id, changes) {
  try {
    return await request(`/api/flashcards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    })
  } finally {
    forgetSavedWords()
  }
}

export async function deleteFlashcard(id) {
  try {
    return await request(`/api/flashcards/${id}`, { method: 'DELETE' })
  } finally {
    forgetSavedWords()
  }
}
