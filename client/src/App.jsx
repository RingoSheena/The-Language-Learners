import { useEffect, useState } from 'react'
import Bookshelf from './Bookshelf.jsx'
import Reader from './Reader.jsx'
import Settings from './Settings.jsx'
import { addBook, deleteBook, getAllBooks, touchBook } from './db.js'
import { extractCoverImage } from './epubCover.js'

function App() {
  const [view, setView] = useState('bookshelf') // 'bookshelf' | 'reader' | 'settings'
  const [books, setBooks] = useState([])
  const [activeBookId, setActiveBookId] = useState(null)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    getAllBooks()
      .then(setBooks)
      .catch((error) => console.error('Failed to load bookshelf:', error))
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

    const data = await file.arrayBuffer()
    const coverImage = await extractCoverImage(data)
    const book = {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.epub$/i, ''),
      addedAt: Date.now(),
      data,
      coverImage,
    }

    await addBook(book)
    setBooks((prev) => [...prev, book])
  }

  const handleOpenBook = (id) => {
    const lastOpenedAt = Date.now()
    setBooks((prev) =>
      prev.map((book) => (book.id === id ? { ...book, lastOpenedAt } : book))
    )
    touchBook(id, lastOpenedAt).catch((error) =>
      console.error('Failed to record last-opened time:', error)
    )
    setActiveBookId(id)
    setView('reader')
  }

  const handleDeleteBook = async (id) => {
    await deleteBook(id)
    setBooks((prev) => prev.filter((book) => book.id !== id))
  }

  const activeBook = books.find((book) => book.id === activeBookId) ?? null

  if (view === 'reader' && activeBook) {
    return (
      <Reader book={activeBook} onBack={() => setView('bookshelf')} />
    )
  }

  if (view === 'settings') {
    return <Settings onBack={() => setView('bookshelf')} />
  }

  return (
    <Bookshelf
      books={books}
      uploadError={uploadError}
      onUpload={handleUpload}
      onOpenBook={handleOpenBook}
      onDeleteBook={handleDeleteBook}
      onOpenSettings={() => setView('settings')}
    />
  )
}

export default App
