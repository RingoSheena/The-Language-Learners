import { useState } from 'react'
import './Flashcards.css'

export default function Flashcards({ onBack }) {
  const [cards, setCards] = useState(() =>
    JSON.parse(localStorage.getItem('flashcards') || '[]')
  )

  const [flipped, setFlipped] = useState({})

  function removeCard(id) {
    if (
      !window.confirm(
        'Are you sure you want to remove this flashcard?'
      )
    ) {
      return
    }

    const updated = cards.filter((card) => card.id !== id)

    localStorage.setItem('flashcards', JSON.stringify(updated))
    setCards(updated)
  }

  return (
    <div style={{ padding: 24 }}>
      <button onClick={onBack}>← Back to Bookshelf</button>

      <h1>My Flashcards</h1>
      <p>Click a card to reveal its definition.</p>

      {cards.length === 0 ? (
        <p>No flashcards saved yet. Save a word from its definition popup!</p>
      ) : (
        <div className="flashcards-grid">
          {cards.map((card) => (
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

              <button
                className="flashcard-remove"
                onClick={() => removeCard(card.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}