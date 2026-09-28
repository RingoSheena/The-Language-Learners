import { useMemo, useRef, useState } from 'react'
import TopBar from './TopBar.jsx'
import './Bookshelf.css'

function Bookshelf({
  books,
  uploadError,
  onUpload,
  onOpenBook,
  onOpenSettings,
  onDeleteBook,
}) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const sortedBooks = useMemo(
    () =>
      [...books].sort(
        (a, b) => (b.lastOpenedAt ?? b.addedAt ?? 0) - (a.lastOpenedAt ?? a.addedAt ?? 0)
      ),
    [books]
  )

  const handleFileChange = (event) => {
    const file = event.target.files[0]
    event.target.value = ''

    if (file) {
      onUpload(file)
    }
  }

  const handleDragEnter = (event) => {
    event.preventDefault()
    dragCounter.current += 1
    setIsDragging(true)
  }

  const handleDragOver = (event) => {
    event.preventDefault()
  }

  const handleDragLeave = (event) => {
    event.preventDefault()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragging(false)
    }
  }

  const handleDrop = (event) => {
    event.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)

    const file = event.dataTransfer.files[0]
    if (file) {
      onUpload(file)
    }
  }

  return (
    <div className="bookshelf-page">
      <TopBar>
        <label htmlFor="epub-upload" className="topbar-btn">
          Upload book
        </label>
        <input
          type="file"
          id="epub-upload"
          accept=".epub,application/epub+zip"
          hidden
          onChange={handleFileChange}
        />
        <button className="topbar-btn" onClick={onOpenSettings}>
          Settings
        </button>
      </TopBar>

      <div
        className={`bookshelf-content${isDragging ? ' dragging' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="drop-overlay">
            <p>Drop your .epub to add it to your bookshelf</p>
          </div>
        )}

        {uploadError && <p className="upload-error">{uploadError}</p>}

        {books.length === 0 ? (
          <p className="bookshelf-empty">
            Your bookshelf is empty. Upload an .epub to get started, or drag
            and drop one anywhere in this area.
          </p>
        ) : (
          <div className="bookshelf-grid">
            {sortedBooks.map((book) => (
              <div key={book.id} className="book-card">
                <button
                  type="button"
                  className="book-delete-btn"
                  aria-label={`Delete ${book.name}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onDeleteBook(book.id)
                  }}
                >
                  ×
                </button>
                <button
                  type="button"
                  className="book-open-btn"
                  onClick={() => onOpenBook(book.id)}
                >
                  {book.coverImage ? (
                    <img
                      className="book-cover-image"
                      src={book.coverImage}
                      alt=""
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="book-cover" aria-hidden="true">
                      📖
                    </span>
                  )}
                  <span className="book-title">{book.name}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Bookshelf
