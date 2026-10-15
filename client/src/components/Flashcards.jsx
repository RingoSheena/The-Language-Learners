import { useCallback, useEffect, useState } from 'react'
import {
  deleteFlashcard,
  listFlashcards,
  updateFlashcard,
} from '../lib/flashcardsApi.js'
import TopBar from '../TopBar.jsx'
import './Flashcards.css'

const DEFAULT_PRACTICE_HOTKEYS = { fail: '1', pass: '2' }
const PRACTICE_HOTKEYS_STORAGE_KEY = 'flashcards-practice-hotkeys'

function isValidPracticeHotkey(key) {
  return typeof key === 'string' && /^[a-z0-9]$/i.test(key)
}

function loadPracticeHotkeys() {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(PRACTICE_HOTKEYS_STORAGE_KEY)
    )
    if (
      isValidPracticeHotkey(saved?.fail) &&
      isValidPracticeHotkey(saved?.pass) &&
      saved.fail.toLowerCase() !== saved.pass.toLowerCase()
    ) {
      return {
        fail: saved.fail.toUpperCase(),
        pass: saved.pass.toUpperCase(),
      }
    }
  } catch {
    // Use defaults when storage is unavailable or contains invalid data.
  }

  return DEFAULT_PRACTICE_HOTKEYS
}

export default function Flashcards({ onBack }) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flipped, setFlipped] = useState({})
  const [editing, setEditing] = useState(null)
  const [practiceCards, setPracticeCards] = useState([])
  const [practiceIndex, setPracticeIndex] = useState(null)
  const [practiceFlipped, setPracticeFlipped] = useState(false)
  const [practiceHotkeys, setPracticeHotkeys] = useState(loadPracticeHotkeys)
  const [hotkeySettingsOpen, setHotkeySettingsOpen] = useState(false)
  const [hotkeyDraft, setHotkeyDraft] = useState(DEFAULT_PRACTICE_HOTKEYS)
  const [hotkeyError, setHotkeyError] = useState('')

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
    const orderedCards = [...cards].sort(
      (first, second) =>
        new Date(first.createdAt).getTime() -
        new Date(second.createdAt).getTime()
    )
    setPracticeCards(orderedCards)
    setPracticeIndex(0)
    setPracticeFlipped(false)
  }

  const advancePractice = useCallback(() => {
    setPracticeIndex((index) =>
      index === null || index >= practiceCards.length - 1 ? null : index + 1
    )
    setPracticeFlipped(false)
  }, [practiceCards.length])

  function openHotkeySettings() {
    setHotkeyDraft({ ...practiceHotkeys })
    setHotkeyError('')
    setHotkeySettingsOpen(true)
  }

  function saveHotkeySettings(event) {
    event.preventDefault()

    const fail = hotkeyDraft.fail.trim()
    const pass = hotkeyDraft.pass.trim()
    if (!isValidPracticeHotkey(fail) || !isValidPracticeHotkey(pass)) {
      setHotkeyError('Choose one letter or number for each action.')
      return
    }
    if (fail.toLowerCase() === pass.toLowerCase()) {
      setHotkeyError('Fail and Pass must use different keys.')
      return
    }

    setPracticeHotkeys({ fail: fail.toUpperCase(), pass: pass.toUpperCase() })
    setHotkeySettingsOpen(false)
  }

  useEffect(() => {
    if (practiceIndex === null || hotkeySettingsOpen) return

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
      if (key === practiceHotkeys.fail || key === practiceHotkeys.pass) {
        event.preventDefault()
        advancePractice()
      }
    }

    window.addEventListener('keydown', handlePracticeKeyDown)
    return () => window.removeEventListener('keydown', handlePracticeKeyDown)
  }, [advancePractice, hotkeySettingsOpen, practiceHotkeys, practiceIndex])

  if (practiceIndex !== null) {
    const card = practiceCards[practiceIndex]

    return (
      <div className="flashcards-practice-page">
        <TopBar>
          <button className="topbar-btn" onClick={openHotkeySettings}>
            Hotkeys
          </button>
          <button
            className="topbar-btn"
            onClick={() => setPracticeIndex(null)}
          >
            Exit practice
          </button>
        </TopBar>

        <main className="flashcards-practice">
          <p className="flashcard-progress">
            Card {practiceIndex + 1} of {practiceCards.length}
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
            <button
              className="flashcard-practice-fail"
              onClick={advancePractice}
            >
              Fail
            </button>
            <button
              className="flashcard-practice-pass"
              onClick={advancePractice}
            >
              Pass
            </button>
          </div>
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
                <label>
                  Fail key
                  <input
                    autoFocus
                    type="text"
                    maxLength={1}
                    value={hotkeyDraft.fail}
                    onChange={(event) =>
                      setHotkeyDraft((draft) => ({
                        ...draft,
                        fail: event.target.value.slice(-1).toUpperCase(),
                      }))
                    }
                  />
                </label>
                <label>
                  Pass key
                  <input
                    type="text"
                    maxLength={1}
                    value={hotkeyDraft.pass}
                    onChange={(event) =>
                      setHotkeyDraft((draft) => ({
                        ...draft,
                        pass: event.target.value.slice(-1).toUpperCase(),
                      }))
                    }
                  />
                </label>
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
