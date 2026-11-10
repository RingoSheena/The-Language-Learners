// Downloads the latest full English JMdict from jmdict-simplified
// (https://github.com/scriptin/jmdict-simplified) and builds dictionary.db
// from it, for the reader's word lookups. Frequency lists in Yomitan's
// .zip format in server/dictionaries/ are added too, to rank matches; when
// there are none, JPDB's is downloaded there first from its author's own
// release. Neither is kept in git, since they aren't ours to redistribute.
//
//   npm run dictionary
//
// Safe to run again to update to a newer JMdict: the new dictionary is
// built next to the old one and swapped in only once it's complete.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gunzipSync, inflateRawSync } from 'node:zlib'
import Database from 'better-sqlite3'
import { DICTIONARY_PATH } from '../src/dictionary.js'
import { frequencyRows } from '../src/frequency.js'
import { compactWord, wordSpellings } from '../src/jmdict.js'

const RELEASES_URL = 'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest'
// The full dictionary, not jmdict-eng-common-*
const ASSET_NAME = /^jmdict-eng-\d[^/]*\.json\.tgz$/
const FREQUENCY_DIR = fileURLToPath(new URL('../dictionaries/', import.meta.url))
// JPDB's frequency list (https://github.com/MarvNC/jpdb-freq-list). Pinned
// to one release and checked by its hash, so the file can't change under
// us; it hasn't had a new release since 2022.
const JPDB_URL =
  'https://github.com/MarvNC/jpdb-freq-list/releases/download/2022-05-09/Freq.JPDB_2022-05-10T03_27_02.930Z.zip'
const JPDB_SHA256 = '5bda39a9e3b443b02199435ea723aa0555c891d1ce2c92ea7680163b72b07a0e'

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

// The files in a .zip, as { name: Buffer }. The central directory at the
// end of the file lists each one: its compression method (0 stored, 8
// deflate), compressed size, name, and where its local header is; the data
// starts after that local header's name and extra field.
function readZip(zip) {
  let end = zip.length - 22
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end -= 1
  if (end < 0) throw new Error('not a .zip file')

  const files = {}
  let offset = zip.readUInt32LE(end + 16)
  for (let i = 0; i < zip.readUInt16LE(end + 10); i += 1) {
    const method = zip.readUInt16LE(offset + 10)
    const size = zip.readUInt32LE(offset + 20)
    const nameLength = zip.readUInt16LE(offset + 28)
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    const header = zip.readUInt32LE(offset + 42)
    const start = header + 30 + zip.readUInt16LE(header + 26) + zip.readUInt16LE(header + 28)
    const data = zip.subarray(start, start + size)
    if (method === 0 || method === 8) files[name] = method === 8 ? inflateRawSync(data) : data
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32)
  }
  return files
}

const hasFrequencyList = () =>
  existsSync(FREQUENCY_DIR) && readdirSync(FREQUENCY_DIR).some((name) => name.toLowerCase().endsWith('.zip'))

// Without a frequency list lookups still work, just ranked by JMdict's
// "common word" flag alone, so a failed download only warns
async function downloadJpdb() {
  console.log('Downloading the JPDB frequency list (6.4 MB)...')
  try {
    const zip = Buffer.from(await (await download(JPDB_URL, 'application/octet-stream')).arrayBuffer())
    if (createHash('sha256').update(zip).digest('hex') !== JPDB_SHA256) {
      throw new Error('the download did not match the expected file')
    }
    mkdirSync(FREQUENCY_DIR, { recursive: true })
    writeFileSync(FREQUENCY_DIR + 'jpdb-frequency.zip', zip)
  } catch (error) {
    console.warn(`Could not download the JPDB frequency list (${error.message}). Continuing without it.`)
  }
}

// [file name, title, rows] for each frequency list in server/dictionaries/
function frequencyLists() {
  if (!existsSync(FREQUENCY_DIR)) return []
  return readdirSync(FREQUENCY_DIR)
    .filter((name) => name.toLowerCase().endsWith('.zip'))
    .map((name) => {
      const files = readZip(readFileSync(FREQUENCY_DIR + name))
      const index = files['index.json'] ? JSON.parse(files['index.json'].toString('utf8')) : {}
      const rows = Object.keys(files)
        .filter((file) => /(^|\/)term_meta_bank_\d+\.json$/.test(file))
        .flatMap((file) => frequencyRows(JSON.parse(files[file].toString('utf8'))))
      return [name, index.title ?? name, rows]
    })
}

async function main() {
  const release = await (await download(RELEASES_URL, 'application/vnd.github+json')).json()
  const asset = release.assets.find((a) => ASSET_NAME.test(a.name))
  if (!asset) throw new Error(`No full English JMdict in jmdict-simplified release ${release.tag_name}`)

  console.log(`Downloading ${asset.name} (${(asset.size / 1e6).toFixed(1)} MB)...`)
  const tarball = gunzipSync(Buffer.from(await (await download(asset.browser_download_url, 'application/octet-stream')).arrayBuffer()))
  const jmdict = JSON.parse(firstJsonFile(tarball))
  if (!hasFrequencyList()) await downloadJpdb()
  const lists = frequencyLists()

  console.log(`Building the dictionary from ${jmdict.words.length} entries...`)
  const buildPath = `${DICTIONARY_PATH}.building`
  rmSync(buildPath, { force: true })
  const db = new Database(buildPath)
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE entries (id INTEGER PRIMARY KEY, word TEXT NOT NULL);
    CREATE TABLE terms (term TEXT NOT NULL, entry_id INTEGER NOT NULL, common INTEGER NOT NULL);
    CREATE TABLE frequencies (term TEXT NOT NULL, reading TEXT, rank INTEGER NOT NULL, display TEXT NOT NULL);
  `)

  const addMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
  const addEntry = db.prepare('INSERT INTO entries (id, word) VALUES (?, ?)')
  const addTerm = db.prepare('INSERT INTO terms (term, entry_id, common) VALUES (?, ?, ?)')
  const addRank = db.prepare('INSERT INTO frequencies (term, reading, rank, display) VALUES (?, ?, ?, ?)')
  db.transaction(() => {
    addMeta.run('version', jmdict.version)
    addMeta.run('dictDate', jmdict.dictDate)
    for (const word of jmdict.words) {
      const id = Number(word.id)
      addEntry.run(id, JSON.stringify(compactWord(word)))
      for (const { text, common } of wordSpellings(word)) addTerm.run(text, id, common ? 1 : 0)
    }
    for (const [name, title, rows] of lists) {
      for (const row of rows) addRank.run(...row)
      addMeta.run(`frequency:${name}`, title)
      console.log(`Added frequency list ${title} (${rows.length} ranks)`)
    }
  })()
  db.exec('CREATE INDEX terms_term ON terms (term)')
  db.exec('CREATE INDEX frequencies_term ON frequencies (term)')
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
