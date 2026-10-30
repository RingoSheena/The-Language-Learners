import test from 'node:test'
import assert from 'node:assert/strict'
import { getEpubUploadProblem, MAX_EPUB_SIZE_BYTES } from './bookUpload.js'

test('rejects missing, empty, oversized and unsupported uploads', () => {
  assert.equal(getEpubUploadProblem(undefined).status, 400)
  assert.match(getEpubUploadProblem({ originalname: 'empty.epub', size: 0 }).error, /empty/i)
  assert.equal(
    getEpubUploadProblem({ originalname: 'huge.epub', size: MAX_EPUB_SIZE_BYTES + 1 }).status,
    413
  )
  assert.match(
    getEpubUploadProblem({ originalname: 'notes.txt', mimetype: 'text/plain', size: 20 }).error,
    /Only EPUB/i
  )
})

test('accepts EPUB extension or MIME type at the size limit', () => {
  assert.equal(getEpubUploadProblem({ originalname: 'Japanese.EPUB', size: 20 }), null)
  assert.equal(
    getEpubUploadProblem({ originalname: 'book', mimetype: 'application/epub+zip', size: 20 }),
    null
  )
  assert.equal(getEpubUploadProblem({ originalname: 'max.epub', size: MAX_EPUB_SIZE_BYTES }), null)
})
