import { useCallback, useEffect, useState } from 'react'
import {
  deleteFlashcard,
  listFlashcards,
  reviewFlashcard,
  updateFlashcard,
} from '../lib/flashcardsApi.js'
import { pickNextCard, RECENT_BUFFER_SIZE, reviewCard } from '../srs.js'
import TopBar from '../TopBar.jsx'
import './Flashcards.css'

const PRACTICE_GRADES = [
  { grade: 'fail', label: 'Fail', feedback: 'Failed' },
  { grade: 'hard', label: 'Hard', feedback: 'Hard' },
  { grade: 'medium', label: 'Medium', feedback: 'Medium' },
  { grade: 'easy', label: 'Easy', feedback: 'Easy' },
]
const DEFAULT_PRACTICE_HOTKEYS = { fail: '1', hard: '2', medium: '3', easy: '4' }
const PRACTICE_HOTKEYS_STORAGE_KEY = 'flashcards-practice-hotkeys'

function isValidPracticeHotkey(key) {
  return typeof key === 'string' && /^[a-z0-9]$/i.test(key)
}

function hasDistinctValidHotkeys(hotkeys) {
  const keys = PRACTICE_GRADES.map(({ grade }) => hotkeys?.[grade])
  return (
    keys.every(isValidPracticeHotkey) &&
    new Set(keys.map((key) => key.toLowerCase())).size === keys.length
  )
}

function uppercaseHotkeys(hotkeys) {
  return Object.fromEntries(
    PRACTICE_GRADES.map(({ grade }) => [grade, hotkeys[grade].toUpperCase()])
  )
}

function loadPracticeHotkeys() {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(PRACTICE_HOTKEYS_STORAGE_KEY)
    )
    if (hasDistinctValidHotkeys(saved)) return uppercaseHotkeys(saved)
  } catch {
    // Use defaults when storage is unavailable or contains invalid data.
  }

  return DEFAULT_PRACTICE_HOTKEYS
}

const countDue = (cards, now) =>
  cards.filter((card) => new Date(card.dueAt) <= now).length

// The soonest dueAt in the deck, or null for an empty deck.
function earliestDueAt(cards) {
  const times = cards.map((card) => new Date(card.dueAt).getTime())
  return times.length ? new Date(Math.min(...times)) : null
}

