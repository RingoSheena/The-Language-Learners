import { useEffect, useRef, useState } from 'react'
import { capturePosition, loadReadingState, restorePosition, saveReadingState } from '../readingState.js'

export default function useReadingState(bookId, iframeRef, clipRef) {
  const [state, setState] = useState(() => loadReadingState(bookId))
  const [storageError, setStorageError] = useState('')
  const stateRef = useRef(state)
  const ready = useRef(false)
  const vertical = useRef(true)
  const timer = useRef(null)
  const flushRef = useRef(null)

  function write(next) {
    stateRef.current = next
    setState(next)
    setStorageError(saveReadingState(bookId, next) ? '' : 'Reading progress and bookmarks could not be saved. Check your browser storage.')
  }

  function flush() {
    clearTimeout(timer.current)
    if (!ready.current) return
    const position = capturePosition(iframeRef.current, clipRef.current, vertical.current)
    if (position) write({ ...stateRef.current, position })
  }
  useEffect(() => { flushRef.current = flush })

  useEffect(() => {
    const save = () => flushRef.current()
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

  function addBookmark() {
    if (!ready.current) return
    const position = capturePosition(iframeRef.current, clipRef.current, vertical.current)
    if (!position) return
    const duplicate = stateRef.current.bookmarks.some((item) =>
      JSON.stringify(item.position.path) === JSON.stringify(position.path) &&
      item.position.offset === position.offset && Math.abs(item.position.progress - position.progress) < 0.001)
    if (duplicate) return
    write({ ...stateRef.current, position, bookmarks: [...stateRef.current.bookmarks, {
      id: crypto.randomUUID(), position,
      label: position.excerpt || `Bookmark at ${Math.round(position.progress * 100)}%`,
      createdAt: Date.now(),
    }] })
  }

  return {
    state, storageError, beforeLayout, afterLayout, flush, addBookmark,
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
    removeBookmark(id) {
      write({ ...stateRef.current, bookmarks: stateRef.current.bookmarks.filter((item) => item.id !== id) })
    },
  }
}
