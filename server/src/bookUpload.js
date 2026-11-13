// Basic server-side checks also protect requests that bypass the bookshelf UI.
// Oversized files never get here: Multer rejects them first (see
// receiveEpubUpload in index.js).
export function getEpubUploadProblem(file) {
  if (!file) {
    return { status: 400, error: 'Please select an EPUB file.' }
  }

  if (file.size === 0) {
    return { status: 400, error: 'The selected EPUB file is empty.' }
  }

  const isEpub =
    file.originalname?.toLowerCase().endsWith('.epub') ||
    file.mimetype === 'application/epub+zip'

  return isEpub
    ? null
    : { status: 400, error: 'Only EPUB files can be uploaded.' }
}
