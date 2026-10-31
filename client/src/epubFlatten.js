import ePub from 'epubjs'

// A chapter's own inline <style> content is copied verbatim (see the note
// in flattenBook below on why none of these references can resolve here),
// so any @import or url() it contains -- @font-face src, background-image,
// @import itself -- points at the same kind of unresolvable EPUB-internal
// path as a <link rel="stylesheet">, with the same risk: at best a wasted
// 404, at worst the browser blocking layout for minutes on a DNS/TCP
// timeout if the source EPUB happened to reference something external.
// @import is render-blocking in the same way <link rel="stylesheet"> is,
// so it's stripped outright rather than just neutralized.
function sanitizeInlineStyle(cssText) {
  return cssText.replace(/@import[^;]*;/gi, '').replace(/url\(\s*(['"]?).*?\1\s*\)/gi, 'url()')
}

// A chapter's inline <style> was written for that chapter's own document,
// but here every chapter shares one, so left as-is its rules restyle the
// whole book. Calibre's title page, for one, sets body { text-align:
// center }, which centered every column of vertical text in the book
// instead of starting it at the top. Scoping each rule to the chapter's
// own <section> keeps it where it belongs: html/body/:root selectors
// become the section itself, and everything else is nested inside it.
function scopeChapterStyle(cssText, scope) {
  const sheet = new CSSStyleSheet()
  try {
    sheet.replaceSync(cssText)
  } catch {
    return ''
  }
  return Array.from(sheet.cssRules, (rule) => scopeRule(rule, scope)).join('\n')
}

function scopeRule(rule, scope) {
  if (rule instanceof CSSStyleRule) {
    rule.selectorText = splitSelectorList(rule.selectorText)
      .map((selector) => scopeSelector(selector, scope))
      .join(', ')
  } else if (rule.cssRules) {
    // @media, @supports: scope the rules inside
    for (const child of rule.cssRules) scopeRule(child, scope)
  }
  // Anything else (@font-face, @page, @keyframes) has no selector to scope
  return rule.cssText
}

// Splits "a, b:is(c, d)" on its top-level commas only
function splitSelectorList(selectorText) {
  const selectors = []
  let depth = 0
  let start = 0
  for (let i = 0; i < selectorText.length; i += 1) {
    const char = selectorText[i]
    if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth -= 1
    else if (char === ',' && depth === 0) {
      selectors.push(selectorText.slice(start, i))
      start = i + 1
    }
  }
  selectors.push(selectorText.slice(start))
  return selectors.map((selector) => selector.trim()).filter(Boolean)
}

const DOCUMENT_ROOT = /^(?:html|:root)(?![\w-])[^\s>+~]*\s*/i
const CHAPTER_BODY = /^(?:>\s*)?body(?![\w-])[^\s>+~]*\s*/i

function scopeSelector(selector, scope) {
  let rest = selector
  for (const root of [DOCUMENT_ROOT, CHAPTER_BODY]) {
    const match = rest.match(root)
    if (match) rest = rest.slice(match[0].length)
  }
  return rest ? `${scope} ${rest}` : scope
}

// epub.js's own rendition system displays one chapter (spine item) at a
// time in its own iframe, and its CSS multi-column pagination silently
// fails to paginate vertical-rl (Japanese vertical) writing modes at all in
// real browsers, causing content to be clipped or mis-positioned instead of
// paginated. To get a book that's fully loaded and freely flippable end to
// end, this renders every chapter's resource-resolved HTML (reusing
// epub.js's own parsing/resource-substitution machinery) and concatenates
// them into a single HTML document meant for one iframe.
export async function flattenBook(data) {
  const book = ePub(data)

  try {
    await book.opened

    const sections = book.spine.spineItems.filter((section) => section.linear !== false)
    const chapters = []

    for (const [index, section] of sections.entries()) {
      const html = await section.render(book.load.bind(book))
      const doc = new DOMParser().parseFromString(html, 'text/html')

      // section.render() only fetches the chapter's own XHTML -- it never
      // goes through epub.js's Rendition, which is the layer that actually
      // resolves <link>/<img> resource references (Rendition wires up
      // handleLinks/adjustImages as content hooks; Section/Spine never
      // do). So a stylesheet's href here is still the *original* EPUB-
      // internal relative path, verbatim, with no base URL that could
      // ever make it resolve inside this flattened, base-less srcdoc
      // document. At best that's a harmless 404; at worst -- if the
      // source EPUB happened to reference an external URL (a web font
      // CDN, say) -- the browser can block layout for minutes waiting on
      // a DNS/TCP timeout to a server that never responds, which looks
      // exactly like the reader hanging forever with the tab sitting at
      // ~0% CPU. Dropping these tags entirely removes a link that could
      // never have worked anyway, in exchange for a document that can't
      // stall on someone else's unreachable server. The reader supplies
      // its own consistent styling regardless (buildDynamicStyle in
      // Reader.jsx), and each chapter's own inline <style> content below
      // is preserved.
      doc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => link.remove())

      const chapterClass = `yomu-chapter-${index}`
      const inlineStyle = scopeChapterStyle(
        sanitizeInlineStyle(
          Array.from(doc.querySelectorAll('style'))
            .map((style) => style.textContent)
            .join('\n')
        ),
        `.${chapterClass}`
      )

      chapters.push({
        chapterClass,
        inlineStyle,
        bodyHtml: doc.body ? doc.body.innerHTML : '',
      })
    }

    const inlineStyles = chapters
      .map((chapter) => chapter.inlineStyle)
      .filter(Boolean)
      .join('\n')
    const bodyHtml = chapters
      .map((chapter) => `<section class="yomu-chapter ${chapter.chapterClass}">${chapter.bodyHtml}</section>`)
      .join('\n')

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>${inlineStyles}</style>
<style id="yomu-dynamic-style"></style>
</head>
<body>${bodyHtml}</body>
</html>`
  } finally {
    book.destroy()
  }
}
