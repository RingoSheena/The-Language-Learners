import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cardsAddedIn, cardsDueIn, formatDayKey } from '../activityCharts.js'
import { matchesTerms, queryTerms, searchableText } from '../cardSearch.js'
import { isKanaOnly, kanaToRomaji, romajiToKana, checkReadingAnswer } from '../kana.js'
import {
  deleteFlashcard,
  getFlashcardStats,
  getReviewsInDays,
  getSettings,
  listFlashcards,
  logPremadeReview,
  reviewFlashcard,
  updateFlashcard,
} from '../lib/flashcardsApi.js'
import { addDays, dayOfWeek, practiceDayKey } from '../../../shared/practiceDay.js'
import {
  DEFAULT_RETENTION,
  pickNextCard,
  pickRandomCard,
  RECENT_BUFFER_SIZE,
  reviewCard,
} from '../../../shared/srs.js'
import TopBar, { TopBarButton } from '../TopBar.jsx'
import ActivityCharts from './ActivityCharts.jsx'
import PremadeDecks from './PremadeDecks.jsx'
import RetentionSettings from './RetentionSettings.jsx'
import {
  BackIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  EditIcon,
  FlameIcon,
  PlayIcon,
  SearchIcon,
  SettingsIcon,
  TableIcon,
  TargetIcon,
  TrashIcon,
  TrendIcon,
} from './icons.jsx'
import './Flashcards.css'

// Practice only asks pass or fail. A pass is scheduled as the algorithm's
// normal "medium" grade (see shared/srs.js), so stats still count anything
// but a fail as a pass.
const PRACTICE_GRADES = [
  { grade: 'fail', label: 'Fail', srsGrade: 'fail' },
  { grade: 'pass', label: 'Pass', srsGrade: 'medium' },
]
const DEFAULT_PRACTICE_HOTKEYS = { fail: '1', pass: '2' }
const PRACTICE_HOTKEYS_STORAGE_KEY = 'flashcards-practice-hotkeys'

// The practice options on the settings page; the first of each is the default
const PRACTICE_MODES = [
  { value: 'flip', label: 'Flip cards' },
  { value: 'type', label: 'Type answer' },
]
const PRACTICE_ORDERS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'random', label: 'Random' },
]
const PRACTICE_MODE_STORAGE_KEY = 'flashcards-practice-mode'
const PRACTICE_ORDER_STORAGE_KEY = 'flashcards-practice-order'

// One of `options`' values, saved under `key` so it's kept between visits.
// Falls back to the first option when storage is unavailable or holds
// something that isn't an option.
function useStoredChoice(key, options) {
  const [value, setValue] = useState(() => {
    try {
      const saved = window.localStorage.getItem(key)
      if (options.some((option) => option.value === saved)) return saved
    } catch {
      // Use the default
    }
    return options[0].value
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // The choice still applies for this visit
    }
  }, [key, value])

  return [value, setValue]
}

