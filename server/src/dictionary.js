import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { formatEntry } from './jmdict.js'

// The full JMdict dictionary, built by scripts/import-jmdict.js. It's
// read-only reference data rather than anyone's account data, so it lives
// in its own database file instead of Prisma's.
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

// Entries for each of the given spellings, as { term: [entry, ...] } with
// common spellings first. Spellings that aren't in the dictionary are left
// out. Returns null when the dictionary hasn't been imported.
export function lookupTerms(terms) {
  const dictionary = openDictionary()
  if (!dictionary) return null

  const results = {}
  const words = new Map()
  for (let start = 0; start < terms.length; start += QUERY_BATCH) {
    const batch = terms.slice(start, start + QUERY_BATCH)
    const rows = dictionary
      .prepare(
        `SELECT terms.term, entries.id, entries.word FROM terms
         JOIN entries ON entries.id = terms.entry_id
         WHERE terms.term IN (${batch.map(() => '?').join(', ')})
         ORDER BY terms.common DESC, entries.id`
      )
      .all(batch)

    for (const row of rows) {
      let word = words.get(row.id)
      if (!word) words.set(row.id, (word = JSON.parse(row.word)))
      ;(results[row.term] ??= []).push(formatEntry(word, row.term))
    }
  }
  return results
}
