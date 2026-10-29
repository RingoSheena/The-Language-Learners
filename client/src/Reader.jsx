import { useEffect, useRef, useState } from 'react'
import TopBar from './TopBar.jsx'
import ReadingSettingsPanel from './ReadingSettingsPanel.jsx'
import { loadPreferences, savePreferences } from './readingPreferences.js'
import { flattenBook } from './epubFlatten.js'
import { useJapaneseHover, useDefinitionHotkey } from './hooks/useJapaneseHover.js' // NEW
import DefinitionPopup from './components/DefinitionPopup.jsx' // NEW
import './Reader.css'
import useReadingState from './hooks/useReadingState.js'

// No pagination at all: the browser's own text layout wraps everything
// naturally, and the reader just scrolls through the result. That's the
// whole point -- every prior bug here (furigana split mid-column, tight
// line-height defeating the break logic, hangs) came from custom JS
// fighting the browser's own layout to fake "pages"; removing that
// entirely removes the bugs with it, not just this session's specific
// ones.
//
// Vertical (Japanese) writing flows top-to-bottom within a column and
// stacks new columns right-to-left, so it's bounded on *height* (that's
// what makes it wrap into a new column) and left to grow naturally wide
// -- the reader scrolls that horizontally, starting at the right (where
// the book begins) and moving left. Horizontal writing is bounded on
// *width* and grows tall, scrolled vertically top-to-bottom like an
// ordinary page.
function buildDynamicStyle(preferences) {
  const isVertical = preferences.orientation === 'vertical'
  const writingMode = isVertical ? 'vertical-rl' : 'horizontal-tb'

  // The iframe's own top-level document gets a native scrollbar of its
  // own -- completely separate from #viewer-clip's -- the instant its
  // content overflows its viewport, even with no explicit `overflow`
  // declaration at all: that's just default browser behavior for a
  // document's root scrolling element, in an iframe exactly as on a top-
  // level page. relayout sizes the iframe to fit its content exactly on
  // the axis that's supposed to grow freely, but the *other* axis is
  // deliberately bounded (that's what makes vertical-rl wrap into new
  // columns / horizontal-tb wrap into new lines in the first place) --
  // and real content can render a hair taller/wider than that bound
  // (padding/box-sizing rounding), which is enough to trigger the
  // iframe's own scrollbar on top of #viewer-clip's, and it was that
  // inner one showing up as vertical scroll in vertical mode. Hiding
  // overflow on the bounded axis inside the iframe itself is what makes
  // #viewer-clip the *only* thing that ever scrolls.
  const boundedAxisOverflow = isVertical ? 'overflow-y: hidden;' : 'overflow-x: hidden;'

  return `
    html, body { margin: 0; background: ${preferences.backgroundColor}; height: 100%; ${boundedAxisOverflow} }
    body {
      color: ${preferences.textColor};
      font-size: ${preferences.fontSize}pt;
      letter-spacing: ${preferences.letterSpacing}px;
      line-height: ${preferences.lineSpacing};
      writing-mode: ${writingMode};
      direction: ltr;
      box-sizing: border-box;
      padding: 32px 0;
    }
    img { max-width: 100%; max-height: 100%; }
    /* NEW: hover highlight for the word under the cursor (see useJapaneseHover) */
    ::highlight(jp-token) { background: #ffe066; color: #000; }
    /* If the book's own CSS resets display on ruby/rt/rb (a common old-
       browser-compat pattern some EPUB stylesheets carry, e.g. treating
       them as plain inline elements for engines that don't understand
       ruby), the browser's native ruby box model breaks entirely -- <rt>
       stops being laid out as an annotation tied to its base and just
       flows as ordinary inline content, landing whatever normal line-
       wrapping produces instead. That's a real, uncontrolled gap no
       margin/padding/writing-mode override on top of it can fix, since the
       box type itself is already wrong. Forcing the ruby display types
       back explicitly guarantees native ruby layout regardless of what the
       book's CSS did to them. */
    ruby { display: ruby !important; }
    rt { display: ruby-text !important; }
    /* letter-spacing is inherited onto <rt> too, but furigana is tiny and
       usually has more characters than the base text it annotates -- the
       same spacing tuned for the main reading font stretches it out much
       further than its base, pushing it visibly away from the text it's
       supposed to sit right against. Furigana should stay tight regardless
       of the reader's own character-spacing preference. ruby-align:center
       makes sure it's centered over its base the same way in every
       browser, rather than relying on a default that isn't fully
       consistent across them. !important on all of these because this
       rule has to win over whatever the book's own CSS says -- epubFlatten
       copies each chapter's own <style> content into this same document,
       ahead of this one in source order, and if it happens to carry any
       rule that's more *specific* than these plain type selectors (a
       class or ID on a ruby/rt, say), specificity beats source order and
       the book's rule would otherwise win regardless of which one loads
       second. */
    rt { letter-spacing: normal !important; }
    ruby { ruby-align: center !important; }
    ${
      isVertical
        ? // Firefox doesn't reliably rotate <rt> to match vertical-rl on
          // its own -- it can render furigana sideways, sitting above its
          // base with a visible gap instead of running tight alongside it
          // (Chromium gets this right without any help, so this is a
          // Firefox-specific gap, not a mistaken assumption about ruby
          // layout in general). Setting writing-mode and text-orientation
          // on <rt> explicitly, rather than relying on it inheriting the
          // right behavior from vertical-rl body text, is what makes
          // Firefox rotate it too; confirmed to change nothing in
          // Chromium, which already renders this correctly either way.
          'rt { writing-mode: vertical-rl !important; text-orientation: upright !important; }'
        : ''
    }
  `
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// #viewer-clip's scrollbar is the *only* one left visible (see
// buildDynamicStyle's note on hiding the iframe's own) -- styling it to
// match the reader's own background, rather than leaving it as a stock
// system scrollbar, keeps it from standing out against a dark background
// or a colored one. The thumb uses a translucent version of the reader's
// own text color so it stays visible (and readable as "this is the thing
// you drag") without needing a second color preference of its own.
// scrollbar-color is the standard property (Firefox, and Chromium/Safari
// in recent versions); the ::-webkit-scrollbar-* rules cover older
// Chromium/Safari, which don't support scrollbar-color at all -- neither
// can be set via inline style (scrollbar-color can, but the pseudo-
// elements can't), so both live in one dynamically-updated <style> tag in
// the outer document instead.
function buildScrollbarStyle(preferences) {
  const thumb = hexToRgba(preferences.textColor, 0.35)
  const track = preferences.backgroundColor
  return `
    #viewer-clip { scrollbar-color: ${thumb} ${track}; }
    #viewer-clip::-webkit-scrollbar { width: 12px; height: 12px; }
    #viewer-clip::-webkit-scrollbar-track { background: ${track}; }
    #viewer-clip::-webkit-scrollbar-thumb { background: ${thumb}; border-radius: 6px; }
  `
}

// The book content lives in an iframe, so once the reader is clicked into
// (a very natural thing to do while reading) focus moves inside it and
// keydown events never reach a plain window-level listener in the parent
// document. Building the handler once here lets it be attached to both the
// outer window and the iframe's own contentWindow after it loads.
function createPageTurnHandler(clipRef, isSettingsOpenRef) {
  return function handleScrollKey(event) {
    const target = event.target
    const isFormField =
      target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)

    if (isSettingsOpenRef.current || isFormField) {
      return
    }

    const clip = clipRef.current
    if (!clip) {
      return
    }

    // Scroll roughly one screenful per press, like a page-down gesture --
    // native scrolling (wheel, trackpad, drag, scrollbar) already handles
    // everything finer-grained than this. Whichever axis actually has
    // room to scroll tells us which orientation is active, rather than
    // needing that passed in separately.
    if (clip.scrollWidth > clip.clientWidth && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      clip.scrollBy({ left: event.key === 'ArrowLeft' ? -clip.clientWidth : clip.clientWidth, behavior: 'smooth' })
    } else if (clip.scrollHeight > clip.clientHeight && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      clip.scrollBy({ top: event.key === 'ArrowDown' ? clip.clientHeight : -clip.clientHeight, behavior: 'smooth' })
    }
  }
}

