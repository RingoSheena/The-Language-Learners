import { useState } from 'react'
import {
  CATEGORIES,
  DIFFICULTIES,
  PREMADE_DECKS,
} from '../data/premadeDecks.js'
import './PremadeDecks.css'

export default function PremadeDecks({ onStudy }) {
  const [category, setCategory] = useState('all')
  const [difficulty, setDifficulty] = useState('all')

  const visibleDecks = PREMADE_DECKS.filter(
    (deck) =>
      (category === 'all' || deck.category === category) &&
      (difficulty === 'all' || deck.difficulty === difficulty)
  )

  return (
    <section className="premade-decks">
      <p>
        Pick a deck to practice its words. Pass a card when you know it, or
        Fail it to see it again soon. Deck cards aren't added to your own
        flashcards, but practicing them still counts toward your stats and
        streak.
      </p>

      <div className="premade-filters">
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
        <label>
          Difficulty
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="all">All levels</option>
            {DIFFICULTIES.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </label>
      </div>

      {visibleDecks.length === 0 && <p>No decks match those filters.</p>}

      {CATEGORIES.map((c) => {
        const decks = visibleDecks.filter((deck) => deck.category === c.id)
        if (decks.length === 0) return null

        return (
          <div className="premade-category" key={c.id}>
            <h2>{c.label}</h2>
            <p className="premade-category-desc">{c.description}</p>

            <div className="premade-grid">
              {decks.map((deck) => {
                const level = DIFFICULTIES.find((d) => d.id === deck.difficulty)
                return (
                  <article className="premade-deck" key={deck.id}>
                    <span className={`premade-badge premade-badge-${deck.difficulty}`}>
                      {level.label}
                    </span>
                    <h3>{deck.title}</h3>
                    <p>{deck.description}</p>
                    <p className="premade-level-desc">{level.description}</p>
                    <p className="premade-meta">{deck.cards.length} words</p>
                    <button
                      className="flashcard-practice-start"
                      onClick={() => onStudy(deck.cards)}
                    >
                      Study
                    </button>
                  </article>
                )
              })}
            </div>
          </div>
        )
      })}
    </section>
  )
}
