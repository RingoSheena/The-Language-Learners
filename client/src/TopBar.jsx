import './TopBar.css'

function TopBar({ children }) {
  return (
    <header className="topbar">
      <span className="topbar-logo">Yomu</span>
      <div className="topbar-actions">{children}</div>
    </header>
  )
}

export default TopBar