// One practice option on the settings page: a titled card with a short
// explanation and a button per choice
function ChoiceToggle({ title, description, value, options, onChange }) {
  return (
    <div className="setting-option">
      <h3>{title}</h3>
      <p className="setting-option-help">{description}</p>
      <div className="setting-toggle" role="group" aria-label={title}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
// D and E are reserved for exiting practice and editing the current card.
const RESERVED_HOTKEYS = ['D', 'E']

function isValidPracticeHotkey(key) {
  return (
    typeof key === 'string' &&
    /^[a-z0-9]$/i.test(key) &&
    !RESERVED_HOTKEYS.includes(key.toUpperCase())
  )
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

// "konnichiwa" -> "Konnichiwa"
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// What gets read aloud and romanized. The kana reading is preferred, since
// speaking kanji directly can pick the wrong pronunciation.
const pronunciationSource = (card) => card.reading || card.japanese

const speechSupported = () =>
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  typeof window.SpeechSynthesisUtterance !== 'undefined'

// Picks a Japanese voice, preferring a natural-sounding / online one.
function pickJapaneseVoice() {
  const voices = window.speechSynthesis.getVoices()
  const japanese = voices.filter((voice) =>
    voice.lang.toLowerCase().replace('_', '-').startsWith('ja')
  )
  return (
    japanese.find((voice) => /natural|online|google|kyoko|otoya/i.test(voice.name)) ??
    japanese.find((voice) => voice.lang.toLowerCase().replace('_', '-') === 'ja-jp') ??
    japanese[0] ??
    null
  )
}

// Speaks the text in Japanese. Starting a new one stops any still playing, so
// pressing the button repeatedly just restarts the audio.
function speakJapanese(text, { onStart, onEnd } = {}) {
  window.speechSynthesis.cancel()

  const utterance = new window.SpeechSynthesisUtterance(text)
  utterance.lang = 'ja-JP'
  utterance.rate = 0.9
  const voice = pickJapaneseVoice()
  if (voice) utterance.voice = voice
  utterance.onstart = () => onStart?.()
  utterance.onend = () => onEnd?.()
  utterance.onerror = () => onEnd?.()

  window.speechSynthesis.speak(utterance)
}

// A button that plays the word's pronunciation. It can be pressed any number
// of times to replay it.
function PronunciationButton({ card }) {
  const [speaking, setSpeaking] = useState(false)
  const supported = speechSupported()
  const text = pronunciationSource(card)

  // Voices load asynchronously in some browsers; ask for them early so the
  // Japanese voice is ready by the first click.
  useEffect(() => {
    if (!supported) return
    window.speechSynthesis.getVoices()
  }, [supported])

  // Stop playback when the card changes or practice closes.
  useEffect(() => {
    if (!supported) return
    return () => window.speechSynthesis.cancel()
  }, [supported, card.id])

  function play() {
    if (!supported || !text) return
    speakJapanese(text, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    })
  }

  if (!supported) {
    return (
      <button
        type="button"
        className="anki-audio-btn"
        disabled
        title="Audio isn't supported in this browser"
      >
        🔇 Audio unavailable
      </button>
    )
  }

  return (
    <button
      type="button"
      className={`anki-audio-btn${speaking ? ' anki-audio-btn-playing' : ''}`}
      onClick={play}
      // Don't take focus on click: a focused button keeps Space and Enter
      // for itself, so they'd replay the audio instead of flipping or
      // passing the card. Tabbing to it still works.
      onMouseDown={(event) => event.preventDefault()}
      aria-label={`Play pronunciation of ${card.japanese}`}
      title="Play pronunciation (click again to replay)"
    >
      <PlayIcon />
    </button>
  )
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

// "45s", "12m", "1h 5m" -- for time spent practicing
function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return `${Math.round(ms / 1000)}s`
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

const formatPercent = (rate) => (rate === null ? '—' : `${Math.round(rate * 100)}%`)

const CARD_STAGES = [
  { stage: 'new', label: 'New', hint: 'Never reviewed' },
  { stage: 'learning', label: 'Learning', hint: 'Just failed, due again soon' },
  { stage: 'young', label: 'Young', hint: 'Interval under 21 days' },
  { stage: 'mature', label: 'Mature', hint: 'Interval of 21 days or more' },
]

function streakNote({ current, longest, practicedToday }) {
  if (current > 0 && !practicedToday) return 'Review a card today to keep it'
  return `Longest: ${longest} ${longest === 1 ? 'day' : 'days'}`
}

// Today's practice and what's coming up, shown above the flashcard list.
// onOpenCards(kind, { start, end }) lists the cards behind a heatmap day or
// chart bar; see the card list page.
function PracticeStats({ stats, onOpenCards }) {
  const { streak } = stats
  const items = [
    {
      label: 'Streak',
      value: `${streak.current} ${streak.current === 1 ? 'day' : 'days'}`,
      note: streakNote(streak),
      icon: <FlameIcon />,
      featured: true,
    },
    { label: 'Reviewed today', value: stats.today.reviews, icon: <CheckIcon /> },
    { label: 'Time today', value: formatDuration(stats.today.timeMs), icon: <ClockIcon /> },
    {
      label: 'Daily average (7 days)',
      value: Math.round(stats.week.averagePerDay * 10) / 10,
      icon: <TrendIcon />,
    },
    {
      label: 'Retention (30 days)',
      value: formatPercent(stats.retention.rate),
      note:
        stats.retention.rate === null
          ? 'No mature cards reviewed yet'
          : 'Mature cards not failed',
      icon: <TargetIcon />,
    },
    { label: 'Due today', value: stats.due.today, icon: <CalendarIcon /> },
    { label: 'Due tomorrow', value: stats.due.tomorrow, icon: <CalendarIcon /> },
    { label: 'Due this week', value: stats.due.week, icon: <CalendarIcon /> },
  ]

  const totalCards = CARD_STAGES.reduce((sum, { stage }) => sum + stats.cards[stage], 0)

  return (
    <section className="flashcard-stats-panel" aria-label="Practice stats">
      <dl className="flashcard-stats">
        {items.map(({ label, value, note, icon, featured }) => (
          <div
            className={`flashcard-stat${featured ? ' flashcard-stat-featured' : ''}`}
            key={label}
          >
            <span className="flashcard-stat-icon" aria-hidden="true">{icon}</span>
            <dt>{label}</dt>
            <dd>{value}</dd>
            {note && <dd className="flashcard-stat-note">{note}</dd>}
          </div>
        ))}
      </dl>

      <section className="flashcards-panel">
        <h2 className="flashcards-panel-title">Card stages</h2>
        {/* Each stage's share of the deck */}
        <div className="flashcard-stage-bar" aria-hidden="true">
          {CARD_STAGES.map(({ stage }) =>
            stats.cards[stage] > 0 ? (
              <span
                key={stage}
                className={`flashcard-stage-${stage}`}
                style={{ flexGrow: stats.cards[stage] / Math.max(1, totalCards) }}
              />
            ) : null
          )}
        </div>
        <ul className="flashcard-stages">
          {CARD_STAGES.map(({ stage, label, hint }) => (
            <li key={stage} title={hint}>
              <span className={`flashcard-stage-dot flashcard-stage-${stage}`} />
              {label} <strong>{stats.cards[stage]}</strong>
            </li>
          ))}
        </ul>
      </section>

      <ReviewHeatmap
        heatmap={stats.heatmap}
        onSelectDay={(day) => onOpenCards('reviewed', { start: day, end: day })}
      />

      <ActivityCharts
        history={stats.history}
        today={stats.heatmap.today}
        onSelectBar={onOpenCards}
      />
    </section>
  )
}

const HEATMAP_WEEKS = 53
// Smallest square, in CSS pixels; below it the heatmap scrolls sideways
const HEATMAP_MIN_CELL = 10
const HEATMAP_GAP = 3

// Square and gap sizes that fill `width` with `weeks` columns, rounded to
// whole device pixels. Fractional sizes would land each square on a
// different sub-pixel, so the browser would round some gaps up and others
// down and the grid would look uneven.
function heatmapSizes(width, weeks) {
  const dpr = window.devicePixelRatio || 1
  const gap = Math.max(1, Math.round(HEATMAP_GAP * dpr)) / dpr
  const fit = Math.floor(((width + gap) / weeks - gap) * dpr) / dpr
  return { cell: Math.max(HEATMAP_MIN_CELL, fit), gap }
}

// A year of reviews per day, one column per week (Sunday at the top), like a
// GitHub contribution graph. Shading is relative to the busiest day. Days
// with reviews are buttons that open that day's reviews.
function ReviewHeatmap({ heatmap, onSelectDay }) {
  const { today, days } = heatmap
  const first = addDays(today, -((HEATMAP_WEEKS - 1) * 7 + dayOfWeek(today)))
  const keys = []
  for (let key = first; key <= today; key = addDays(key, 1)) keys.push(key)

  const counts = Object.values(days)
  const busiest = Math.max(1, ...counts)
  const total = counts.reduce((sum, count) => sum + count, 0)

  // Month names go over the first week column of each month. The first
  // column only gets one when there's room before the next.
  const weeks = Math.ceil(keys.length / 7)
  const monthOf = (week) => keys[week * 7].slice(0, 7)
  const monthStarts = []
  for (let week = 1; week < weeks; week++) {
    if (monthOf(week) !== monthOf(week - 1)) monthStarts.push(week)
  }
  if ((monthStarts[0] ?? weeks) >= 3) monthStarts.unshift(0)

  // Cells are placed explicitly: row 1 holds month names, column 1 weekday names
  const at = (row, column) => ({ gridRow: row, gridColumn: column })

  // Size the squares to the panel's width, re-measured when it resizes
  const scrollRef = useRef(null)
  const [sizes, setSizes] = useState({ cell: 12, gap: HEATMAP_GAP })
  useLayoutEffect(() => {
    const scroll = scrollRef.current
    function measure() {
      const labels = [...scroll.querySelectorAll('.review-heatmap-weekday')]
      const labelWidth = Math.ceil(Math.max(0, ...labels.map((label) => label.offsetWidth)))
      const next = heatmapSizes(scroll.clientWidth - labelWidth, weeks)
      setSizes((current) =>
        current.cell === next.cell && current.gap === next.gap ? current : next
      )
    }
    measure()
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(scroll)
    return () => resizeObserver.disconnect()
  }, [weeks])

  return (
    <figure className="review-heatmap flashcards-panel">
      <div className="flashcards-panel-header">
        <h2 className="flashcards-panel-title">Review activity</h2>
        <figcaption>
          {total.toLocaleString()} {total === 1 ? 'review' : 'reviews'} in the past year
        </figcaption>
      </div>
      <div className="review-heatmap-scroll" ref={scrollRef}>
        <div
          className="review-heatmap-grid"
          role="group"
          aria-label={`Reviews per day over the past year: ${total} in total`}
          style={{
            gridTemplateColumns: `auto repeat(${weeks}, ${sizes.cell}px)`,
            gridTemplateRows: `auto repeat(7, ${sizes.cell}px)`,
            gap: `${sizes.gap}px`,
          }}
        >
          {monthStarts.map((week) => (
            <span key={week} className="review-heatmap-month" style={at(1, week + 2)} aria-hidden="true">
              {formatDayKey(keys[week * 7], { month: 'short', day: undefined })}
            </span>
          ))}
          {['Mon', 'Wed', 'Fri'].map((name, index) => (
            <span key={name} className="review-heatmap-weekday" style={at(index * 2 + 3, 1)} aria-hidden="true">
              {name}
            </span>
          ))}
          {keys.map((key, index) => {
            const count = days[key] ?? 0
            const level = count === 0 ? 0 : Math.ceil((count / busiest) * 4)
            const className =
              `review-heatmap-day review-heatmap-level-${level}` +
              (key === today ? ' review-heatmap-today' : '')
            const label = `${formatDayKey(key)}: ${count} ${count === 1 ? 'review' : 'reviews'}`
            const style = at((index % 7) + 2, Math.floor(index / 7) + 2)
            return count === 0 ? (
              <span key={key} className={className} style={style} title={label} />
            ) : (
              <button
                key={key}
                type="button"
                className={className}
                style={style}
                title={label}
                aria-label={`${label}. Show that day's cards`}
                onClick={() => onSelectDay(key)}
              />
            )
          })}
        </div>
      </div>
      <div className="review-heatmap-legend" aria-hidden="true">
        Less
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className={`review-heatmap-day review-heatmap-level-${level}`} />
        ))}
        More
      </div>
    </figure>
  )
}

