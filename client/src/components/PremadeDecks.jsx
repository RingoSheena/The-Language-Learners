import { useState } from 'react'
import {
  CATEGORIES,
  DIFFICULTIES,
  PREMADE_DECKS,
} from '../data/premadeDecks.js'
import { initDictionary, lookupWord } from '../lib/dictionary.js' // path to your dictionary file
import './PremadeDecks.css'

// Look every word up in your dictionary to get its reading and definition.
async function resolveWords(words) {
  await initDictionary()
  const found = []
  const seen = new Set()
  for (const word of words) {
    const info = await lookupWord(word)
    const def = info?.defs?.[0]
    if (!def || seen.has(info.word)) {
      if (!def) console.info('[premade decks] not in dictionary, skipped:', word)
      continue
    }
    seen.add(info.word)
    found.push({
      japanese: info.word,
      reading: def.r ?? '',
      definition: def.gloss.slice(0, 3).join('; '),
    })
  }
  return found
}

export default function PremadeDecks({ onStudy }) {
  const [category, setCategory] = useState('all')
  const [difficulty, setDifficulty] = useState('all')
  const [busyId, setBusyId] = useState(null)
  const [message, setMessage] = useState('')

  async function studyDeck(deck) {
    setBusyId(deck.id)
    setMessage('')
    try {
      const found = await resolveWords(deck.words)
      if (found.length === 0) {
        setMessage("None of this deck's words were found in the dictionary.")
        return
      }
      onStudy(found, deck.title)
    } catch (err) {
      console.error('Failed to start deck:', err)
      setMessage('Could not start this deck. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  const visibleDecks = PREMADE_DECKS.filter(
    (deck) =>
      (category === 'all' || deck.category === category) &&
      (difficulty === 'all' || deck.difficulty === difficulty)
  )

  return (
    <section className="premade-decks">
      <p>
        Pick a deck to practice its words. Fail marks a card as failed; Hard,
        Medium, and Easy count as a pass. Premade decks are not added to your
        own flashcards.
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

      {message && <p className="error-text" role="alert">{message}</p>}
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
                    <p className="premade-meta">{deck.words.length} words</p>
                    <button
                      className="flashcard-practice-start"
                      disabled={busyId !== null}
                      onClick={() => studyDeck(deck)}
                    >
                      {busyId === deck.id ? 'Preparing…' : 'Study'}
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