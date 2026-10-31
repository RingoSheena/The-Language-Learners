// Downloads the latest full English JMdict from jmdict-simplified
// (https://github.com/scriptin/jmdict-simplified) and builds dictionary.db
// from it, for the reader's word lookups.
//
//   npm run dictionary
//
// Safe to run again to update to a newer JMdict: the new dictionary is
// built next to the old one and swapped in only once it's complete.
import { renameSync, rmSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import Database from 'better-sqlite3'
import { DICTIONARY_PATH } from '../src/dictionary.js'
import { compactWord, wordSpellings } from '../src/jmdict.js'

const RELEASES_URL = 'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest'
// The full dictionary, not jmdict-eng-common-*
const ASSET_NAME = /^jmdict-eng-\d[^/]*\.json\.tgz$/

async function download(url, accept) {
  const response = await fetch(url, { headers: { Accept: accept, 'User-Agent': 'yomu-dictionary-import' } })
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`)
  return response
}

// The release's .tgz holds a single JSON file. A tar file is a series of
// 512-byte blocks: a header (name at 0, size in octal at 124), then the
// file's contents padded to a whole block.
function firstJsonFile(tarball) {
  for (let offset = 0; offset + 512 <= tarball.length; ) {
    const header = tarball.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '')
    if (!name) break
    const size = parseInt(header.subarray(124, 136).toString('utf8').trim(), 8)
    const start = offset + 512
    if (name.endsWith('.json')) return tarball.subarray(start, start + size).toString('utf8')
    offset = start + Math.ceil(size / 512) * 512
  }
  throw new Error('The JMdict download did not contain a .json file')
}

async function main() {
  const release = await (await download(RELEASES_URL, 'application/vnd.github+json')).json()
  const asset = release.assets.find((a) => ASSET_NAME.test(a.name))
  if (!asset) throw new Error(`No full English JMdict in jmdict-simplified release ${release.tag_name}`)

  console.log(`Downloading ${asset.name} (${(asset.size / 1e6).toFixed(1)} MB)...`)
  const tarball = gunzipSync(Buffer.from(await (await download(asset.browser_download_url, 'application/octet-stream')).arrayBuffer()))
  const jmdict = JSON.parse(firstJsonFile(tarball))

  console.log(`Building the dictionary from ${jmdict.words.length} entries...`)
  const buildPath = `${DICTIONARY_PATH}.building`
  rmSync(buildPath, { force: true })
  const db = new Database(buildPath)
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE entries (id INTEGER PRIMARY KEY, word TEXT NOT NULL);
    CREATE TABLE terms (term TEXT NOT NULL, entry_id INTEGER NOT NULL, common INTEGER NOT NULL);
  `)

  const addMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
  const addEntry = db.prepare('INSERT INTO entries (id, word) VALUES (?, ?)')
  const addTerm = db.prepare('INSERT INTO terms (term, entry_id, common) VALUES (?, ?, ?)')
  db.transaction(() => {
    addMeta.run('version', jmdict.version)
    addMeta.run('dictDate', jmdict.dictDate)
    for (const word of jmdict.words) {
      const id = Number(word.id)
      addEntry.run(id, JSON.stringify(compactWord(word)))
      for (const { text, common } of wordSpellings(word)) addTerm.run(text, id, common ? 1 : 0)
    }
  })()
  db.exec('CREATE INDEX terms_term ON terms (term)')
  db.close()

  renameSync(buildPath, DICTIONARY_PATH)
  console.log(`Dictionary ready: JMdict ${jmdict.dictDate}, ${jmdict.words.length} entries`)
}

main().catch((error) => {
  // Windows won't replace a database file another process has open
  if (error.code === 'EPERM' || error.code === 'EBUSY') {
    console.error('Could not replace dictionary.db while the server is using it. Stop the server and run this again.')
  } else {
    console.error('Could not build the dictionary:', error.message)
  }
  process.exitCode = 1
})