// A short "when will I see this again" label for a grade button, like Anki's.
function formatIntervalPreview(days) {
  if (days < 1 / 24) return '<1m'
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`
  const rounded = Math.round(days * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}d`
}

// A saved definition is "reading gloss" per line; split the reading back out
// so it can be shown the way a dictionary entry would.
function splitDefinitionLine(line) {
  const spaceIndex = line.indexOf(' ')
  return spaceIndex === -1
    ? { reading: '', gloss: line }
    : { reading: line.slice(0, spaceIndex), gloss: line.slice(spaceIndex + 1) }
}

// A row is 2rem tall, so the list grows with the page's text size
const ROW_HEIGHT_REM = 2
const rowHeightPx = () =>
  ROW_HEIGHT_REM * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 18)
const ROW_OVERSCAN = 10

// Renders only the rows near the visible scroll area, so a list of
// thousands of flashcards stays as a few dozen real DOM rows. `active`
// re-attaches to the container when the page showing it opens.
function useVirtualRows(containerRef, itemCount, active, rowHeight) {
  const [range, setRange] = useState({ start: 0, end: Math.min(itemCount, 50) })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function updateRange() {
      const start = Math.max(
        0,
        Math.floor(el.scrollTop / rowHeight) - ROW_OVERSCAN
      )
      const visibleRows = Math.ceil(el.clientHeight / rowHeight) + ROW_OVERSCAN * 2
      setRange({ start, end: Math.min(itemCount, start + visibleRows) })
    }

    updateRange()
    el.addEventListener('scroll', updateRange, { passive: true })
    const resizeObserver = new ResizeObserver(updateRange)
    resizeObserver.observe(el)
    return () => {
      el.removeEventListener('scroll', updateRange)
      resizeObserver.disconnect()
    }
  }, [containerRef, itemCount, active, rowHeight])

  return range
}

// The edit dialog on the Browse and review day pages
function RowEditDialog({ editing, editField, onSave, onCancel }) {
  return (
    <div className="flashcard-row-edit-backdrop">
      <form className="flashcard-row-edit-dialog" onSubmit={onSave}>
        <h2>Edit flashcard</h2>
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

        <div className="flashcard-row-edit-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit">Save</button>
        </div>
      </form>
    </div>
  )
}

// Groups reviews by card, in the order each card was first reviewed.
// Reviews whose card isn't in `cards` (premade deck reviews and deleted
// cards) are only counted.
function groupReviewsByCard(reviews, cards) {
  const cardsById = new Map(cards.map((card) => [card.id, card]))
  const rows = new Map()
  let unlisted = 0

  for (const review of reviews) {
    const card = cardsById.get(review.cardId)
    if (!card) {
      unlisted += 1
      continue
    }
    if (!rows.has(card.id)) rows.set(card.id, { card, grades: [], timeMs: 0 })
    const row = rows.get(card.id)
    row.grades.push(review.grade)
    row.timeMs += review.durationMs
  }

  return { rows: [...rows.values()], unlisted }
}

// "Mar 3, 4:05 PM"
const formatDateTime = (date) =>
  new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

function GradeChips({ grades }) {
  return (
    <span className="flashcard-day-grades">
      {grades.map((grade, index) => {
        // Anything but a fail counts as a pass, as in practice
        const passed = grade !== 'fail'
        return (
          <span
            key={index}
            className={`flashcard-day-grade flashcard-day-grade-${passed ? 'pass' : 'fail'}`}
          >
            {passed ? 'Pass' : 'Fail'}
          </span>
        )
      })}
    </span>
  )
}

