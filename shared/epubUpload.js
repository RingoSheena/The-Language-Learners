// The largest EPUB the bookshelf accepts. Shared so the browser's early check
// and the server's Multer limit can't drift apart.
export const MAX_EPUB_SIZE_BYTES = 25 * 1024 * 1024

export const EPUB_TOO_LARGE_MESSAGE =
  `This EPUB is too large. Please choose a file smaller than ${MAX_EPUB_SIZE_BYTES / 1024 / 1024} MB.`
