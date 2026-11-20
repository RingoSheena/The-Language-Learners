import { useState } from 'react'
import TopBar, { TopBarButton } from './TopBar.jsx'
import { BackIcon } from './components/icons.jsx'
import { NumberField } from './ReadingSettingsPanel.jsx'
import { defaultPreferences, loadPreferences, savePreferences } from './readingPreferences.js'
import { HOTKEY_OPTIONS, useDefinitionHotkey } from './hooks/useJapaneseHover.js'
import { PREVIEW_PARAGRAPHS, PREVIEW_TITLE } from './readingPreviewText.js'
import './Settings.css'

// How a page of a book looks with these settings, as the reader draws it.
// It scrolls like a chapter: down for horizontal text, sideways for vertical.
function ReadingPreview({ preferences }) {
  const vertical = preferences.orientation === 'vertical'
  return (
    <figure className="reading-preview">
      <figcaption>Preview</figcaption>
      {/* The text goes in its own box: a vertical-text element sizes its
          width to its content, so on the page itself it'd be a thin strip */}
      <div className="reading-preview-page" style={{ backgroundColor: preferences.backgroundColor }}>
      <div
        className="reading-preview-text"
        lang="ja"
        tabIndex={0}
        aria-label="Preview text"
        style={{
          color: preferences.textColor,
          fontSize: `${preferences.fontSize}pt`,
          letterSpacing: `${preferences.letterSpacing}px`,
          lineHeight: preferences.lineSpacing,
          writingMode: vertical ? 'vertical-rl' : 'horizontal-tb',
          paddingInline: vertical ? undefined : `${preferences.pageMargin}px`,
          paddingBlock: vertical ? `${preferences.pageMargin}px` : undefined,
        }}
      >
        <h4>{PREVIEW_TITLE}</h4>
        {PREVIEW_PARAGRAPHS.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      </div>
    </figure>
  )
}

// Book settings: how the reader shows text, and how words are looked up.
// They're saved in this browser and apply the next time a book is opened
// (the reader's own Display settings panel changes them while reading).
function Settings({ onBack }) {
  const [preferences, setPreferences] = useState(loadPreferences)
  const [definitionHotkey, setDefinitionHotkey] = useDefinitionHotkey()

  const update = (patch) => {
    const next = { ...preferences, ...patch }
    setPreferences(next)
    savePreferences(next)
  }

  return (
    <div className="settings-page">
      <TopBar onHome={onBack}>
        <TopBarButton label="Return to bookshelf" icon={<BackIcon />} onClick={onBack} />
      </TopBar>

      <div className="settings-content">
        <p className="settings-eyebrow">Reading</p>
        <h2>Book settings</h2>
        <p className="settings-intro">
          How your books look in the reader. Changes are saved right away and
          apply to every book.
        </p>

        <div className="settings-layout">
          <div className="settings-column">
            <section className="settings-section">
              <h3>Looking up words</h3>
              <label className="settings-field settings-field-row">
                <span>Hold to look up a word</span>
                <select
                  value={definitionHotkey}
                  onChange={(event) => setDefinitionHotkey(event.target.value)}
                >
                  {HOTKEY_OPTIONS.map(({ code, label }) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </label>
              <p className="settings-help">
                Hold this key while pointing at a word in a book to see its
                definition.
              </p>
            </section>

            <section className="settings-section">
              <h3>Colors</h3>
              <div className="settings-grid">
                <label className="settings-field">
                  <span>Background</span>
                  <input
                    type="color"
                    value={preferences.backgroundColor}
                    onChange={(event) => update({ backgroundColor: event.target.value })}
                  />
                </label>
                <label className="settings-field">
                  <span>Text</span>
                  <input
                    type="color"
                    value={preferences.textColor}
                    onChange={(event) => update({ textColor: event.target.value })}
                  />
                </label>
              </div>
            </section>

            <section className="settings-section">
              <h3>Text and layout</h3>
              <div className="settings-grid">
                <NumberField
                  className="settings-field"
                  label="Text size"
                  unit="pt"
                  min={8}
                  max={36}
                  step={0.5}
                  value={preferences.fontSize}
                  onCommit={(fontSize) => update({ fontSize })}
                />
                <NumberField
                  className="settings-field"
                  label="Line spacing"
                  min={1}
                  max={3}
                  step={0.1}
                  value={preferences.lineSpacing}
                  onCommit={(lineSpacing) => update({ lineSpacing })}
                />
                <NumberField
                  className="settings-field"
                  label="Character spacing"
                  unit="px"
                  min={-1}
                  max={10}
                  step={0.5}
                  value={preferences.letterSpacing}
                  onCommit={(letterSpacing) => update({ letterSpacing })}
                />
                <NumberField
                  className="settings-field"
                  label="Side margins"
                  unit="px"
                  min={0}
                  max={80}
                  step={4}
                  value={preferences.pageMargin}
                  onCommit={(pageMargin) => update({ pageMargin })}
                />
              </div>

              <fieldset className="settings-field settings-fieldset">
                <legend>Orientation</legend>
                <div className="settings-toggle" role="group">
                  {[
                    { value: 'vertical', label: 'Vertical' },
                    { value: 'horizontal', label: 'Horizontal' },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={preferences.orientation === value}
                      onClick={() => update({ orientation: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </section>


            <button
              type="button"
              className="settings-reset"
              onClick={() => update(defaultPreferences)}
            >
              Reset display to defaults
            </button>
          </div>

          <ReadingPreview preferences={preferences} />
        </div>
      </div>
    </div>
  )
}

export default Settings
