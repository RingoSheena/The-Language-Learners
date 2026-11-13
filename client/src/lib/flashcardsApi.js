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

// Logs a review of a premade deck card, so deck practice counts toward stats
// and the streak. Deck cards aren't saved, so this sends the intervals the
// client computed instead of a card id.
export function logPremadeReview({ grade, durationMs, intervalDays, newIntervalDays }) {
  return request('/api/flashcards/premade-reviews', {
    method: 'POST',
    body: JSON.stringify({ grade, durationMs, intervalDays, newIntervalDays }),
  })
}

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

// Practice stats: today, the past week, streak, retention, cards due soon,
// a year of daily review counts, and all-time daily history for the activity
// charts. Days are the learner's local practice days (see
// shared/practiceDay.js), so send this browser's time zone.
export function getFlashcardStats() {
  return request(`/api/flashcards/stats?timeZone=${encodeURIComponent(browserTimeZone())}`)
}

// The reviews on practice days start through end ("YYYY-MM-DD", inclusive,
// at most 31 days), oldest first, as
// { start, end, reviews: [{ cardId, grade, reviewedAt, durationMs }] }.
// cardId is null for premade deck reviews and deleted cards.
export function getReviewsInDays(start, end) {
  const params = new URLSearchParams({ start, end, timeZone: browserTimeZone() })
  return request(`/api/flashcards/reviews?${params}`)
}

// Account settings that shape flashcard scheduling: { desiredRetention },
// the target recall (see shared/srs.js).
export function getSettings() {
  return request('/api/settings')
}

export function updateSettings(changes) {
  return request('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })
}

export async function deleteFlashcard(id) {
  try {
    return await request(`/api/flashcards/${id}`, { method: 'DELETE' })
  } finally {
    forgetSavedWords()
  }
}
