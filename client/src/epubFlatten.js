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

    for (const section of sections) {
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

      const inlineStyle = sanitizeInlineStyle(
        Array.from(doc.querySelectorAll('style'))
          .map((style) => style.textContent)
          .join('\n')
      )

      chapters.push({
        inlineStyle,
        bodyHtml: doc.body ? doc.body.innerHTML : '',
      })
    }

    const inlineStyles = chapters
      .map((chapter) => chapter.inlineStyle)
      .filter(Boolean)
      .join('\n')
    const bodyHtml = chapters
      .map((chapter) => `<section class="yomu-chapter">${chapter.bodyHtml}</section>`)
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
