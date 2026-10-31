import { useEffect, useState } from 'react'
import { createFlashcard, getSavedWords } from '../lib/flashcardsApi.js'

const box = {
  position: 'fixed',
  zIndex: 1000,
  width: 'max-content',
  maxWidth: 320,
  maxHeight: 340,
  overflow: 'auto',
  boxSizing: 'border-box',
  background: '#fff',
  color: '#222',
  border: '1px solid #bbb',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,.2)',
  padding: '12px 14px',
  fontFamily: 'system-ui, sans-serif',
}

const clip = (s, n = 300) =>
  s.length > n ? s.slice(0, n - 1) + '…' : s

export default function DefinitionPopup({ popup }) {
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const word = popup?.info?.word ?? popup?.text

  useEffect(() => {
    let cancelled = false
    setSaved(false)
    setSaveError('')

    if (word) {
      getSavedWords()
        .then((words) => {
          if (!cancelled) setSaved(words.has(word))
        })
        .catch(() => {
          // Not logged in or offline -- leave the button enabled and
          // let saveFlashcard report the problem if they click it.
        })
    }

    return () => {
      cancelled = true
    }
  }, [word])

  if (!popup) return null

  const { info, text, rect } = popup

  const left = Math.max(
    8,
    Math.min(rect.left, window.innerWidth - 328)
  )

  const spaceBelow = window.innerHeight - rect.bottom
  const wordTop = rect.top ?? rect.bottom
  const flipUp = spaceBelow < 360 && wordTop > spaceBelow

  const pos = flipUp
    ? { left, bottom: window.innerHeight - wordTop + 8 }
    : { left, top: rect.bottom + 8 }

  const defs = info?.defs ?? []
  const freq = info?.freq ?? []

  const readings = [
    ...new Set(
      [...defs.map((d) => d.r), ...freq.map((f) => f.r)].filter(Boolean)
    ),
  ]

  const best = freq.length
    ? freq.reduce((m, x) => (x.v < m.v ? x : m))
    : null

  const japanese = info?.word ?? text

  const definition = defs.length
    ? defs
        .slice(0, 4)
        .map((d) =>
          [d.r, (d.gloss ?? []).join('; ')]
            .filter(Boolean)
            .join(' ')
        )
        .join('\n')
    : 'No definition found.'

  async function saveFlashcard() {
    setSaveError('')

    try {
      await createFlashcard({
        japanese,
        reading: readings.join('、 '),
        definition,
      })

      setSaved(true)
    } catch (error) {
      if (error.status === 409) {
        setSaved(true)
        return
      }

      console.error('Failed to save flashcard:', error)
      setSaveError(
        error.status === 401
          ? 'Please log in to save flashcards.'
          : 'Unable to create flashcard.'
      )
    }
  }

  const isAlreadySaved = saved

  return (
    <div
      data-jp-popup
      role="tooltip"
      style={{ ...box, ...pos }}
    >
      <div style={{ fontSize: 24, fontWeight: 600 }}>
        {japanese}
      </div>

      {info ? (
        <>
          {info.surface !== info.word && (
            <div style={{ fontSize: 12, color: '#888' }}>
              as written: {info.surface}
            </div>
          )}

          <div style={{ color: '#666', margin: '2px 0 6px' }}>
            {readings.join('、 ') || '(no reading data)'}
          </div>

          {defs.length > 0 ? (
            defs.slice(0, 4).map((d, i) => (
              <div
                key={i}
                style={{
                  fontSize: 15,
                  lineHeight: 1.5,
                  marginTop: 4,
                }}
              >
                {clip((d.gloss ?? []).join('; '))}
              </div>
            ))
          ) : (
            <div style={{ fontSize: 15 }}>
              No definition found.
            </div>
          )}

          {best && (
            <div
              style={{
                fontSize: 12,
                color: '#888',
                marginTop: 6,
              }}
            >
              Frequency rank #{best.v}
              {String(best.disp ?? '').includes('❌')
                ? ' (not in corpus)'
                : ''}
              {String(best.disp ?? '').includes('㋕')
                ? ' (kana form)'
                : ''}
            </div>
          )}
        </>
      ) : (
        <div style={{ marginTop: 4 }}>
          Not found in the dictionary.
        </div>
      )}

      <button
        type="button"
        onClick={saveFlashcard}
        disabled={!info || !defs.length || isAlreadySaved}
        style={{
          display: 'block',
          width: '100%',
          marginTop: 10,
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid #bbb',
          background: isAlreadySaved ? '#e0f2e9' : '#fff',
          color: '#222',
          fontSize: 14,
          fontWeight: 500,
          fontFamily: 'Arial, sans-serif',
          textAlign: 'center',
          whiteSpace: 'normal',
          opacity: 1,
          cursor: isAlreadySaved ? 'default' : 'pointer',
          visibility: 'visible',
        }}
      >
        {isAlreadySaved ? '✓ Saved' : '＋ Create Flashcard'}
      </button>

      {saveError && (
        <div style={{ marginTop: 6, color: '#c22', fontSize: 12 }}>
          {saveError}
        </div>
      )}

      {/* JMdict's license (CC BY-SA 4.0) asks for this wherever its
          definitions are shown */}
      <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
        Definitions from{' '}
        <a
          href="https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project"
          target="_blank"
          rel="noreferrer"
          style={{ color: 'inherit' }}
        >
          JMdict
        </a>{' '}
        by the{' '}
        <a
          href="https://www.edrdg.org/edrdg/licence.html"
          target="_blank"
          rel="noreferrer"
          style={{ color: 'inherit' }}
        >
          EDRDG
        </a>
        , CC BY-SA 4.0
      </div>
    </div>
  )
}