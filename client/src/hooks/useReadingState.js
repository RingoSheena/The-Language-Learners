import { useEffect, useRef, useState } from 'react'
import { createBookmark, deleteBookmark, saveReadingPosition } from '../lib/booksApi.js'
import { capturePosition, restorePosition } from '../readingState.js'

// Scrolling captures a position every 250ms; send at most one every few
// seconds, plus a final one when the reader closes or the page hides.
const SAVE_INTERVAL_MS = 3000

const SAVE_ERROR = 'Your reading progress could not be saved to your account. Check your connection.'

// initialState is { position, bookmarks } as loaded by loadReadingState()
// in booksApi.js before the reader opened.
export default function useReadingState(bookId, initialState, iframeRef, clipRef) {
  const [state, setState] = useState(initialState)
  const [syncError, setSyncError] = useState('')
  const stateRef = useRef(state)
  const ready = useRef(false)
  const vertical = useRef(true)
  const timer = useRef(null)
  const saveTimer = useRef(null)
  const unsaved = useRef(null)
  const lastSent = useRef(JSON.stringify(initialState.position))
  const flushRef = useRef(null)

  function update(next) {
    stateRef.current = next
    setState(next)
  }

  function sendUnsaved(keepalive = false) {
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    const position = unsaved.current
    unsaved.current = null
    if (!position) return
    const json = JSON.stringify(position)
    if (json === lastSent.current) return
    lastSent.current = json
    saveReadingPosition(bookId, position, { keepalive })
      .then(() => setSyncError(''))
      .catch((error) => {
        console.error('Failed to save reading position:', error)
        lastSent.current = null
        setSyncError(SAVE_ERROR)
      })
  }

  function savePosition(position, now) {
    unsaved.current = position
    if (now) sendUnsaved(true)
    else saveTimer.current ??= setTimeout(() => sendUnsaved(), SAVE_INTERVAL_MS)
  }

  // Captures the current position and returns it. `now` sends it right away
  // instead of waiting for the next batched save.
  function flush({ now = false } = {}) {
    clearTimeout(timer.current)
    if (ready.current) {
      const position = capturePosition(iframeRef.current, clipRef.current, vertical.current)
      if (position) {
        update({ ...stateRef.current, position })
        savePosition(position, now)
      }
    }
    if (now) sendUnsaved(true)
    return stateRef.current.position
  }
  useEffect(() => { flushRef.current = flush })

  useEffect(() => {
    const save = () => flushRef.current({ now: true })
    const onVisibility = () => { if (document.visibilityState === 'hidden') save() }
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      save()
      clearTimeout(timer.current)
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  function beforeLayout() {
    const position = ready.current
      ? capturePosition(iframeRef.current, clipRef.current, vertical.current)
      : stateRef.current.position
    ready.current = false
    clearTimeout(timer.current)
    return position
  }

  function afterLayout(position, isVertical) {
    vertical.current = isVertical
    restorePosition(iframeRef.current, clipRef.current, isVertical, position)
    ready.current = true
    flush()
  }

  async function addBookmark() {
    if (!ready.current) return
    const position = capturePosition(iframeRef.current, clipRef.current, vertical.current)
    if (!position) return
    const duplicate = stateRef.current.bookmarks.some((item) =>
      JSON.stringify(item.position.path) === JSON.stringify(position.path) &&
      item.position.offset === position.offset && Math.abs(item.position.progress - position.progress) < 0.001)
    if (duplicate) return
    update({ ...stateRef.current, position })
    savePosition(position)
    try {
      const bookmark = await createBookmark(bookId, {
        label: position.excerpt || `Bookmark at ${Math.round(position.progress * 100)}%`,
        position,
      })
      update({ ...stateRef.current, bookmarks: [...stateRef.current.bookmarks, bookmark] })
      setSyncError('')
    } catch (error) {
      console.error('Failed to save bookmark:', error)
      setSyncError('The bookmark could not be saved. Check your connection.')
    }
  }

  return {
    state, syncError, beforeLayout, afterLayout, flush, addBookmark,
    onScroll() {
      if (!ready.current) return
      clearTimeout(timer.current)
      timer.current = setTimeout(() => flushRef.current(), 250)
    },
    jumpToBookmark(bookmark) {
      if (!ready.current) return
      restorePosition(iframeRef.current, clipRef.current, vertical.current, bookmark.position)
      flush()
    },
    async removeBookmark(id) {
      try {
        await deleteBookmark(bookId, id)
        update({ ...stateRef.current, bookmarks: stateRef.current.bookmarks.filter((item) => item.id !== id) })
        setSyncError('')
      } catch (error) {
        console.error('Failed to remove bookmark:', error)
        setSyncError('The bookmark could not be removed. Check your connection.')
      }
    },
  }
}
