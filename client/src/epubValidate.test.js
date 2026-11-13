import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_EPUB_SIZE_BYTES } from '../../shared/epubUpload.js'
import { validateEpub, validateEpubFile } from './epubValidate.js'

test('rejects missing, unsupported, empty, and oversized EPUB files', () => {
  assert.throws(() => validateEpubFile(null), /choose an EPUB file/i)
  assert.throws(() => validateEpubFile({ name: 'notes.txt', type: 'text/plain', size: 20 }), /valid \.epub/i)
  assert.throws(() => validateEpubFile({ name: 'empty.epub', size: 0 }), /empty/i)
  assert.throws(
    () => validateEpubFile({ name: 'huge.epub', size: MAX_EPUB_SIZE_BYTES + 1 }),
    /too large/i
  )
})

test('accepts EPUB names or MIME types up to the server size limit', () => {
  assert.doesNotThrow(() => validateEpubFile({ name: 'Japanese.EPUB', size: 128 }))
  assert.doesNotThrow(() => validateEpubFile({ name: 'book', type: 'application/epub+zip', size: 128 }))
  assert.doesNotThrow(() => validateEpubFile({ name: 'max.epub', size: MAX_EPUB_SIZE_BYTES }))
})

test('rejects empty EPUB data with a helpful error', async () => {
  await assert.rejects(validateEpub(new ArrayBuffer(0)), /empty/i)
})

test('rejects corrupt EPUB data with a helpful error', async () => {
  await assert.rejects(
    validateEpub(new Uint8Array([1, 2, 3, 4]).buffer),
    /Unable to open this EPUB/i
  )
})