function formatDueAt(date) {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function Flashcards({ onBack }) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flipped, setFlipped] = useState({})
  const [editing, setEditing] = useState(null)
  // null when not practicing. currentId is null once nothing is due.
  const [practice, setPractice] = useState(null)
  const [practiceFlipped, setPracticeFlipped] = useState(false)
  const [practiceHotkeys, setPracticeHotkeys] = useState(loadPracticeHotkeys)
  const [hotkeySettingsOpen, setHotkeySettingsOpen] = useState(false)
  const [hotkeyDraft, setHotkeyDraft] = useState(DEFAULT_PRACTICE_HOTKEYS)
  const [hotkeyError, setHotkeyError] = useState('')
  const [practiceFeedback, setPracticeFeedback] = useState(null)
  const [practiceSaveError, setPracticeSaveError] = useState(false)

  useEffect(() => {
    listFlashcards()
      .then(setCards)
      .catch((err) => {
        console.error('Failed to load flashcards:', err)
        setError(
          err.status === 401
            ? 'Please log in to see your flashcards.'
            : 'Unable to load your flashcards.'
        )
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PRACTICE_HOTKEYS_STORAGE_KEY,
        JSON.stringify(practiceHotkeys)
      )
    } catch {
      // Hotkeys still work for this session when storage is unavailable.
    }
  }, [practiceHotkeys])

  useEffect(() => {
    if (!practiceFeedback) return

    const timeoutId = window.setTimeout(() => setPracticeFeedback(null), 1400)
    return () => window.clearTimeout(timeoutId)
  }, [practiceFeedback])

  async function removeCard(id) {
    if (
      !window.confirm(
        'Are you sure you want to remove this flashcard?'
      )
    ) {
      return
    }

    try {
      await deleteFlashcard(id)
      setCards((prev) => prev.filter((card) => card.id !== id))
    } catch (err) {
      console.error('Failed to remove flashcard:', err)
      setError(err.message)
    }
  }

  async function saveEdit(event) {
    event.preventDefault()

    try {
      const updated = await updateFlashcard(editing.id, {
        japanese: editing.japanese,
        reading: editing.reading,
        definition: editing.definition,
      })

      setCards((prev) =>
        prev.map((card) => (card.id === updated.id ? updated : card))
      )
      setEditing(null)
      setError('')
    } catch (err) {
      console.error('Failed to update flashcard:', err)
      setError(err.message)
    }
  }

  const editField = (field) => (event) =>
    setEditing((prev) => ({ ...prev, [field]: event.target.value }))

  function startPractice() {
    const now = new Date()
    setPractice({
      currentId: pickNextCard(cards, { now })?.id ?? null,
      recentIds: [],
      reviewed: 0,
      dueCount: countDue(cards, now),
      ahead: false,
    })
    setPracticeFlipped(false)
    setPracticeFeedback(null)
    setPracticeSaveError(false)
  }

  // Keep practicing after everything due is done. Cards that aren't due yet
  // are graded and rescheduled like any other, so it still shapes the
  // algorithm.
  function practiceAhead() {
    const now = new Date()
    setPractice((current) => ({
      ...current,
      ahead: true,
      currentId:
        pickNextCard(cards, {
          now,
          recentIds: current.recentIds,
          includeNotDue: true,
        })?.id ?? null,
    }))
    setPracticeFlipped(false)
    setPracticeFeedback(null)
  }

  const gradePractice = useCallback(
    (grade) => {
      const card = cards.find((candidate) => candidate.id === practice?.currentId)
      if (!card) return

      const now = new Date()
      const schedule = reviewCard(card, grade, now)
      const nextCards = cards.map((candidate) =>
        candidate.id === card.id ? { ...candidate, ...schedule } : candidate
      )
      const recentIds = [...practice.recentIds, card.id].slice(
        -RECENT_BUFFER_SIZE
      )

      setCards(nextCards)
      setPractice({
        currentId:
          pickNextCard(nextCards, {
            now,
            recentIds,
            includeNotDue: practice.ahead,
          })?.id ?? null,
        recentIds,
        reviewed: practice.reviewed + 1,
        dueCount: countDue(nextCards, now),
        ahead: practice.ahead,
      })
      setPracticeFlipped(false)
      setPracticeFeedback(grade)

      // Don't make the learner wait on the network between cards.
      reviewFlashcard(card.id, schedule).catch((err) => {
        console.error('Failed to save review:', err)
        setPracticeSaveError(true)
      })
    },
    [cards, practice]
  )

  function exitPractice() {
    setPracticeFeedback(null)
    setPractice(null)
  }

  function openHotkeySettings() {
    setHotkeyDraft({ ...practiceHotkeys })
    setHotkeyError('')
    setHotkeySettingsOpen(true)
  }

  function saveHotkeySettings(event) {
    event.preventDefault()

    const draft = Object.fromEntries(
      PRACTICE_GRADES.map(({ grade }) => [grade, hotkeyDraft[grade].trim()])
    )
    if (!PRACTICE_GRADES.every(({ grade }) => isValidPracticeHotkey(draft[grade]))) {
      setHotkeyError('Choose one letter or number for each action.')
      return
    }
    if (!hasDistinctValidHotkeys(draft)) {
      setHotkeyError('Each action must use a different key.')
      return
    }

    setPracticeHotkeys(uppercaseHotkeys(draft))
    setHotkeySettingsOpen(false)
  }

  useEffect(() => {
    if (practice === null || hotkeySettingsOpen) return

    function handlePracticeKeyDown(event) {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))
      ) {
        return
      }

      const key = event.key.toUpperCase()
      const match = PRACTICE_GRADES.find(
        ({ grade }) => practiceHotkeys[grade] === key
      )
      if (match) {
        event.preventDefault()
        gradePractice(match.grade)
      }
    }

    window.addEventListener('keydown', handlePracticeKeyDown)
    return () => window.removeEventListener('keydown', handlePracticeKeyDown)
  }, [gradePractice, hotkeySettingsOpen, practiceHotkeys, practice])

  if (practice !== null) {
    const card = cards.find((candidate) => candidate.id === practice.currentId)
    const nextDueAt = earliestDueAt(cards)
    const canPracticeAhead =
      !card &&
      pickNextCard(cards, {
        recentIds: practice.recentIds,
        includeNotDue: true,
      }) !== null

    return (
      <div className="flashcards-practice-page">
        <TopBar>
          <button className="topbar-btn" onClick={openHotkeySettings}>
            Hotkeys
          </button>
          <button
            className="topbar-btn"
            onClick={exitPractice}
          >
            Exit practice
          </button>
        </TopBar>

        <main className="flashcards-practice">
          {practiceFeedback && (
            <p
              className={`flashcard-practice-feedback flashcard-practice-feedback-${practiceFeedback}`}
              role="status"
              aria-live="polite"
            >
              {
                PRACTICE_GRADES.find(({ grade }) => grade === practiceFeedback)
                  .feedback
              }
            </p>
          )}
          {practiceSaveError && (
            <p className="error-text" role="alert">
              Some reviews could not be saved. Check your connection.
            </p>
          )}

          {card ? (
            <>
              <p className="flashcard-progress">
                Reviewed {practice.reviewed} ·{' '}
                {practice.ahead
                  ? 'practicing ahead'
                  : `${practice.dueCount} due`}
              </p>

              <button
                className="flashcard flashcard-practice-card"
                onClick={() => setPracticeFlipped((isFlipped) => !isFlipped)}
              >
                <span className="flashcard-label">
                  {practiceFlipped ? 'DEFINITION' : 'JAPANESE'}
                </span>
                <h2 lang="ja">
                  {practiceFlipped ? card.definition : card.japanese}
                </h2>
                {practiceFlipped && card.reading && <p>{card.reading}</p>}
                <span className="flashcard-hint">Click to flip</span>
              </button>

              <div className="flashcard-practice-actions">
                {PRACTICE_GRADES.map(({ grade, label }) => (
                  <button
                    key={grade}
                    className={`flashcard-practice-${grade}`}
                    onClick={() => gradePractice(grade)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <section className="flashcard-practice-done">
              <h2>You're all caught up</h2>
              <p>
                {practice.reviewed === 0
                  ? 'No cards are due right now.'
                  : `You reviewed ${practice.reviewed} ${
                      practice.reviewed === 1 ? 'card' : 'cards'
                    }.`}
              </p>
              {nextDueAt && (
                <p>Next card due {formatDueAt(nextDueAt)}.</p>
              )}
              {canPracticeAhead && (
                <button
                  className="flashcard-practice-start"
                  onClick={practiceAhead}
                >
                  Practice more
                </button>
              )}
              <button
                className="flashcard-practice-start"
                onClick={exitPractice}
              >
                Back to flashcards
              </button>
            </section>
          )}
        </main>

        {hotkeySettingsOpen && (
          <div className="flashcard-hotkey-backdrop">
            <section
              className="flashcard-hotkey-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="flashcard-hotkey-title"
            >
              <h2 id="flashcard-hotkey-title">Practice hotkeys</h2>
              <form onSubmit={saveHotkeySettings}>
                {PRACTICE_GRADES.map(({ grade, label }, index) => (
                  <label key={grade}>
                    {label} key
                    <input
                      autoFocus={index === 0}
                      type="text"
                      maxLength={1}
                      value={hotkeyDraft[grade]}
                      onChange={(event) =>
                        setHotkeyDraft((draft) => ({
                          ...draft,
                          [grade]: event.target.value.slice(-1).toUpperCase(),
                        }))
                      }
                    />
                  </label>
                ))}
                {hotkeyError && (
                  <p className="flashcard-hotkey-error" role="alert">
                    {hotkeyError}
                  </p>
                )}
                <div className="flashcard-hotkey-actions">
                  <button
                    type="button"
                    className="flashcard-hotkey-reset"
                    onClick={() => setHotkeyDraft(DEFAULT_PRACTICE_HOTKEYS)}
                  >
                    Defaults
                  </button>
                  <button
                    type="button"
                    className="flashcard-hotkey-cancel"
                    onClick={() => setHotkeySettingsOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="flashcard-hotkey-save">
                    Save
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      {onBack && <button onClick={onBack}>← Back to Bookshelf</button>}
      <h1>My Flashcards</h1>
      <p>Click a card to reveal its definition.</p>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p className="flashcards-empty">Loading flashcards…</p>
      ) : cards.length === 0 ? (
        !error && (
          <p>No flashcards saved yet. Save a word from its definition popup!</p>
        )
      ) : (
        <>
          <button
            className="flashcard-practice-start"
            onClick={startPractice}
          >
            Practice
          </button>
          <div className="flashcards-grid">
            {cards.map((card) =>
            editing?.id === card.id ? (
              <form
                className="flashcard-item flashcard-edit"
                key={card.id}
                onSubmit={saveEdit}
              >
                <label>
                  Japanese
                  <input
                    lang="ja"
                    value={editing.japanese}
                    onChange={editField('japanese')}
                    required
                  />
                </label>

                <label>
                  Reading
                  <input
                    lang="ja"
                    value={editing.reading}
                    onChange={editField('reading')}
                  />
                </label>

                <label>
                  Definition
                  <textarea
                    rows={4}
                    value={editing.definition}
                    onChange={editField('definition')}
                    required
                  />
                </label>

                <div className="flashcard-actions">
                  <button type="submit" className="flashcard-save">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flashcard-item" key={card.id}>
                <button
                  className="flashcard"
                  onClick={() =>
                    setFlipped((prev) => ({
                      ...prev,
                      [card.id]: !prev[card.id],
                    }))
                  }
                >
                  <span className="flashcard-label">
                    {flipped[card.id] ? 'DEFINITION' : 'JAPANESE'}
                  </span>

                  <h2 lang="ja">
                    {flipped[card.id] ? card.definition : card.japanese}
                  </h2>

                  {flipped[card.id] && card.reading && (
                    <p>{card.reading}</p>
                  )}

                  <span className="flashcard-hint">Click to flip</span>
                </button>

                <div className="flashcard-actions">
                  <button
                    className="flashcard-edit-btn"
                    onClick={() => setEditing({ ...card })}
                  >
                    Edit
                  </button>

                  <button
                    className="flashcard-remove"
                    onClick={() => removeCard(card.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
            )}
          </div>
        </>
      )}
    </div>
  )
}
