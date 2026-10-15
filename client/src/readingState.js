const key = (bookId) => `yomu-reading:${bookId}`

export function loadReadingState(bookId) {
  try {
    const saved = JSON.parse(localStorage.getItem(key(bookId)))
    return {
      position: validPosition(saved?.position) ? saved.position : null,
      bookmarks: Array.isArray(saved?.bookmarks)
        ? saved.bookmarks.filter((item) => typeof item?.id === 'string' && validPosition(item.position))
        : [],
    }
  } catch {
    return { position: null, bookmarks: [] }
  }
}

function validPosition(position) {
  return position && Number.isFinite(position.progress) && position.progress >= 0 && position.progress <= 1
}

// Return failure so the reader can explain when browser storage is unavailable.
export function saveReadingState(bookId, state) {
  try {
    localStorage.setItem(key(bookId), JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function removeReadingState(bookId) {
  try { localStorage.removeItem(key(bookId)) } catch { /* Book deletion still works. */ }
}

export function readingProgress(clip, vertical) {
  const max = vertical ? clip.scrollWidth - clip.clientWidth : clip.scrollHeight - clip.clientHeight
  if (max <= 0) return 0
  return Math.min(1, Math.max(0, vertical ? 1 - clip.scrollLeft / max : clip.scrollTop / max))
}

// DOM paths identify the same character after font, viewport, or writing-mode
// changes. A scroll fraction is kept as a fallback for image-only passages.
export function capturePosition(iframe, clip, vertical) {
  const doc = iframe?.contentDocument
  if (!doc?.body || !clip) return null
  const position = { progress: readingProgress(clip, vertical) }
  const frame = iframe.getBoundingClientRect()
  const viewport = clip.getBoundingClientRect()
  for (const across of [12, 30, 60, 100, 160]) {
    for (const along of [40, 70, 110, 180]) {
      const x = (vertical ? viewport.left + clip.clientWidth - across : viewport.left + along) - frame.left
      const y = (vertical ? viewport.top + along : viewport.top + across) - frame.top
      if (x < 0 || y < 0 || x > frame.width || y > frame.height) continue
      const caret = doc.caretPositionFromPoint?.(x, y)
      const range = !caret && doc.caretRangeFromPoint?.(x, y)
      const node = caret?.offsetNode ?? range?.startContainer
      const offset = caret?.offset ?? range?.startOffset
      if (node?.nodeType !== 3 || !node.textContent.trim() || node.parentElement.closest('rt,rp,script,style')) continue
      const char = Math.min(offset, node.length - 1)
      const rect = characterRect(doc, node, char)
      // Caret APIs may return the nearest text even when the point is in a margin.
      if (!rect || rect.right < viewport.left - frame.left || rect.left > viewport.left + clip.clientWidth - frame.left ||
          rect.bottom < viewport.top - frame.top || rect.top > viewport.top + clip.clientHeight - frame.top) continue
      const path = []
      let current = node
      while (current !== doc.body) {
        const parent = current.parentNode
        if (!parent) return position
        path.unshift(Array.prototype.indexOf.call(parent.childNodes, current))
        current = parent
      }
      return { ...position, path, offset: char,
        inset: vertical ? viewport.left + clip.clientWidth - frame.left - rect.right : frame.top + rect.top - viewport.top,
        vertical,
        excerpt: node.parentElement.textContent.replace(/\s+/g, ' ').trim().slice(0, 100),
      }
    }
  }
  return position
}

function characterRect(doc, node, offset) {
  const range = doc.createRange()
  range.setStart(node, offset)
  range.setEnd(node, Math.min(offset + 1, node.length))
  return range.getClientRects()[0]
}

export function restorePosition(iframe, clip, vertical, position) {
  if (!position || !clip) return
  const doc = iframe?.contentDocument
  let node = doc?.body
  if (Array.isArray(position.path)) {
    for (const index of position.path) node = node?.childNodes[index]
    if (node?.nodeType === 3 && Number.isInteger(position.offset) && position.offset >= 0 && position.offset < node.length) {
      const rect = characterRect(doc, node, position.offset)
      if (rect) {
        const inset = position.vertical === vertical && Number.isFinite(position.inset) ? Math.max(0, position.inset) : 12
        if (vertical) clip.scrollLeft = rect.right - clip.clientWidth + Math.min(inset, clip.clientWidth / 2)
        else clip.scrollTop = rect.top - Math.min(inset, clip.clientHeight / 2)
        return
      }
    }
  }
  if (vertical) clip.scrollLeft = (1 - position.progress) * (clip.scrollWidth - clip.clientWidth)
  else clip.scrollTop = position.progress * (clip.scrollHeight - clip.clientHeight)
}
