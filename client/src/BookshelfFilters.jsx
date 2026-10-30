import { STATUS_FILTERS } from './bookshelfFilter.js'

function BookshelfFilters({ query, status, counts, onQueryChange, onStatusChange }) {
  return (
    <div className="bookshelf-filters">
      <input
        type="search"
        className="bookshelf-search"
        placeholder="Search your books…"
        aria-label="Search books by title"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onQueryChange('')
        }}
      />

      <div className="bookshelf-status-filters" role="group" aria-label="Filter by reading status">
        {STATUS_FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`status-chip${status === id ? ' active' : ''}`}
            aria-pressed={status === id}
            onClick={() => onStatusChange(id)}
          >
            {label} <span className="status-chip-count">{counts[id]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default BookshelfFilters