// Applies current preferences and sizes the iframe to fit the book's full,
// naturally-wrapped content so the clip element can reveal all of it via
// scrolling. Margins are real empty space *outside* the clip element (see
// Reader.css) rather than padding on the scrolling element itself, so they
// stay put as fixed gutters instead of scrolling away with the content.
// `outer` is measured for the space available; `clip` is the scrollable
// viewport window onto the iframe's full-sized content.
function relayout(iframe, outer, clip, preferences) {
  const doc = iframe?.contentDocument
  if (!doc?.body || !outer || !clip) {
    return
  }

  const isVertical = preferences.orientation === 'vertical'

  // Match the margin gutters to the book's own background so they read as
  // part of the page (text simply inset from the edges) instead of a
  // mismatched frame around a separate, smaller box.
  outer.style.backgroundColor = preferences.backgroundColor

  // Lives in the outer document (not the iframe's), so it's looked up
  // directly rather than threaded through as another ref/parameter.
  const scrollbarStyleEl = document.getElementById('yomu-scrollbar-style')
  if (scrollbarStyleEl) {
    scrollbarStyleEl.textContent = buildScrollbarStyle(preferences)
  }

  const margin = preferences.pageMargin
  const availableWidth = Math.max(outer.clientWidth - margin * 2, 50)
  const availableHeight = outer.clientHeight

  // A generic overflow:auto on both axes invites a feedback loop: once
  // the *intended* scrollbar (say, horizontal, in vertical mode) appears,
  // it physically occupies space at clip's own edge, shrinking its
  // clientHeight by the scrollbar's thickness -- but the iframe was
  // already sized to the pre-scrollbar height, so it now overhangs that
  // shrunk clientHeight by a few px, which is enough for overflow:auto to
  // decide the *other* axis needs a scrollbar too, even though nothing
  // there genuinely needs to scroll. Restricting which axis is even
  // allowed to scroll, based on orientation, closes the loop.
  clip.style.overflowX = isVertical ? 'auto' : 'hidden'
  clip.style.overflowY = isVertical ? 'hidden' : 'auto'

  clip.style.width = `${availableWidth}px`
  clip.style.height = `${availableHeight}px`

  iframe.style.width = `${availableWidth}px`
  iframe.style.height = `${availableHeight}px`

  const styleEl = doc.getElementById('yomu-dynamic-style')
  if (styleEl) {
    styleEl.textContent = buildDynamicStyle(preferences)
  }

  // Force a reflow so the measurements below reflect the styles just
  // applied.
  void doc.body.offsetWidth

  // Bounded on the axis text wraps against (height for vertical-rl's
  // columns, width for normal horizontal flow); grown to its natural full
  // size on the other axis, which is what the clip element then scrolls.
  if (isVertical) {
    iframe.style.width = `${Math.max(doc.body.scrollWidth, availableWidth)}px`
  } else {
    iframe.style.height = `${Math.max(doc.body.scrollHeight, availableHeight)}px`
  }

  if (isVertical) {
    const maxScroll = clip.scrollWidth - clip.clientWidth
    // The book reads right-to-left: it starts at the far right (max
    // scrollLeft) and scrolling left moves forward through it.
    clip.scrollLeft = maxScroll
  } else {
    clip.scrollTop = 0
  }
}

