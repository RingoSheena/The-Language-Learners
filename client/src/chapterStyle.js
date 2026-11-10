// A chapter's inline <style> was written for that chapter's own document,
// but epubFlatten puts every chapter into one, so left as-is its rules
// restyle the whole book. Calibre's title page, for one, sets body {
// text-align: center }, which centered every column of vertical text in
// the book instead of starting it at the top. Scoping each rule to the
// chapter's own <section> keeps it where it belongs: html/body/:root
// selectors become the section itself, and everything else is nested
// inside it.
//
// scopeRule only touches selectorText and cssRules, so tests can run it on
// plain objects without a browser.

export function scopeChapterStyle(cssText, scope) {
  const sheet = new CSSStyleSheet()
  try {
    sheet.replaceSync(cssText)
  } catch {
    return ''
  }
  return Array.from(sheet.cssRules, (rule) => {
    scopeRule(rule, scope)
    return rule.cssText
  }).join('\n')
}

export function scopeRule(rule, scope) {
  if (typeof rule.selectorText === 'string') {
    rule.selectorText = splitSelectorList(rule.selectorText)
      .map((selector) => scopeSelector(selector, scope))
      .join(', ')
  } else if (rule.cssRules) {
    // @media, @supports, @layer: scope the rules inside
    for (const child of rule.cssRules) scopeRule(child, scope)
  }
  // Anything else (@font-face, @page, @keyframes) has no selector to scope
}

// Splits "a, b:is(c, d)" on its top-level commas only
export function splitSelectorList(selectorText) {
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

export function scopeSelector(selector, scope) {
  let rest = selector.trim()
  for (const root of [DOCUMENT_ROOT, CHAPTER_BODY]) {
    const match = rest.match(root)
    if (match) rest = rest.slice(match[0].length)
  }
  return rest ? `${scope} ${rest}` : scope
}
