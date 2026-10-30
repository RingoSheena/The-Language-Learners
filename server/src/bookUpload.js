export const MAX_EPUB_SIZE_BYTES = 25 * 1024 * 1024

// Basic server-side checks also protect requests that bypass the bookshelf UI.
export function getEpubUploadProblem(file) {
  if (!file) {
    return { status: 400, error: 'Please select an EPUB file.' }
  }

  if (file.size === 0) {
    return { status: 400, error: 'The selected EPUB file is empty.' }
  }

  if (file.size > MAX_EPUB_SIZE_BYTES) {
    return { status: 413, error: 'This EPUB is too large. Please choose a file smaller than 25 MB.' }
  }

  const isEpub =
    file.originalname?.toLowerCase().endsWith('.epub') ||
    file.mimetype === 'application/epub+zip'

  return isEpub
    ? null
    : { status: 400, error: 'Only EPUB files can be uploaded.' }
}