function Reader({ book, onBack }) {
  const [errorMessage, setErrorMessage] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [preferences, setPreferences] = useState(loadPreferences)
  const [html, setHtml] = useState(null)
  const [isPaginating, setIsPaginating] = useState(false)

  const pageRef = useRef(null)
  const viewerRef = useRef(null)
  const clipRef = useRef(null)
  const iframeRef = useRef(null)
  const reading = useReadingState(book.id, iframeRef, clipRef)
  const preferencesRef = useRef(preferences)
  useEffect(() => { preferencesRef.current = preferences }, [preferences])
  const isSettingsOpenRef = useRef(isSettingsOpen)
  const isLoadedRef = useRef(false)
  const isMountedRef = useRef(true)
  const relayoutGenerationRef = useRef(0)
  const pageTurnHandlerRef = useRef(null)
  if (!pageTurnHandlerRef.current) {
    pageTurnHandlerRef.current = createPageTurnHandler(clipRef, isSettingsOpenRef)
  }

  // NEW: hover-to-define. Hold the chosen hotkey (configurable in Display
  // settings, left Alt by default) over a word to look it up; the popup
  // then stays open until clicked away, not just while the key is held.
  // popup is what <DefinitionPopup> renders; attach() wires the hover
  // listeners into the iframe's document each time it loads.
  const [definitionHotkey, setDefinitionHotkey] = useDefinitionHotkey()
  const { popup, attach } = useJapaneseHover(iframeRef, { hotkey: definitionHotkey })

  useEffect(() => {
    // StrictMode runs this effect, then its cleanup, then the effect again
    // (mount -> cleanup -> mount) specifically to catch effects that
    // aren't safe to repeat. Setting isMountedRef back to true here, not
    // just via useRef(true)'s one-time initial value, is what makes this
    // one safe: without it, the synthetic cleanup's `= false` is never
    // undone, so isMountedRef stays permanently false from then on and
    // every runRelayout call's own mounted check silently no-ops forever.
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Sizing/scrolling a full book-length document can still take a moment
  // on the browser's side even without any JS-driven pagination work, so
  // this still shows a loading state -- calling relayout directly from an
  // effect or event handler would run it in the same tick as the state
  // update meant to display that, leaving no chance for the browser to
  // paint it first. Waiting two animation frames guarantees a real paint
  // happens before the potentially-slow work starts.
  const runRelayout = async (iframe, outer, clip, prefs) => {
    // StrictMode deliberately double-invokes effects in development, and
    // this function is called from more than one of them -- without a
    // guard, two overlapping calls could both end up mid-flight at once.
    // Stamping a generation number and having every await-point bail out
    // once a newer call has superseded it means only the most recent call
    // ever actually runs relayout's work.
    const generation = ++relayoutGenerationRef.current
    setIsPaginating(true)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    if (!isMountedRef.current || generation !== relayoutGenerationRef.current) {
      return
    }
    try {
      const position = reading.beforeLayout()
      relayout(iframe, outer, clip, prefs)
      reading.afterLayout(position, prefs.orientation === 'vertical')
    } catch (error) {
      // Surface it and recover the UI instead of leaving "Preparing
      // pages..." showing forever -- a silent, permanently-stuck loading
      // state is worse than a reader that stays on its previous page.
      console.error('Failed to lay out book:', error)
    } finally {
      if (isMountedRef.current && generation === relayoutGenerationRef.current) {
        setIsPaginating(false)
      }
    }
  }

  useEffect(() => {
    isSettingsOpenRef.current = isSettingsOpen || isBookmarksOpen
  }, [isSettingsOpen, isBookmarksOpen])

  useEffect(() => {
    let cancelled = false
    isLoadedRef.current = false
    setHtml(null)
    setErrorMessage('')

    flattenBook(book.data)
      .then((flattened) => {
        if (!cancelled) {
          setHtml(flattened)
        }
      })
      .catch((error) => {
        console.error('Error loading EPUB:', error)
        if (!cancelled) {
          setErrorMessage('Unable to open this EPUB file.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [book])

  useEffect(() => {
    if (!html) {
      return
    }
    const handler = pageTurnHandlerRef.current
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [html])

  useEffect(() => {
    if (!html || !isLoadedRef.current) {
      return
    }
    runRelayout(iframeRef.current, viewerRef.current, clipRef.current, preferences)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences])

  useEffect(() => {
    if (!html) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      if (isLoadedRef.current) {
        // Bump the generation even though this path stays synchronous
        // (unbatched, so resizing stays responsive rather than showing a
        // loading indicator on every tick) -- it marks any runRelayout
        // call still waiting on its paint-frame delay as superseded, so
        // that call skips its own now-redundant relayout() instead of
        // running right after this one.
        relayoutGenerationRef.current += 1
        try {
          const position = reading.beforeLayout()
          const prefs = preferencesRef.current
          relayout(iframeRef.current, viewerRef.current, clipRef.current, prefs)
          reading.afterLayout(position, prefs.orientation === 'vertical')
        } catch (error) {
          console.error('Failed to lay out book:', error)
        }
      }
    })
    resizeObserver.observe(viewerRef.current)
    return () => resizeObserver.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === pageRef.current)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const handleIframeLoad = () => {
    isLoadedRef.current = true
    runRelayout(iframeRef.current, viewerRef.current, clipRef.current, preferences)
    // See createPageTurnHandler: focus inside the iframe needs its own
    // listener since keydown there won't bubble to the parent window.
    iframeRef.current?.contentWindow?.addEventListener('keydown', pageTurnHandlerRef.current)
    // NEW: start hover highlighting / definitions inside the freshly loaded iframe.
    attach(iframeRef.current)
  }

  const handlePreferencesChange = (next) => {
    setPreferences(next)
    savePreferences(next)
  }

  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      pageRef.current?.requestFullscreen()
    }
  }

  return (
    <div className="reader-page" ref={pageRef}>
      <TopBar>
        <button className="topbar-btn" onClick={() => { reading.flush(); onBack() }}>
          Return to bookshelf
        </button>
        <button className="topbar-btn" onClick={handleToggleFullscreen}>
          {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
        <button className="topbar-btn" onClick={() => { setIsBookmarksOpen(false); setIsSettingsOpen((open) => !open) }}>
          Settings
        </button>
        <button className="topbar-btn" disabled={!html || isPaginating} onClick={() => { reading.addBookmark(); setIsSettingsOpen(false); setIsBookmarksOpen(true) }}>
          Add bookmark
        </button>
        <button className="topbar-btn" aria-expanded={isBookmarksOpen} aria-controls="bookmarks-panel" onClick={() => { setIsSettingsOpen(false); setIsBookmarksOpen((open) => !open) }}>
          Bookmarks ({reading.state.bookmarks.length})
        </button>
      </TopBar>
      <div className="reading-progress" role="status">
        {Math.round((reading.state.position?.progress ?? 0) * 100)}% through {book.name}
      </div>
      {reading.storageError && <p className="reading-storage-error" role="alert">{reading.storageError}</p>}

      <div className="reader-content">
        <style id="yomu-scrollbar-style" />
        {errorMessage && <p id="error-message">{errorMessage}</p>}
        {isPaginating && <p id="pagination-status">Loading book…</p>}

        <div id="viewer" ref={viewerRef}>
          <div id="viewer-clip" ref={clipRef} onScroll={reading.onScroll}>
            {html && (
              <iframe
                ref={iframeRef}
                srcDoc={html}
                onLoad={handleIframeLoad}
                title="Book content"
              />
            )}
          </div>
        </div>

        {isSettingsOpen && (
          <ReadingSettingsPanel
            preferences={preferences}
            onChange={handlePreferencesChange}
            onClose={() => setIsSettingsOpen(false)}
            definitionHotkey={definitionHotkey}
            onDefinitionHotkeyChange={setDefinitionHotkey}
          />
        )}

        {isBookmarksOpen && (
          <aside className="bookmarks-panel" id="bookmarks-panel" aria-label="Bookmarks">
            <div className="reading-settings-header">
              <h2>Bookmarks</h2>
              <button className="reading-settings-close" aria-label="Close bookmarks" onClick={() => setIsBookmarksOpen(false)}>×</button>
            </div>
            {reading.state.bookmarks.length === 0 && <p>No bookmarks yet. Use “Add bookmark” to save this passage.</p>}
            <ul className="bookmarks-list">
              {reading.state.bookmarks.map((bookmark) => (
                <li key={bookmark.id}>
                  <button className="bookmark-jump" disabled={!html || isPaginating} onClick={() => { reading.jumpToBookmark(bookmark); setIsBookmarksOpen(false) }}>
                    <span>{bookmark.label}</span>
                    <small>{Math.round(bookmark.position.progress * 100)}% · {new Date(bookmark.createdAt).toLocaleDateString()}</small>
                  </button>
                  <button className="bookmark-remove" aria-label={`Remove bookmark: ${bookmark.label}`} onClick={() => reading.removeBookmark(bookmark.id)}>Remove</button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        {/* NEW: the definition popup (word, reading, meaning, frequency) */}
        <DefinitionPopup popup={popup} />
      </div>
    </div>
  )
}

export default Reader
