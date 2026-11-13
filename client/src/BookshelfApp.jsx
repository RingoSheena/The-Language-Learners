import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Bookshelf from './Bookshelf.jsx'
import Reader from './Reader.jsx'
import Settings from './Settings.jsx'
import Flashcards from './components/Flashcards.jsx'
import { forgetSavedWords } from './lib/flashcardsApi.js'
import {
  deleteBook,
  downloadBook,
  listBooks,
  loadReadingState,
  touchBook,
  uploadBook,
} from './lib/booksApi.js'
import { extractCoverImage } from './epubCover.js'
import { validateEpub, validateEpubFile } from './epubValidate.js'
import { removeLocalReadingState } from './readingState.js'

function BookshelfApp() {
  const navigate = useNavigate()
  const [view, setView] = useState('bookshelf')
  const [books, setBooks] = useState([])
  const [activeBook, setActiveBook] = useState(null)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    listBooks()
      .then(setBooks)
      .catch((error) => {
        console.error('Failed to load bookshelf:', error)
        setUploadError('Unable to load your uploaded books.')
      })
  }, [])

  const handleUpload = async (file) => {
    setUploadError('')

    try {
      validateEpubFile(file)
    } catch (error) {
      setUploadError(error.message)
      return
    }

    try {
      const data = await file.arrayBuffer()

      try {
        await validateEpub(data.slice(0))
      } catch (error) {
        console.error('Failed to parse EPUB:', error)
        setUploadError(error.message)
        return
      }

      const coverImage = await extractCoverImage(data.slice(0))
      const book = await uploadBook({
        file,
        title: file.name.replace(/\.epub$/i, ''),
        coverImage,
      })

      setBooks((prev) => [...prev, book])
    } catch (error) {
      console.error('Failed to upload book:', error)
      setUploadError(
        error.status === 400 || error.status === 413
          ? error.message
          : `Unable to add "${file.name}" to your bookshelf.`
      )
    }
  }

  const handleOpenBook = async (id) => {
    const book = books.find((item) => item.id === id)
    if (!book) return

    setUploadError('')

    let data
    let readingState
    try {
      ;[data, readingState] = await Promise.all([
        downloadBook(id),
        loadReadingState(id),
      ])
    } catch (error) {
      console.error('Failed to download book:', error)
      setUploadError(`Unable to open "${book.name}".`)
      return
    }

    const lastOpenedAt = Date.now()

    setBooks((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, lastOpenedAt } : item
      )
    )

    touchBook(id, lastOpenedAt).catch((error) =>
      console.error('Failed to record last-opened time:', error)
    )

    setActiveBook({ ...book, lastOpenedAt, data, readingState })
    setView('reader')
  }

  const handleDeleteBook = async (id) => {
    try {
      await deleteBook(id)
    } catch (error) {
      console.error('Failed to delete book:', error)
      setUploadError('Unable to delete that book.')
      return
    }

    // Clean up any copy from before progress synced to the account
    removeLocalReadingState(id)
    setBooks((prev) => prev.filter((book) => book.id !== id))
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' })
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      localStorage.removeItem('user')
      forgetSavedWords()
      navigate('/login', { replace: true })
    }
  }

  // The reader hands back where it left off, so the bookshelf's progress
  // is current without reloading the library.
  const closeReader = (readingPosition) => {
    const id = activeBook.id
    setBooks((prev) =>
      prev.map((item) =>
        item.id === id && readingPosition ? { ...item, readingPosition } : item
      )
    )
    setActiveBook(null)
    setView('bookshelf')
  }

  if (view === 'reader' && activeBook) {
    return (
      <Reader key={activeBook.id} book={activeBook} onBack={closeReader} />
    )
  }

  if (view === 'settings') {
    return <Settings onBack={() => setView('bookshelf')} />
  }

  if (view === 'flashcards') {
    return <Flashcards onBack={() => setView('bookshelf')} />
  }

  return (
    <Bookshelf
      books={books}
      uploadError={uploadError}
      onUpload={handleUpload}
      onOpenBook={handleOpenBook}
      onDeleteBook={handleDeleteBook}
      onOpenSettings={() => setView('settings')}
      onOpenFlashcards={() => setView('flashcards')}
      onLogout={handleLogout}
    />
  )
}

export default BookshelfApp
