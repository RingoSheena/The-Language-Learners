import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { sortByFrequency } from './frequency.js'
import { formatEntry } from './jmdict.js'

// The full JMdict dictionary and any frequency lists, built by
// scripts/import-jmdict.js. It's read-only reference data rather than
// anyone's account data, so it lives in its own database file instead of
// Prisma's.
export const DICTIONARY_PATH = fileURLToPath(new URL('../dictionary.db', import.meta.url))

// SQLite's limit on ? placeholders in one query is far higher, but smaller
// batches keep each statement cheap to prepare
const QUERY_BATCH = 500

let db

function openDictionary() {
  if (db === undefined) {
    db = existsSync(DICTIONARY_PATH)
      ? new Database(DICTIONARY_PATH, { readonly: true, fileMustExist: true })
      : null
  }
  return db
}

// Entries and frequency ranks for each of the given spellings:
//   entries     -- { term: [entry, ...] }, most frequent first
//   frequencies -- { term: [{ r, v, disp }, ...] }: reading, rank, and the
//                  list's label for the rank
// Spellings that aren't in the dictionary are left out. Returns null when
// the dictionary hasn't been imported.
export function lookupTerms(terms) {
  const dictionary = openDictionary()
  if (!dictionary) return null

  const entries = {}
  const frequencies = {}
  const words = new Map()
  for (let start = 0; start < terms.length; start += QUERY_BATCH) {
    const batch = terms.slice(start, start + QUERY_BATCH)
    const placeholders = batch.map(() => '?').join(', ')

    const rows = dictionary
      .prepare(
        `SELECT terms.term, entries.id, entries.word FROM terms
         JOIN entries ON entries.id = terms.entry_id
         WHERE terms.term IN (${placeholders})
         ORDER BY terms.common DESC, entries.id`
      )
      .all(batch)
    for (const row of rows) {
      let word = words.get(row.id)
      if (!word) words.set(row.id, (word = JSON.parse(row.word)))
      ;(entries[row.term] ??= []).push(formatEntry(word, row.term))
    }

    Object.assign(frequencies, frequencyBatch(dictionary, batch))
  }

  for (const term of Object.keys(entries)) {
    entries[term] = sortByFrequency(entries[term], frequencies[term] ?? [])
  }
  return { entries, frequencies }
}

// Just the frequency ranks, as lookupTerms' frequencies. Returns null when
// the dictionary hasn't been imported.
export function lookupFrequencies(terms) {
  const dictionary = openDictionary()
  if (!dictionary) return null

  const frequencies = {}
  for (let start = 0; start < terms.length; start += QUERY_BATCH) {
    Object.assign(frequencies, frequencyBatch(dictionary, terms.slice(start, start + QUERY_BATCH)))
  }
  return frequencies
}

function frequencyBatch(dictionary, terms) {
  const frequencies = {}
  const rows = dictionary
    .prepare(
      `SELECT term, reading, rank, display FROM frequencies
       WHERE term IN (${terms.map(() => '?').join(', ')})`
    )
    .all(terms)
  for (const row of rows) {
    ;(frequencies[row.term] ??= []).push({ r: row.reading, v: row.rank, disp: row.display })
  }
  return frequencies
}
