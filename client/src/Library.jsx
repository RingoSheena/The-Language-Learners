import { useEffect, useState } from 'react'
import './App.css'

function Library() {
  const [books, setBooks] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const loadBooks = async () => {
    try {
      setLoading(true)
      setMessage('')

      const response = await fetch('/api/books')

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to load your library.')
      }

      setBooks(data)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBooks()
  }, [])

  const handleFileChange = (event) => {
    const file = event.target.files[0]

    if (!file) {
      setSelectedFile(null)
      return
    }

    if (!file.name.toLowerCase().endsWith('.epub')) {
      setMessage('Please select a valid EPUB file.')
      setSelectedFile(null)
      event.target.value = ''
      return
    }

    setMessage('')
    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage('Please select an EPUB file first.')
      return
    }

    const formData = new FormData()
    formData.append('book', selectedFile)

    try {
      setUploading(true)
      setMessage('')

      const response = await fetch('/api/books', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'The book could not be saved.')
      }

      setBooks((currentBooks) => [data, ...currentBooks])
      setSelectedFile(null)
      setMessage('Book saved successfully.')

      const input = document.getElementById('epub-upload')

      if (input) {
        input.value = ''
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setUploading(false)
    }
  }

  const openBook = (bookId) => {
    window.open(`/api/books/${bookId}`, '_blank')
  }

  return (
    <main>
      <header className="hero">
        <h1>Yomu</h1>
        <p>Japanese Reading &amp; Flashcard Suite</p>
      </header>

      <section className="upload-card">
        <h2>Add a book</h2>

        <input
          id="epub-upload"
          type="file"
          accept=".epub,application/epub+zip"
          onChange={handleFileChange}
        />

        {selectedFile && (
          <p className="selected-file">
            Selected: {selectedFile.name}
          </p>
        )}

        <button
          type="button"
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
        >
          {uploading ? 'Saving...' : 'Save to Library'}
        </button>
      </section>

      {message && (
        <p className="message">
          {message}
        </p>
      )}

      <section className="library">
        <div className="library-heading">
          <h2>Your Library</h2>

          <button
            type="button"
            className="secondary-button"
            onClick={loadBooks}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p>Loading library...</p>
        ) : books.length === 0 ? (
          <p>No saved books yet.</p>
        ) : (
          <div className="book-grid">
            {books.map((book) => (
              <article className="book-card" key={book.id}>
                <h3>{book.title}</h3>

                <p>{book.fileName}</p>

                <small>
                  Saved {new Date(book.createdAt).toLocaleDateString()}
                </small>

                <button
                  type="button"
                  onClick={() => openBook(book.id)}
                >
                  Read
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default Library
