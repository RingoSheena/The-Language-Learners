import { useNavigate } from 'react-router-dom'
import './TopBar.css'
import './appTheme.css'

// The bar is only shown once you're logged in, so the logo always leads home
// to the bookshelf. Pages inside the bookshelf app switch views rather than
// routes, so they pass `onHome` to get back there.
function TopBar({ children, onHome }) {
  const navigate = useNavigate()

  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar-logo"
        aria-label="Yomu: go to your bookshelf"
        onClick={onHome ?? (() => navigate('/bookshelf'))}
      >
        Yomu
      </button>
      <div className="topbar-actions">{children}</div>
    </header>
  )
}

// An icon-only top bar button. `label` is its accessible name and the
// tooltip shown on hover or focus; `badge` is an optional small count.
export function TopBarButton({ label, icon, badge, ...props }) {
  return (
    <button
      type="button"
      className="topbar-btn topbar-icon-btn"
      aria-label={label}
      data-tip={label}
      {...props}
    >
      {icon}
      {badge != null && (
        <span className="topbar-badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  )
}

export default TopBar
