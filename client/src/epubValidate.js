import ePub from 'epubjs'
 
// Confirms an epub can actually be opened and parsed, not just that its
// filename ends in .epub. Throws if the archive is corrupt, isn't an epub,
// or has no readable content.
export async function validateEpub(data) {
  const book = ePub(data)
 
  try {
    await book.opened
 
    const sections = book.spine.spineItems
    if (!sections || sections.length === 0) {
      throw new Error('EPUB has no readable chapters')
    }
 
    await sections[0].render(book.load.bind(book))
  } finally {
    book.destroy()
  }
}
 