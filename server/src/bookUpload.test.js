import test from 'node:test'
import assert from 'node:assert/strict'
import { getEpubUploadProblem } from './bookUpload.js'

test('rejects missing, empty and unsupported uploads', () => {
  assert.equal(getEpubUploadProblem(undefined).status, 400)
  assert.match(getEpubUploadProblem({ originalname: 'empty.epub', size: 0 }).error, /empty/i)
  assert.match(
    getEpubUploadProblem({ originalname: 'notes.txt', mimetype: 'text/plain', size: 20 }).error,
    /Only EPUB/i
  )
})

test('accepts an EPUB extension or MIME type', () => {
  assert.equal(getEpubUploadProblem({ originalname: 'Japanese.EPUB', size: 20 }), null)
  assert.equal(
    getEpubUploadProblem({ originalname: 'book', mimetype: 'application/epub+zip', size: 20 }),
    null
  )
})
