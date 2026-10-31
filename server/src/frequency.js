// Word frequency lists in Yomitan's format (term_meta_bank_*.json), like
// JPDB's, used to rank dictionary matches. Pure functions, so they're easy
// to test; scripts/import-jmdict.js and dictionary.js do the file and
// database work.

const KANJI = /[㐀-鿿]/

// Rows of [term, reading, rank, display] from one term_meta_bank file.
// reading is null when the list ranks the term whatever its reading.
// display is the list's own label for the rank: JPDB marks a rank for the
// word written in kana with ㋕, and a word missing from its corpus with ❌.
//
// A ㋕ rank on a kanji spelling is how common its reading is written in
// kana, not how common that spelling is: JPDB gives 行る 46㋕ because
// that's やる's rank, though 行る itself is 75931. Ranking by it would put
// 行る ahead of 行く (58) for 行った, so those are left out.
export function frequencyRows(bank) {
  const rows = []
  for (const [term, mode, data] of bank) {
    if (mode !== 'freq') continue
    const hasReading = data?.frequency !== undefined
    const frequency = hasReading ? data.frequency : data
    const rank = typeof frequency === 'object' ? frequency?.value : frequency
    if (!Number.isFinite(rank)) continue
    const display = typeof frequency === 'object' ? (frequency.displayValue ?? String(rank)) : String(rank)
    if (display.includes('㋕') && KANJI.test(term)) continue
    rows.push([term, hasReading ? (data.reading ?? null) : null, rank, display])
  }
  return rows
}

// The best (lowest) rank the list gives a dictionary entry: for the
// entry's reading, or for any reading when the list doesn't say which.
// null when it isn't ranked at all.
export function entryRank(entry, frequencies) {
  let best = null
  for (const { r, v } of frequencies) {
    if (r && entry.r && r !== entry.r) continue
    if (best === null || v < best) best = v
  }
  return best
}

// A flashcard's rank: the best one for any of its readings (the popup
// saves every reading, as "たわごと、 ざれごと"), or for the word whatever
// its reading when none of them match. null when the word isn't ranked.
export function cardRank(frequencies, reading = '') {
  const readings = reading.split(/[、,;\s]+/).filter(Boolean)
  const matching = frequencies.filter(({ r }) => !r || readings.includes(r))
  const ranks = (matching.length > 0 ? matching : frequencies).map(({ v }) => v)
  return ranks.length > 0 ? Math.min(...ranks) : null
}

// Most frequent first, so 来る shows くる before きたる. A kana spelling
// usually has one rank for every word spelled that way, so among those,
// words normally written in kana come first: よ the particle before 世 and
// 夜. Otherwise entries keep their order.
export function sortByFrequency(entries, frequencies) {
  return entries
    .map((entry, i) => ({ entry, i, rank: entryRank(entry, frequencies) ?? Infinity }))
    .sort((a, b) => a.rank - b.rank || b.entry.uk - a.entry.uk || a.i - b.i)
    .map(({ entry }) => entry)
}
