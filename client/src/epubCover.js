import ePub from 'epubjs'

// Returns a data URL for the first image resource declared in the epub's
// manifest, or null if the epub has no images.
export async function extractCoverImage(data) {
  const book = ePub(data)

  try {
    await book.opened

    const manifestItems = Object.values(book.packaging.manifest)
    const imageItem = manifestItems.find(
      (item) => item.type && item.type.startsWith('image/')
    )

    if (!imageItem) {
      return null
    }

    const path = book.resolve(imageItem.href)
    return await book.archive.getBase64(path)
  } catch (error) {
    console.error('Failed to extract cover image:', error)
    return null
  } finally {
    book.destroy()
  }
}
