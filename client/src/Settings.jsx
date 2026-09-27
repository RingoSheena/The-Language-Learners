import TopBar from './TopBar.jsx'
import './Settings.css'

function Settings({ onBack }) {
  return (
    <div className="settings-page">
      <TopBar>
        <button className="topbar-btn" onClick={onBack}>
          Return to bookshelf
        </button>
      </TopBar>

      <div className="settings-content">
        <h2>Settings</h2>
        <p>Nothing to configure yet.</p>
      </div>
    </div>
  )
}

export default Settings
