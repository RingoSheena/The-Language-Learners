import test from 'node:test'
import assert from 'node:assert/strict'
import { scopeRule, scopeSelector, splitSelectorList } from './chapterStyle.js'

const SCOPE = '.yomu-chapter-3'

test("html, body and :root become the chapter's section", () => {
  assert.equal(scopeSelector('body', SCOPE), SCOPE)
  assert.equal(scopeSelector('html', SCOPE), SCOPE)
  assert.equal(scopeSelector(':root', SCOPE), SCOPE)
  assert.equal(scopeSelector('html body', SCOPE), SCOPE)
  assert.equal(scopeSelector('html > body', SCOPE), SCOPE)
  assert.equal(scopeSelector('BODY', SCOPE), SCOPE)
})

test('rules under html or body stay under the section', () => {
  assert.equal(scopeSelector('body p', SCOPE), `${SCOPE} p`)
  assert.equal(scopeSelector('body > p', SCOPE), `${SCOPE} > p`)
  assert.equal(scopeSelector('html body .main', SCOPE), `${SCOPE} .main`)
  assert.equal(scopeSelector('html:lang(ja) p', SCOPE), `${SCOPE} p`)
  assert.equal(scopeSelector('body.vrtl p', SCOPE), `${SCOPE} p`)
})

test('other selectors are nested inside the section', () => {
  assert.equal(scopeSelector('p', SCOPE), `${SCOPE} p`)
  assert.equal(scopeSelector('.calibre', SCOPE), `${SCOPE} .calibre`)
  assert.equal(scopeSelector('div body', SCOPE), `${SCOPE} div body`)
  assert.equal(scopeSelector('*', SCOPE), `${SCOPE} *`)
})

test('names that only start with html or body are left alone', () => {
  assert.equal(scopeSelector('body-text', SCOPE), `${SCOPE} body-text`)
  assert.equal(scopeSelector('.body', SCOPE), `${SCOPE} .body`)
  assert.equal(scopeSelector('#html', SCOPE), `${SCOPE} #html`)
})

test('selector lists split only on top-level commas', () => {
  assert.deepEqual(splitSelectorList('h1, h2,h3'), ['h1', 'h2', 'h3'])
  assert.deepEqual(splitSelectorList('p:is(.a, .b), span'), ['p:is(.a, .b)', 'span'])
  assert.deepEqual(splitSelectorList('a[title="x, y"], b'), ['a[title="x, y"]', 'b'])
  assert.deepEqual(splitSelectorList('p'), ['p'])
})

test('every selector in a rule gets scoped', () => {
  const rule = { selectorText: 'body, p:is(.a, .b)' }
  scopeRule(rule, SCOPE)
  assert.equal(rule.selectorText, `${SCOPE}, ${SCOPE} p:is(.a, .b)`)
})

test('rules inside @media and other groups get scoped', () => {
  const inner = { selectorText: 'body' }
  const nested = { selectorText: 'p' }
  const media = { cssRules: [inner, { cssRules: [nested] }] }
  scopeRule(media, SCOPE)
  assert.equal(inner.selectorText, SCOPE)
  assert.equal(nested.selectorText, `${SCOPE} p`)
})

test('rules with no selector are left as they are', () => {
  const fontFace = { cssText: '@font-face { font-family: x; }' }
  scopeRule(fontFace, SCOPE)
  assert.deepEqual(fontFace, { cssText: '@font-face { font-family: x; }' })
})
