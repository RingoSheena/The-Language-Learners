import ePub from 'epubjs'

// Thrown for a validation failure that already has a message meant for the
// learner to read, so callers can tell it apart from an unexpected error
// without relying on matching message text.
class EpubValidationError extends Error {}

// Validates an EPUB before it is added to the learner's library.
export async function validateEpub(data) {
  if (
    data == null ||
    (typeof data === 'string' && !data.trim()) ||
    (typeof data.byteLength === 'number' && data.byteLength === 0) ||
    (typeof data.size === 'number' && data.size === 0)
  ) {
    throw new EpubValidationError('The selected file is empty. Please choose another EPUB file.')
  }

  let book

  try {
    book = ePub(data)
    await book.opened

    const sections = book.spine?.spineItems

    if (!sections || sections.length === 0) {
      throw new EpubValidationError('This EPUB has no readable chapters. Please choose another EPUB file.')
    }

    // Check that the first chapter can actually be rendered.
    await sections[0].render(book.load.bind(book))
  } catch (error) {
    if (error instanceof EpubValidationError) {
      throw error
    }

    throw new Error(
      'Unable to open this EPUB. The file may be damaged or unsupported. Please try another EPUB file.',
      { cause: error }
    )
  } finally {
    // Clean up resources even when validation fails.
    if (book) {
      book.destroy()
    }
  }
}
