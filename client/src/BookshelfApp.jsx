import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Bookshelf from './Bookshelf.jsx'
import Reader from './Reader.jsx'
import Settings from './Settings.jsx'
import Flashcards from './components/Flashcards.jsx'
import { forgetSavedWords } from './lib/flashcardsApi.js'
import { addBook, deleteBook, getAllBooks, touchBook } from './db.js'
import { extractCoverImage } from './epubCover.js'
import { validateEpub } from './epubValidate.js'
import { removeReadingState } from './readingState.js'

function BookshelfApp() {
  const navigate = useNavigate()
  const [view, setView] = useState('bookshelf')
  const [books, setBooks] = useState([])
  const [activeBookId, setActiveBookId] = useState(null)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    getAllBooks()
      .then(setBooks)
      .catch((error) => {
        console.error('Failed to load bookshelf:', error)
        setUploadError('Unable to load your uploaded books.')
      })
  }, [])

  const handleUpload = async (file) => {
    const isEpub =
      file.name.toLowerCase().endsWith('.epub') ||
      file.type === 'application/epub+zip'

    if (!isEpub) {
      setUploadError('Please upload a valid .epub file.')
      return
    }

    setUploadError('')

    try {
      const data = await file.arrayBuffer()

      try {
        await validateEpub(data.slice(0))
      } catch (error) {
        console.error('Failed to parse EPUB:', error)
        setUploadError(
          `Unable to open "${file.name}". The file may be corrupted or not a valid EPUB.`
        )
        return
      }

      const coverImage = await extractCoverImage(data.slice(0))
      const book = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.epub$/i, ''),
        addedAt: Date.now(),
        data,
        coverImage,
      }

      await addBook(book)
      setBooks((prev) => [...prev, book])
    } catch (error) {
      console.error('Failed to upload book:', error)
      setUploadError(`Unable to add "${file.name}" to your bookshelf.`)
    }
  }

  const handleOpenBook = (id) => {
    const lastOpenedAt = Date.now()

    setBooks((prev) =>
      prev.map((book) =>
        book.id === id ? { ...book, lastOpenedAt } : book
      )
    )

    touchBook(id, lastOpenedAt).catch((error) =>
      console.error('Failed to record last-opened time:', error)
    )

    setActiveBookId(id)
    setView('reader')
  }

  const handleDeleteBook = async (id) => {
    await deleteBook(id)
    removeReadingState(id)
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

  const activeBook = books.find((book) => book.id === activeBookId) ?? null

  if (view === 'reader' && activeBook) {
    return (
      <Reader key={activeBook.id} book={activeBook} onBack={() => setView('bookshelf')} />
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
