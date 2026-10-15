import { useEffect, useState } from 'react'
import {
  deleteFlashcard,
  listFlashcards,
  updateFlashcard,
} from '../lib/flashcardsApi.js'
import './Flashcards.css'

export default function Flashcards({ onBack }) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flipped, setFlipped] = useState({})
  const [editing, setEditing] = useState(null)

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
      )}
    </div>
  )
}
