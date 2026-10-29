// Searching flashcards on the Browse page, across the Japanese word, its
// reading, and the English definition.
//
// Text is normalized before comparing so that the way a learner types a
// word doesn't decide whether it's found:
//   - NFKC turns half-width katakana (ｺｰﾋｰ) and full-width letters (ｃａｔ)
//     into their usual forms
//   - katakana is folded into hiragana, so こーひー finds コーヒー and the
//     other way round, whichever script the reading was saved in
//   - English is compared case-insensitively

const KATAKANA_START = 0x30a1 // ァ
const KATAKANA_END = 0x30f6 // ヶ
const KATAKANA_TO_HIRAGANA = 0x60

export function normalizeForSearch(text) {
  let normalized = ''
  for (const char of String(text ?? '').normalize('NFKC').toLowerCase()) {
    const code = char.codePointAt(0)
    normalized +=
      code >= KATAKANA_START && code <= KATAKANA_END
        ? String.fromCodePoint(code - KATAKANA_TO_HIRAGANA)
        : char
  }
  return normalized
}

// The normalized text a card can be found by. Worth computing once per card
// rather than on every keystroke.
export function searchableText(card) {
  return [card.japanese, card.reading, card.definition]
    .map(normalizeForSearch)
    .join('\n')
}

// Every space-separated term in the query has to appear somewhere in the
// card, so "cat animal" narrows rather than widens. Japanese has no spaces
// between words, so a Japanese query is usually a single term.
export function queryTerms(query) {
  return normalizeForSearch(query).split(/\s+/).filter(Boolean)
}

export function matchesTerms(text, terms) {
  return terms.every((term) => text.includes(term))
}
