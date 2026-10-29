import { defaultPreferences } from './readingPreferences.js'
import './ReadingSettingsPanel.css'

// Free typing needs to work mid-edit (clearing "16" to type "20" passes
// through "" and "2", neither a valid committed value) without either
// rejecting the keystroke or clamping every character -- so onChange only
// ever commits a value that already parses as a real number, leaving an
// out-of-range one as-is until the field loses focus, where onBlur clamps
// to the allowed min/max as a last step.
function NumberField({ label, unit, min, max, step, value, onCommit }) {
  const handleChange = (event) => {
    const parsed = Number(event.target.value)
    if (event.target.value !== '' && Number.isFinite(parsed)) {
      onCommit(parsed)
    }
  }

  const handleBlur = () => {
    const clamped = Math.min(max, Math.max(min, value))
    if (clamped !== value) {
      onCommit(clamped)
    }
  }

  return (
    <label className="reading-settings-field">
      <span>{label}</span>
      <div className="reading-settings-number">
        <input type="number" min={min} max={max} step={step} value={value} onChange={handleChange} onBlur={handleBlur} />
        {unit && <span className="reading-settings-unit">{unit}</span>}
      </div>
    </label>
  )
}

function ReadingSettingsPanel({ preferences, onChange, onClose }) {
  const update = (patch) => onChange({ ...preferences, ...patch })

  return (
    <div className="reading-settings-panel">
      <div className="reading-settings-header">
        <h2>Display settings</h2>
        <button
          type="button"
          className="reading-settings-close"
          aria-label="Close display settings"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <label className="reading-settings-field">
        <span>Background color</span>
        <input
          type="color"
          value={preferences.backgroundColor}
          onChange={(event) => update({ backgroundColor: event.target.value })}
        />
      </label>

      <label className="reading-settings-field">
        <span>Text color</span>
        <input
          type="color"
          value={preferences.textColor}
          onChange={(event) => update({ textColor: event.target.value })}
        />
      </label>

      <NumberField
        label="Text size"
        unit="pt"
        min={8}
        max={36}
        step={0.5}
        value={preferences.fontSize}
        onCommit={(fontSize) => update({ fontSize })}
      />

      <NumberField
        label="Character spacing"
        unit="px"
        min={-1}
        max={10}
        step={0.5}
        value={preferences.letterSpacing}
        onCommit={(letterSpacing) => update({ letterSpacing })}
      />

      <NumberField
        label="Line spacing"
        min={1}
        max={3}
        step={0.1}
        value={preferences.lineSpacing}
        onCommit={(lineSpacing) => update({ lineSpacing })}
      />

      <NumberField
        label="Side margins"
        unit="px"
        min={0}
        max={80}
        step={4}
        value={preferences.pageMargin}
        onCommit={(pageMargin) => update({ pageMargin })}
      />

      <fieldset className="reading-settings-field">
        <legend>Orientation</legend>
        <div className="reading-settings-toggle">
          <button
            type="button"
            className={preferences.orientation === 'horizontal' ? 'active' : ''}
            onClick={() => update({ orientation: 'horizontal' })}
          >
            Horizontal
          </button>
          <button
            type="button"
            className={preferences.orientation === 'vertical' ? 'active' : ''}
            onClick={() => update({ orientation: 'vertical' })}
          >
            Vertical
          </button>
        </div>
      </fieldset>

      <button
        type="button"
        className="reading-settings-reset"
        onClick={() => onChange({ ...defaultPreferences })}
      >
        Reset to defaults
      </button>
    </div>
  )
}

export default ReadingSettingsPanel
