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

// Grades a card; the server computes and saves the new schedule (with the
// same shared/srs.js), logs the review for stats, and returns the updated
// card. durationMs is how long the card was shown before being graded.
// Doesn't reset the saved-words cache: grading a card doesn't change which
// words exist.
export function reviewFlashcard(id, grade, durationMs) {
  return request(`/api/flashcards/${id}/review`, {
    method: 'POST',
    body: JSON.stringify({ grade, durationMs }),
  })
}

// Practice stats: today, the past week, streak, retention, cards due soon,
// and a year of daily review counts. Days are the learner's local practice
// days (see shared/practiceDay.js), so send this browser's time zone.
export function getFlashcardStats() {
  const { timeZone } = Intl.DateTimeFormat().resolvedOptions()
  return request(`/api/flashcards/stats?timeZone=${encodeURIComponent(timeZone)}`)
}

export async function deleteFlashcard(id) {
  try {
    return await request(`/api/flashcards/${id}`, { method: 'DELETE' })
  } finally {
    forgetSavedWords()
  }
}
