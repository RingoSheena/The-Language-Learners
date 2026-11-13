import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cardsAddedIn, cardsDueIn, formatDayKey } from '../activityCharts.js'
import { matchesTerms, queryTerms, searchableText } from '../cardSearch.js'
import { isKanaOnly } from '../kana.js'
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
  RECENT_BUFFER_SIZE,
  reviewCard,
} from '../../../shared/srs.js'
import ActivityCharts from './ActivityCharts.jsx'
import PremadeDecks from './PremadeDecks.jsx'
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
    },
    { label: 'Reviewed today', value: stats.today.reviews },
    { label: 'Time today', value: formatDuration(stats.today.timeMs) },
    {
      label: 'Daily average (7 days)',
      value: Math.round(stats.week.averagePerDay * 10) / 10,
    },
    {
      label: 'Retention (30 days)',
      value: formatPercent(stats.retention.rate),
      note:
        stats.retention.rate === null
          ? 'No mature cards reviewed yet'
          : 'Mature cards not failed',
    },
    { label: 'Due today', value: stats.due.today },
    { label: 'Due tomorrow', value: stats.due.tomorrow },
    { label: 'Due this week', value: stats.due.week },
  ]

  return (
    <section className="flashcard-stats-panel" aria-label="Practice stats">
      <dl className="flashcard-stats">
        {items.map(({ label, value, note }) => (
          <div className="flashcard-stat" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
            {note && <dd className="flashcard-stat-note">{note}</dd>}
          </div>
        ))}
      </dl>

      <ul className="flashcard-stages">
        {CARD_STAGES.map(({ stage, label, hint }) => (
          <li key={stage} title={hint}>
            <span className={`flashcard-stage-dot flashcard-stage-${stage}`} />
            {label} <strong>{stats.cards[stage]}</strong>
          </li>
        ))}
      </ul>

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

  return (
    <figure className="review-heatmap">
      <figcaption>
        {total} {total === 1 ? 'review' : 'reviews'} in the past year
      </figcaption>
      <div className="review-heatmap-scroll">
        <div
          className="review-heatmap-grid"
          role="group"
          aria-label={`Reviews per day over the past year: ${total} in total`}
        >
          {keys.map((key) => {
            const count = days[key] ?? 0
            const level = count === 0 ? 0 : Math.ceil((count / busiest) * 4)
            const className = `review-heatmap-day review-heatmap-level-${level}`
            const label = `${formatDayKey(key)}: ${count} ${count === 1 ? 'review' : 'reviews'}`
            return count === 0 ? (
              <span key={key} className={className} title={label} />
            ) : (
              <button
                key={key}
                type="button"
                className={className}
                title={label}
                aria-label={`${label}. Show that day's cards`}
                onClick={() => onSelectDay(key)}
              />
            )
          })}
        </div>
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

const ROW_HEIGHT = 36
const ROW_OVERSCAN = 10

// Renders only the rows near the visible scroll area, so a list of
// thousands of flashcards stays as a few dozen real DOM rows. `active`
// re-attaches to the container when the page showing it opens.
function useVirtualRows(containerRef, itemCount, active) {
  const [range, setRange] = useState({ start: 0, end: Math.min(itemCount, 50) })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function updateRange() {
      const start = Math.max(
        0,
        Math.floor(el.scrollTop / ROW_HEIGHT) - ROW_OVERSCAN
      )
      const visibleRows = Math.ceil(el.clientHeight / ROW_HEIGHT) + ROW_OVERSCAN * 2
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
  }, [containerRef, itemCount, active])

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
  const [practiceFlipped, setPracticeFlipped] = useState(false)
  const [practiceHotkeys, setPracticeHotkeys] = useState(loadPracticeHotkeys)
  const [hotkeySettingsOpen, setHotkeySettingsOpen] = useState(false)
  const [hotkeyDraft, setHotkeyDraft] = useState(DEFAULT_PRACTICE_HOTKEYS)
  const [hotkeyError, setHotkeyError] = useState('')
  const [practiceSaveError, setPracticeSaveError] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  // The Browse page: the full card table, for editing and removing cards
  const [browsing, setBrowsing] = useState(false)
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
  const { start: rowStart, end: rowEnd } = useVirtualRows(
    tableScrollRef,
    browseCards.length,
    browsing
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
    setPractice({
      currentId: pickNextCard(cards, { now })?.id ?? null,
      recentIds: [],
      reviewed: 0,
      dueCount: countDue(cards, now),
      ahead: false,
      deckCards: null,
    })
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

    setPractice({
      currentId: pickNextCard(deckCards, { now })?.id ?? null,
      recentIds: [],
      reviewed: 0,
      dueCount: countDue(deckCards, now),
      ahead: false,
      deckCards,
    })
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
    setPracticeFlipped(false)
  }

  // `grade` is a practice button: 'fail' or 'pass'
  const gradePractice = useCallback(
    (grade) => {
      const isDeck = Boolean(practice?.deckCards)
      const list = practice?.deckCards ?? cards
      const card = list.find((candidate) => candidate.id === practice?.currentId)
      if (!card) return

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
        reviewed: practice.reviewed + 1,
        dueCount: countDue(nextCards, now),
        ahead: practice.ahead,
        deckCards: isDeck ? nextCards : null,
      })
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
      // instead of it also flipping or passing the card.
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
    practiceHotkeys,
  ])

  if (practice !== null) {
    const isDeck = Boolean(practice.deckCards)
    const list = practice.deckCards ?? cards
    const card = list.find((candidate) => candidate.id === practice.currentId)
    // Premade deck schedules aren't saved, so don't show a "next due" time.
    const nextDueAt = isDeck ? null : earliestDueAt(cards)
    const canPracticeAhead =
      !card &&
      pickNextCard(list, {
        recentIds: practice.recentIds,
        includeNotDue: true,
      }) !== null

    const definitionLines = card
      ? card.definition.split('\n').filter(Boolean)
      : []

    return (
      <div className="flashcards-practice-page anki-theme">
        <div className="anki-counter">
          <span>{practice.ahead ? '∞' : practice.dueCount}</span>
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
                </div>

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
                <h2>{isDeck ? 'Deck complete' : "You're all caught up"}</h2>
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

            {practiceFlipped ? (
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
        <button
          className="flashcards-back-btn"
          onClick={() => {
            setEditing(null)
            setCardList(null)
          }}
        >
          ← Back to Flashcards
        </button>

        <div className="flashcards-page-header">
          <h1>
            {title} {dates}
          </h1>
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
                <div className="flashcards-row" key={row.card.id} style={{ height: ROW_HEIGHT }}>
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
                      onClick={() => setEditing({ ...row.card })}
                    >
                      Edit
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

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
        <button
          className="flashcards-back-btn"
          onClick={() => {
            setEditing(null)
            setSearch('')
            setBrowsing(false)
          }}
        >
          ← Back to Flashcards
        </button>

        <div className="flashcards-page-header">
          <h1>Browse</h1>
          <p className="flashcards-count">
            {browseCards.length === cards.length
              ? `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`
              : `${browseCards.length} of ${cards.length} cards`}
          </p>
        </div>

        {cards.length > 0 && (
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
                style={{ height: browseCards.length * ROW_HEIGHT }}
              >
                <div
                  className="flashcards-table-body"
                  style={{ transform: `translateY(${rowStart * ROW_HEIGHT}px)` }}
                >
                  {visibleCards.map((card) => (
                    <div
                      className="flashcards-row"
                      key={card.id}
                      style={{ height: ROW_HEIGHT }}
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
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

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
      {onBack && (
        <button className="flashcards-back-btn" onClick={onBack}>
          ← Back to Bookshelf
        </button>
      )}

      <div className="flashcards-page-header">
        <h1>Flashcards</h1>
        {tab === 'mine' && cards.length > 0 && (
          <div className="flashcards-header-actions">
            <button
              className="flashcard-browse-start"
              onClick={() => setBrowsing(true)}
            >
              Browse
            </button>
            <button className="flashcard-practice-start" onClick={startPractice}>
              Practice
            </button>
          </div>
        )}
      </div>

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

      {tab === 'decks' ? (
        <PremadeDecks onStudy={studyDeck} />
      ) : (
        <>
          {error && <p className="error-text">{error}</p>}

          {loading ? (
            <p className="flashcards-empty">Loading flashcards…</p>
          ) : cards.length === 0 ? (
            !error && (
              <p>No flashcards saved yet. Save a word from its definition popup!</p>
            )
          ) : (
            <>
              <p className="flashcards-count">
                {cards.length} {cards.length === 1 ? 'card' : 'cards'}
              </p>
              {stats && <PracticeStats stats={stats} onOpenCards={openCardList} />}
            </>
          )}
        </>
      )}
    </div>
  )
}
