import { useEffect, useMemo, useState } from 'react'
import TopBar from './TopBar.jsx'
import { getSettings, updateSettings } from './lib/flashcardsApi.js'
import { averageReviews, passIntervals } from './retentionPreview.js'
import { DEFAULT_RETENTION } from '../../shared/srs.js'
import './Settings.css'

// Target recall choices, within shared/srs.js's MIN_RETENTION..MAX_RETENTION
const RETENTION_OPTIONS = [0.7, 0.75, 0.8, 0.85, 0.9, 0.93, 0.95, 0.97]

const percent = (value) => `${Math.round(value * 100)}%`

// "4 days", "5 months", "2 years"
function formatInterval(days) {
  const plural = (count, unit) => `${count} ${unit}${count === 1 ? '' : 's'}`
  if (days < 31) return plural(days, 'day')
  if (days < 365) return plural(Math.round(days / 30), 'month')
  return plural(Math.round(days / 365), 'year')
}

// Shows what each target recall costs and buys: reviews per new card over
// its first year (bars), and how soon a remembered card comes back.
function RetentionPreview({ selected }) {
  // Simulates every option once; quick (~15ms each), but no need to repeat it
  const workloads = useMemo(
    () => RETENTION_OPTIONS.map((value) => ({ value, reviews: averageReviews(value) })),
    []
  )
  const busiest = Math.max(...workloads.map(({ reviews }) => reviews))
  const current = workloads.find(({ value }) => value === selected)

  return (
    <figure className="retention-preview">
      <figcaption>Reviews per new card in its first year</figcaption>
      <div className="retention-preview-bars">
        {workloads.map(({ value, reviews }) => (
          <div
            key={value}
            className={`retention-preview-bar${value === selected ? ' retention-preview-bar-selected' : ''}`}
            title={`${percent(value)}: about ${reviews.toFixed(1)} reviews`}
          >
            <span className="retention-preview-track">
              <span
                className="retention-preview-fill"
                style={{ height: `${(reviews / busiest) * 100}%` }}
              >
                <span className="retention-preview-value">{Math.round(reviews)}</span>
              </span>
            </span>
            <span className="retention-preview-label">{percent(value)}</span>
          </div>
        ))}
      </div>
      {current && (
        <p className="settings-help">
          At {percent(selected)}, a new card takes about{' '}
          <strong>{Math.round(current.reviews)} reviews</strong> in its first year,
          and you’d forget about{' '}
          <strong>{Math.round((1 - selected) * 100)} in 100</strong> cards when
          they come up. A card you keep remembering comes back after{' '}
          {passIntervals(selected, 4).map(formatInterval).join(', then ')}.
        </p>
      )}
    </figure>
  )
}

function Settings({ onBack }) {
  const [desiredRetention, setDesiredRetention] = useState(null)
  const [status, setStatus] = useState('') // '' | 'saving' | 'saved' | error message

  useEffect(() => {
    let cancelled = false

    getSettings()
      .then((settings) => {
        if (!cancelled) setDesiredRetention(settings.desiredRetention)
      })
      .catch((err) => {
        console.error('Failed to load settings:', err)
        if (!cancelled) setStatus('Your settings could not be loaded.')
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function changeRetention(event) {
    const previous = desiredRetention
    const next = Number(event.target.value)
    setDesiredRetention(next)
    setStatus('saving')

    try {
      const saved = await updateSettings({ desiredRetention: next })
      setDesiredRetention(saved.desiredRetention)
      setStatus('saved')
    } catch (err) {
      console.error('Failed to save settings:', err)
      setDesiredRetention(previous)
      setStatus(err.message)
    }
  }

  return (
    <div className="settings-page">
      <TopBar>
        <button className="topbar-btn" onClick={onBack}>
          Return to bookshelf
        </button>
      </TopBar>

      <div className="settings-content">
        <h2>Settings</h2>

        <section className="settings-section">
          <h3>Flashcards</h3>

          <label className="settings-field">
            <span>Target recall</span>
            <select
              value={desiredRetention ?? ''}
              onChange={changeRetention}
              disabled={desiredRetention === null || status === 'saving'}
            >
              {desiredRetention === null && <option value="">Loading…</option>}
              {RETENTION_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {percent(value)}
                  {value === DEFAULT_RETENTION ? ' (recommended)' : ''}
                </option>
              ))}
            </select>
          </label>

          <p className="settings-help">
            How likely you should be to remember a card when it comes up for
            review. Lower means fewer reviews but more forgetting; higher means
            you remember more but review much more often. Changes apply to each
            card from its next review.
          </p>

          {desiredRetention !== null && <RetentionPreview selected={desiredRetention} />}

          {status && (
            <p className={`settings-status${status === 'saving' || status === 'saved' ? '' : ' settings-status-error'}`}>
              {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved.' : status}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

export default Settings
