import { useEffect, useRef, useState } from 'react'
import { TopBarButton } from '../TopBar.jsx'
import {
  applyColorTheme,
  COLOR_THEMES,
  loadColorTheme,
  saveColorTheme,
} from '../colorThemes.js'
import { PaletteIcon, TickIcon } from './icons.jsx'
import './ColorThemePicker.css'

// A top bar button that opens a menu of color themes. Picking one switches
// the whole site at once, so the page behind the menu previews it.
export default function ColorThemePicker() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(loadColorTheme)
  const containerRef = useRef(null)
  const buttonRef = useRef(null)

  // Close on Escape (handing focus back to the button) or a click outside
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  function choose(id) {
    if (id === selected) return
    setSelected(id)
    saveColorTheme(id)
    applyColorTheme(id, { animate: true })
  }

  return (
    <div className="theme-picker" ref={containerRef}>
      <TopBarButton
        ref={buttonRef}
        label="Color theme"
        icon={<PaletteIcon />}
        aria-expanded={open}
        aria-controls="theme-picker-menu"
        onClick={() => setOpen((isOpen) => !isOpen)}
      />

      {open && (
        <div className="theme-picker-menu" id="theme-picker-menu" role="group" aria-labelledby="theme-picker-title">
          <p className="theme-picker-title" id="theme-picker-title">Color theme</p>
          <div className="theme-picker-grid">
            {COLOR_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className="theme-picker-option"
                aria-pressed={theme.id === selected}
                onClick={() => choose(theme.id)}
                style={{
                  '--swatch-light-bg': theme.light.bg,
                  '--swatch-light-a': theme.light.accent,
                  '--swatch-light-b': theme.light.accent2,
                  '--swatch-dark-bg': theme.dark.bg,
                  '--swatch-dark-a': theme.dark.accent,
                  '--swatch-dark-b': theme.dark.accent2,
                }}
              >
                <span className="theme-picker-swatch" aria-hidden="true">
                  {theme.id === selected && <TickIcon />}
                </span>
                <span className="theme-picker-name">{theme.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