// The card list page's kinds, opened from the heatmap and the activity
// charts: the page title, and the table's last two columns before Actions.
// Each row is { card } plus, for reviewed cards, { grades, timeMs }.
const CARD_LISTS = {
  reviewed: {
    title: 'Reviewed',
    columns: [
      {
        label: 'Grade',
        hint: 'How you graded it, in order',
        render: (row) => <GradeChips grades={row.grades} />,
      },
      {
        label: 'Time',
        hint: 'Total answer time',
        number: true,
        render: (row) => formatDuration(row.timeMs),
      },
    ],
  },
  added: {
    title: 'Added',
    columns: [
      { label: 'Added', render: (row) => formatDateTime(row.card.createdAt) },
      { label: 'Due', render: (row) => formatDateTime(row.card.dueAt) },
    ],
  },
  due: {
    title: 'Due',
    columns: [
      { label: 'Due', render: (row) => formatDateTime(row.card.dueAt) },
      {
        label: 'Reviews',
        hint: 'Times reviewed',
        number: true,
        render: (row) => row.card.stats?.reviews ?? 0,
      },
    ],
  },
}

export default function Flashcards({ onBack }) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [tab, setTab] = useState('mine') // 'mine' | 'decks'
  // null when not practicing. currentId is null once nothing is due.
  // deckCards is null for your own cards, or an in-memory array for a premade deck.
  const [practice, setPractice] = useState(null)
  // Chosen on the settings page, and remembered in this browser
  const [practiceMode, setPracticeMode] = useStoredChoice(PRACTICE_MODE_STORAGE_KEY, PRACTICE_MODES)
  const [practiceOrder, setPracticeOrder] = useStoredChoice(PRACTICE_ORDER_STORAGE_KEY, PRACTICE_ORDERS)
  const [typedAnswer, setTypedAnswer] = useState('')
  const [typedResult, setTypedResult] = useState(null)
  const typedSubmitted = useRef(false)
  const [practiceFlipped, setPracticeFlipped] = useState(false)
  const [practiceHotkeys, setPracticeHotkeys] = useState(loadPracticeHotkeys)
  const [hotkeySettingsOpen, setHotkeySettingsOpen] = useState(false)
  const [hotkeyDraft, setHotkeyDraft] = useState(DEFAULT_PRACTICE_HOTKEYS)
  const [hotkeyError, setHotkeyError] = useState('')
  const [practiceSaveError, setPracticeSaveError] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  // The Browse page: the full card table, for editing and removing cards
  const [browsing, setBrowsing] = useState(false)
  // The settings page: practice options and spaced repetition
  const [retentionOpen, setRetentionOpen] = useState(false)
  const [search, setSearch] = useState('')
  // The card list page, for a heatmap day or chart bar: null when closed,
  // otherwise { kind, start, end, reviews, error }. kind is a CARD_LISTS key;
  // reviews is only loaded for 'reviewed', and null while loading.
  const [cardList, setCardList] = useState(null)
  const [stats, setStats] = useState(null)
  // The learner's target recall, from Settings. Only used for local
  // scheduling and previews; the server reads its own saved copy.
  const [desiredRetention, setDesiredRetention] = useState(DEFAULT_RETENTION)
  // When the current practice card was shown, to time each answer
  const cardShownAt = useRef(0)
  // Settles once every review sent so far has been saved (or failed)
  const pendingReviews = useRef(Promise.resolve())
  const tableScrollRef = useRef(null)
  // Normalized once per card, so searching thousands of cards stays quick
  // while typing
  const searchIndex = useMemo(
    () => cards.map((card) => ({ card, text: searchableText(card) })),
    [cards]
  )
  // The cards the Browse page shows: all of them, or those matching the search
  const browseCards = useMemo(() => {
    const terms = queryTerms(search)
    if (terms.length === 0) return cards
    return searchIndex
      .filter(({ text }) => matchesTerms(text, terms))
      .map(({ card }) => card)
  }, [cards, search, searchIndex])
  // Re-measured when the window resizes, since the base text size changes with it
  const [, setResizeTick] = useState(0)
  useEffect(() => {
    const onResize = () => setResizeTick((tick) => tick + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const rowHeight = rowHeightPx()
  const { start: rowStart, end: rowEnd } = useVirtualRows(
    tableScrollRef,
    browseCards.length,
    browsing,
    rowHeight
  )

  // Loads the cards (with their per-card stats) and the practice stats, on
  // open and again after each practice session. Waits for in-flight reviews
  // first, so the last card graded before exiting counts.
  const practicing = practice !== null
  useEffect(() => {
    if (practicing) return
    let cancelled = false

    pendingReviews.current
      .then(listFlashcards)
      .then((loaded) => {
        if (!cancelled) setCards(loaded)
      })
      .catch((err) => {
        console.error('Failed to load flashcards:', err)
        if (cancelled) return
        setError(
          err.status === 401
            ? 'Please log in to see your flashcards.'
            : 'Unable to load your flashcards.'
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    // Falls back to the default, which only affects the previews and
    // premade decks; the server schedules your cards with the saved value.
    getSettings()
      .then((settings) => {
        if (!cancelled) setDesiredRetention(settings.desiredRetention)
      })
      .catch((err) => console.error('Failed to load settings:', err))

    // Stats are a nice-to-have, so a failure just leaves the panel out.
    pendingReviews.current
      .then(getFlashcardStats)
      .then((loaded) => {
        if (!cancelled) setStats(loaded)
      })
      .catch((err) => console.error('Failed to load practice stats:', err))

    return () => {
      cancelled = true
    }
  }, [practicing])

  const currentPracticeId = practice?.currentId
  const practiceReviewed = practice?.reviewed
  useEffect(() => {
    cardShownAt.current = Date.now()
  }, [currentPracticeId, practiceReviewed])

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
        // Keep the per-card stats, which only come with the full list
        prev.map((card) => (card.id === updated.id ? { ...card, ...updated } : card))
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

  // Added and due cards come from the cards already loaded; reviews are
  // fetched, since a card's reviews aren't kept on the client.
  function openCardList(kind, { start, end }) {
    const list = { kind, start, end, reviews: null, error: '' }
    setCardList(list)
    if (kind !== 'reviewed') return

    // Only update the page if it's still showing this list
    const update = (changes) =>
      setCardList((current) => (current === list ? { ...current, ...changes } : current))
    getReviewsInDays(start, end)
      .then(({ reviews }) => update({ reviews }))
      .catch((err) => {
        console.error('Failed to load reviews:', err)
        update({ error: 'Those reviews could not be loaded.' })
      })
  }

  // Practice your own saved cards.
  function startPractice() {
    const now = new Date()
    const randomized = practiceOrder === 'random'
    setPractice({
      currentId: (randomized ? pickRandomCard(cards) : pickNextCard(cards, { now }))?.id ?? null,
      recentIds: [],
      seenIds: [],
      random: randomized,
      reviewed: 0,
      dueCount: countDue(cards, now),
      ahead: false,
      deckCards: null,
    })
    setTypedAnswer('')
    setTypedResult(null)
    typedSubmitted.current = false
    setPracticeFlipped(false)
    setPracticeSaveError(false)
  }

  // Practice a premade deck. Cards get the full SRS schedule fields so
  // reviewCard / pickNextCard work, but they live only in memory: they are
  // never added to your flashcards. Reviews are still logged for stats.
  function studyDeck(found) {
    const now = new Date()
    const deckCards = found.map((card, index) => ({
      ...card,
      id: `premade-${index}-${card.japanese}`,
      dueAt: now.toISOString(),
      intervalDays: 0,
      stability: null,
      difficulty: null,
      lapses: 0,
      lastReviewedAt: null,
    }))

    const randomized = practiceOrder === 'random'
    setPractice({
      currentId: (randomized ? pickRandomCard(deckCards) : pickNextCard(deckCards, { now }))?.id ?? null,
      recentIds: [],
      seenIds: [],
      random: randomized,
      reviewed: 0,
      dueCount: countDue(deckCards, now),
      ahead: false,
      deckCards,
    })
    setTypedAnswer('')
    setTypedResult(null)
    typedSubmitted.current = false
    setPracticeFlipped(false)
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
        pickNextCard(current.deckCards ?? cards, {
          now,
          recentIds: current.recentIds,
          includeNotDue: true,
        })?.id ?? null,
    }))
    setTypedAnswer('')
    setTypedResult(null)
    typedSubmitted.current = false
    setPracticeFlipped(false)
  }

  // `grade` is a practice button: 'fail' or 'pass'
  const gradePractice = useCallback(
    (grade) => {
      const isDeck = Boolean(practice?.deckCards)
      const list = practice?.deckCards ?? cards
      const card = list.find((candidate) => candidate.id === practice?.currentId)
      if (!card) return

      // Random practice is drilling only: nothing is rescheduled, saved or
      // counted toward stats. A passed card is done for the session; a
      // failed one comes back later.
      if (practice.random) {
        const seenIds =
          grade === 'pass' ? [...practice.seenIds, card.id] : practice.seenIds
        setPractice({
          ...practice,
          currentId:
            pickRandomCard(list, { seenIds, justShownId: card.id })?.id ?? null,
          seenIds,
          reviewed: practice.reviewed + 1,
        })
        setTypedAnswer('')
        setTypedResult(null)
        typedSubmitted.current = false
        setPracticeFlipped(false)
        return
      }

      const { srsGrade } = PRACTICE_GRADES.find((option) => option.grade === grade)
      const now = new Date()
      const schedule = reviewCard(card, srsGrade, now, { desiredRetention })
      const nextCards = list.map((candidate) =>
        candidate.id === card.id ? { ...candidate, ...schedule } : candidate
      )
      const recentIds = [...practice.recentIds, card.id].slice(
        -RECENT_BUFFER_SIZE
      )

      // Premade decks stay in memory; your own cards are saved as before.
      if (!isDeck) setCards(nextCards)
      setPractice({
        currentId:
          pickNextCard(nextCards, {
            now,
            recentIds,
            includeNotDue: practice.ahead,
          })?.id ?? null,
        recentIds,
        seenIds: [],
        random: false,
        reviewed: practice.reviewed + 1,
        dueCount: countDue(nextCards, now),
        ahead: practice.ahead,
        deckCards: isDeck ? nextCards : null,
      })
      setTypedAnswer('')
      setTypedResult(null)
      typedSubmitted.current = false
      setPracticeFlipped(false)

      // Premade deck cards aren't saved, but each review is logged so deck
      // practice counts toward stats and the streak.
      if (isDeck) {
        const logging = logPremadeReview({
          grade: srsGrade,
          durationMs: Date.now() - cardShownAt.current,
          intervalDays: card.intervalDays,
          newIntervalDays: schedule.intervalDays,
        })
        pendingReviews.current = Promise.allSettled([pendingReviews.current, logging])
        logging.catch((err) => {
          console.error('Failed to log premade deck review:', err)
          setPracticeSaveError(true)
        })
        return
      }

      // Don't make the learner wait on the network between cards. The local
      // schedule above uses the same shared/srs.js as the server; the
      // server's saved copy replaces it when it arrives.
      const saving = reviewFlashcard(
        card.id,
        srsGrade,
        Date.now() - cardShownAt.current
      )
      pendingReviews.current = Promise.allSettled([pendingReviews.current, saving])
      saving
        .then((saved) =>
          setCards((current) =>
            current.map((candidate) =>
              candidate.id === saved.id ? { ...candidate, ...saved } : candidate
            )
          )
        )
        .catch((err) => {
          console.error('Failed to save review:', err)
          setPracticeSaveError(true)
        })
    },
    [cards, desiredRetention, practice]
  )

  function exitPractice() {
    setMoreMenuOpen(false)
    setEditing(null)
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
    if (practice === null || hotkeySettingsOpen || editing) return

    function handlePracticeKeyDown(event) {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))
      ) {
        return
      }

      if (practiceMode === 'type') return
      const key = event.key.toUpperCase()

      if (key === 'D') {
        event.preventDefault()
        exitPractice()
        return
      }

      // Premade deck cards aren't saved, so they can't be edited.
      if (key === 'E') {
        if (practice.deckCards) return
        const card = cards.find(
          (candidate) => candidate.id === practice.currentId
        )
        if (card) {
          event.preventDefault()
          setEditing({ ...card })
        }
        return
      }

      const isSpace = event.key === ' '
      // A button the learner tabbed to gets Space/Enter as a normal press,
      // instead of it also flipping or passing the card. (This also keeps
      // the audio button's Space/Enter from flipping the card.)
      if (
        (isSpace || event.key === 'Enter') &&
        event.target instanceof HTMLButtonElement
      ) {
        return
      }

      if (!practiceFlipped) {
        if (isSpace || event.key === 'Enter') {
          event.preventDefault()
          setPracticeFlipped(true)
        }
        return
      }

      // Space flips a card, and pressing it again passes it.
      if (isSpace) {
        event.preventDefault()
        gradePractice('pass')
        return
      }

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
  }, [
    cards,
    editing,
    gradePractice,
    hotkeySettingsOpen,
    practice,
    practiceFlipped,
    practiceHotkeys, practiceMode,
  ])

  if (practice !== null) {
    const isDeck = Boolean(practice.deckCards)
    const list = practice.deckCards ?? cards
    const card = list.find((candidate) => candidate.id === practice.currentId)
    // Premade deck schedules aren't saved, so don't show a "next due" time.
    const nextDueAt = isDeck ? null : earliestDueAt(cards)
    const canPracticeAhead =
      !practice.random &&
      !card &&
      pickNextCard(list, {
        recentIds: practice.recentIds,
        includeNotDue: true,
      }) !== null

    const definitionLines = card
      ? card.definition.split('\n').filter(Boolean)
      : []

    // How the word is pronounced, e.g. こんにちは -> "Konnichiwa"
    const romaji = card ? kanaToRomaji(pronunciationSource(card)) : ''

    return (
      <div className="flashcards-practice-page anki-theme">
        <div className="anki-counter">
          <span>{practice.random ? list.length - practice.seenIds.length : practice.ahead ? '∞' : practice.dueCount}</span>
          <span className="anki-counter-caret">▾</span>
        </div>

        <main className="flashcards-practice">
          <div className="flashcard-stage">
            {practiceSaveError && (
              <p className="error-text anki-save-error" role="alert">
                Some reviews could not be saved. Check your connection.
              </p>
            )}

            {card ? (
              <div className="anki-card-area">
                {/* Not clickable: the card flips with Show Answer, Space, or
                    Enter, and Space again passes it */}
                <div className="anki-word-panel">
                  {practiceFlipped && card.reading && !isKanaOnly(card.japanese) && (
                    <span className="anki-reading">{card.reading}</span>
                  )}
                  <span
                    className={
                      practiceFlipped ? 'anki-word anki-word-answer' : 'anki-word'
                    }
                    lang="ja"
                  >
                    {card.japanese}
                  </span>

                  {/* Romaji, shown with the answer so it doesn't give
                      the reading away before the card is flipped */}
                  {practiceFlipped && romaji && (
                    <span className="anki-romaji">({capitalize(romaji)})</span>
                  )}

                  {/* Audio, on the back of the card only (it would give
                      the reading away) and replayable as many times as needed */}
                  {practiceFlipped && <PronunciationButton key={card.id} card={card} />}
                </div>

                {practiceMode === 'type' && !practiceFlipped && (
                  <form className="typed-answer" onSubmit={(event) => {
                    event.preventDefault()
                    if (event.nativeEvent.isComposing || typedSubmitted.current || !typedAnswer.trim()) return
                    typedSubmitted.current = true
                    setTypedResult(checkReadingAnswer(typedAnswer, pronunciationSource(card)))
                    setPracticeFlipped(true)
                  }}>
                    <label htmlFor="reading-answer">Type the kana reading (romaji accepted)</label>
                    <input id="reading-answer" autoFocus autoComplete="off" spellCheck={false}
                      onKeyDown={(event) => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault() }} value={typedAnswer} onChange={(event) => setTypedAnswer(event.target.value)} />
                    <p lang="ja">{romajiToKana(typedAnswer)}</p>
                    <button type="submit" disabled={!typedAnswer.trim()}>Check answer</button>
                  </form>
                )}
                {practiceMode === 'type' && practiceFlipped && (
                  <p role="status">{typedResult ? 'Correct' : 'Incorrect'} — Correct reading: <span lang="ja">{pronunciationSource(card)}</span></p>
                )}
                {practiceFlipped && (
                  <div className="anki-definition-panel">
                    <span className="anki-definition-label">Definition</span>
                    {definitionLines.map((line, index) => {
                      // Premade definitions have no "reading" prefix to split off.
                      const { reading, gloss } = isDeck
                        ? { reading: '', gloss: line }
                        : splitDefinitionLine(line)
                      return (
                        <p className="anki-definition-line" key={index}>
                          {reading && <b>{reading} </b>}
                          {gloss}
                        </p>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <section className="flashcard-practice-done">
                <h2>{practice.random ? 'Random practice complete' : isDeck ? 'Deck complete' : "You're all caught up"}</h2>
                <p>
                  {practice.random
                    ? practice.seenIds.length === 0
                      ? 'No cards available to practice.'
                      : `You went through ${practice.seenIds.length} ${
                          practice.seenIds.length === 1 ? 'card' : 'cards'
                        }. Random practice doesn't change when cards are due.`
                    : practice.reviewed === 0
                      ? 'No cards are due right now.'
                      : `You reviewed ${practice.reviewed} ${
                          practice.reviewed === 1 ? 'card' : 'cards'
                        }.`}
                </p>
                {!practice.random && nextDueAt && (
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
                  {isDeck ? 'Back to decks' : 'Back to flashcards'}
                </button>
              </section>
            )}
          </div>
        </main>

        {card && (
          <div className="anki-bottom-bar">
            {!isDeck && (
              <button
                type="button"
                className="anki-edit-btn"
                onClick={() => setEditing({ ...card })}
              >
                Edit
              </button>
            )}

            {practiceMode === 'type' ? (
              practiceFlipped && <button type="button" className="anki-show-answer-btn"
                onClick={() => gradePractice(typedResult ? 'pass' : 'fail')}>Continue</button>
            ) : practiceFlipped ? (
              <div className="anki-grade-buttons">
                {PRACTICE_GRADES.map(({ grade, label, srsGrade }) => (
                  <div className="anki-grade-col" key={grade}>
                    <span className="anki-grade-interval">
                      {formatIntervalPreview(
                        reviewCard(card, srsGrade, new Date(), { desiredRetention })
                          .intervalDays
                      )}
                    </span>
                    <button
                      type="button"
                      className={`anki-grade-btn anki-grade-${grade}`}
                      onClick={() => gradePractice(grade)}
                    >
                      {label}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <button
                type="button"
                className="anki-show-answer-btn"
                onClick={() => setPracticeFlipped(true)}
              >
                Show Answer
              </button>
            )}

            <div className="anki-more-menu">
              <button
                type="button"
                className="anki-more-btn"
                onClick={() => setMoreMenuOpen((open) => !open)}
              >
                More ▾
              </button>
              {moreMenuOpen && (
                <>
                  <button
                    type="button"
                    className="anki-more-backdrop"
                    aria-label="Close menu"
                    onClick={() => setMoreMenuOpen(false)}
                  />
                  <div className="anki-more-dropdown">
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false)
                        openHotkeySettings()
                      }}
                    >
                      Hotkeys
                    </button>
                    <button type="button" onClick={exitPractice}>
                      Exit practice
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {editing && (
          <div className="anki-edit-backdrop">
            <form className="anki-edit-dialog" onSubmit={saveEdit}>
              <h2>Edit flashcard</h2>
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
              <div className="anki-edit-actions">
                <button type="button" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="submit">Save</button>
              </div>
            </form>
          </div>
        )}

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

  if (retentionOpen) {
    return (
      <div className="flashcards-page">
        <TopBar onHome={onBack}>
          <TopBarButton
            label="Back to flashcards"
            icon={<BackIcon />}
            onClick={() => setRetentionOpen(false)}
          />
        </TopBar>

        <main className="flashcards-content flashcards-settings-content">
          <div className="flashcards-page-header">
            <div>
              <p className="flashcards-eyebrow">Flashcards</p>
              <h1>Flashcard settings</h1>
              <p className="flashcards-sub">
                How you practice, and how often your cards come back for review.
              </p>
            </div>
          </div>

          <section className="flashcards-panel practice-settings" aria-labelledby="practice-settings-title">
            <div className="flashcards-panel-header">
              <h2 className="flashcards-panel-title" id="practice-settings-title">
                Practice
              </h2>
              <p className="setting-panel-note">For your own cards and premade decks</p>
            </div>
            <div className="setting-options">
              <ChoiceToggle
                title="Practice mode"
                description="Flip each card and grade yourself, or type the word's reading and have it checked."
                value={practiceMode}
                options={PRACTICE_MODES}
                onChange={setPracticeMode}
              />
              <ChoiceToggle
                title="Card order"
                description="Scheduled shows what's due first. Random drills cards in any order without changing when they're due."
                value={practiceOrder}
                options={PRACTICE_ORDERS}
                onChange={setPracticeOrder}
              />
            </div>
          </section>

          <RetentionSettings onChange={setDesiredRetention} />
        </main>
      </div>
    )
  }

  if (cardList) {
    const { kind, start, end } = cardList
    const { title, columns } = CARD_LISTS[kind]
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const today = stats?.heatmap.today ?? practiceDayKey(new Date(), timeZone)
    const loaded = kind !== 'reviewed' || cardList.reviews !== null
    const { rows, unlisted } =
      kind === 'reviewed'
        ? groupReviewsByCard(cardList.reviews ?? [], cards)
        : {
            rows: (kind === 'added'
              ? cardsAddedIn(cards, { start, end }, timeZone)
              : cardsDueIn(cards, { start, end }, today, timeZone)
            ).map((card) => ({ card })),
            unlisted: 0,
          }
    const dates =
      start === end ? formatDayKey(start) : `${formatDayKey(start)} – ${formatDayKey(end)}`

    return (
      <div className="flashcards-page">
        <TopBar onHome={onBack}>
          <TopBarButton
            label="Back to flashcards"
            icon={<BackIcon />}
            onClick={() => {
              setEditing(null)
              setCardList(null)
            }}
          />
        </TopBar>

        <main className="flashcards-content">
        <div className="flashcards-page-header">
          <div>
            <p className="flashcards-eyebrow">{title}</p>
            <h1>{dates}</h1>
          </div>
          {loaded && (
            <p className="flashcards-count">
              {rows.length} {rows.length === 1 ? 'card' : 'cards'}
            </p>
          )}
        </div>

        {(cardList.error || error) && (
          <p className="error-text">{cardList.error || error}</p>
        )}

        {unlisted > 0 && (
          <p className="flashcards-count">
            {unlisted} {unlisted === 1 ? 'review' : 'reviews'} of premade deck or
            deleted cards {unlisted === 1 ? "isn't" : "aren't"} listed.
          </p>
        )}

        {!loaded ? (
          !cardList.error && <p className="flashcards-empty">Loading reviews…</p>
        ) : rows.length === 0 ? (
          unlisted === 0 && <p className="flashcards-empty">No cards here.</p>
        ) : (
          <div className="flashcards-table flashcards-list-table">
            <div className="flashcards-table-header">
              <span>Japanese</span>
              <span>Reading</span>
              <span>Definition</span>
              {columns.map(({ label, hint }) => (
                <span key={label} title={hint}>
                  {label}
                </span>
              ))}
              <span>Actions</span>
            </div>

            <div className="flashcards-table-scroll">
              {rows.map((row) => (
                <div className="flashcards-row" key={row.card.id} style={{ height: rowHeight }}>
                  <span className="flashcards-cell flashcards-cell-word">
                    <span lang="ja" title={row.card.japanese}>
                      {row.card.japanese}
                    </span>
                  </span>
                  <span className="flashcards-cell" lang="ja" title={row.card.reading}>
                    {row.card.reading}
                  </span>
                  <span
                    className="flashcards-cell flashcards-cell-definition"
                    title={row.card.definition}
                  >
                    {row.card.definition.replace(/\n/g, ' ')}
                  </span>
                  {columns.map(({ label, number, render }) => (
                    <span
                      key={label}
                      className={`flashcards-cell ${number ? 'flashcards-cell-number' : 'flashcards-cell-due'}`}
                    >
                      {render(row)}
                    </span>
                  ))}
                  <span className="flashcards-cell flashcards-row-actions">
                    <button
                      className="flashcard-edit-btn"
                      aria-label={`Edit ${row.card.japanese}`}
                      title="Edit"
                      onClick={() => setEditing({ ...row.card })}
                    >
                      <EditIcon />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        </main>

        {editing && (
          <RowEditDialog
            editing={editing}
            editField={editField}
            onSave={saveEdit}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>
    )
  }

  if (browsing) {
    const visibleCards = browseCards.slice(rowStart, rowEnd)

    return (
      <div className="flashcards-page">
        <TopBar onHome={onBack}>
          <TopBarButton
            label="Back to flashcards"
            icon={<BackIcon />}
            onClick={() => {
              setEditing(null)
              setSearch('')
              setBrowsing(false)
            }}
          />
        </TopBar>

        <main className="flashcards-content">
        <div className="flashcards-page-header">
          <div>
            <p className="flashcards-eyebrow">Your collection</p>
            <h1>Browse cards</h1>
          </div>
          <p className="flashcards-count">
            {browseCards.length === cards.length
              ? `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`
              : `${browseCards.length} of ${cards.length} cards`}
          </p>
        </div>

        {cards.length > 0 && (
          <div className="flashcards-search-wrap">
            <SearchIcon />
            <input
              type="search"
              className="flashcards-search"
              placeholder="Search by word, reading, or definition"
              aria-label="Search cards by word, reading, or definition"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0
              }}
            />
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        {cards.length === 0 ? (
          <p>No flashcards saved yet. Save a word from its definition popup!</p>
        ) : browseCards.length === 0 ? (
          <p className="flashcards-empty">No cards match “{search.trim()}”.</p>
        ) : (
          <div className="flashcards-table">
            <div className="flashcards-table-header">
              <span>Japanese</span>
              <span>Reading</span>
              <span>Definition</span>
              <span title="How common the word is: its rank in the JPDB frequency list, lower is more common">
                Freq
              </span>
              <span>Due</span>
              <span title="Times reviewed">Reviews</span>
              <span title="Share of reviews not failed">Pass</span>
              <span title="Average answer time">Avg time</span>
              <span>Actions</span>
            </div>

            <div className="flashcards-table-scroll" ref={tableScrollRef}>
              <div
                className="flashcards-table-spacer"
                style={{ height: browseCards.length * rowHeight }}
              >
                <div
                  className="flashcards-table-body"
                  style={{ transform: `translateY(${rowStart * rowHeight}px)` }}
                >
                  {visibleCards.map((card) => (
                    <div
                      className="flashcards-row"
                      key={card.id}
                      style={{ height: rowHeight }}
                    >
                      <span className="flashcards-cell flashcards-cell-word">
                        <span lang="ja" title={card.japanese}>
                          {card.japanese}
                        </span>
                        {card.stats?.leech && (
                          <button
                            type="button"
                            className="flashcard-leech-badge"
                            title="Failed 8 or more times. Try rewording it or adding an example."
                            onClick={() => setEditing({ ...card })}
                          >
                            Leech
                          </button>
                        )}
                      </span>
                      <span
                        className="flashcards-cell"
                        lang="ja"
                        title={card.reading}
                      >
                        {card.reading}
                      </span>
                      <span
                        className="flashcards-cell flashcards-cell-definition"
                        title={card.definition}
                      >
                        {card.definition.replace(/\n/g, ' ')}
                      </span>
                      <span className="flashcards-cell flashcards-cell-number">
                        {card.frequency ?? '—'}
                      </span>
                      <span className="flashcards-cell flashcards-cell-due">
                        {formatDueAt(new Date(card.dueAt))}
                      </span>
                      <span className="flashcards-cell flashcards-cell-number">
                        {card.stats?.reviews ?? 0}
                      </span>
                      <span className="flashcards-cell flashcards-cell-number">
                        {formatPercent(card.stats?.passRate ?? null)}
                      </span>
                      <span className="flashcards-cell flashcards-cell-number">
                        {card.stats?.averageTimeMs == null
                          ? '—'
                          : formatDuration(card.stats.averageTimeMs)}
                      </span>
                      <span className="flashcards-cell flashcards-row-actions">
                        <button
                          className="flashcard-edit-btn"
                          aria-label={`Edit ${card.japanese}`}
                          title="Edit"
                          onClick={() => setEditing({ ...card })}
                        >
                          <EditIcon />
                        </button>
                        <button
                          className="flashcard-remove"
                          aria-label={`Remove ${card.japanese}`}
                          title="Remove"
                          onClick={() => removeCard(card.id)}
                        >
                          <TrashIcon />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        </main>

        {editing && (
          <RowEditDialog
            editing={editing}
            editField={editField}
            onSave={saveEdit}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="flashcards-page">
      <TopBar onHome={onBack}>
        <TopBarButton
          label="Flashcard settings"
          icon={<SettingsIcon />}
          onClick={() => setRetentionOpen(true)}
        />
        {onBack && (
          <TopBarButton label="Back to bookshelf" icon={<BackIcon />} onClick={onBack} />
        )}
      </TopBar>

      <main className="flashcards-content">
      <div className="flashcards-page-header flashcards-hero">
        <div>
          <p className="flashcards-eyebrow">Study</p>
          <h1>
            Your <em>flashcards</em>
          </h1>
          <p className="flashcards-sub">
            {tab === 'decks'
              ? 'Practice ready-made decks of common words.'
              : loading || cards.length === 0
                ? 'Save words while you read, then review them here.'
                : `${cards.length.toLocaleString()} ${cards.length === 1 ? 'card' : 'cards'} in your collection` +
                  (stats ? ` · ${stats.due.today} due today` : '')}
          </p>
        </div>
        {tab === 'mine' && cards.length > 0 && (
          <div className="flashcards-header-actions">
            <button
              className="flashcard-browse-start"
              onClick={() => setBrowsing(true)}
            >
              <TableIcon />
              Browse
            </button>
            <button className="flashcard-practice-start" onClick={startPractice}>
              <PlayIcon />
              Practice
            </button>
          </div>
        )}
      </div>

      <div className="flashcards-toolbar">
        <div className="flashcards-tabs" role="tablist">
          <button
            className="flashcards-tab"
            role="tab"
            aria-selected={tab === 'mine'}
            onClick={() => setTab('mine')}
          >
            My Flashcards
          </button>
          <button
            className="flashcards-tab"
            role="tab"
            aria-selected={tab === 'decks'}
            onClick={() => setTab('decks')}
          >
            Decks
          </button>
        </div>
      </div>

      {tab === 'decks' ? (
        <PremadeDecks onStudy={studyDeck} />
      ) : (
        <>
          {error && <p className="error-text">{error}</p>}

          {loading ? (
            <p className="flashcards-empty">Loading flashcards…</p>
          ) : cards.length === 0 ? (
            !error && (
              <p className="flashcards-empty">No flashcards saved yet. Save a word from its definition popup!</p>
            )
          ) : (
            stats && <PracticeStats stats={stats} onOpenCards={openCardList} />
          )}
        </>
      )}
      </main>
    </div>
  )
}
