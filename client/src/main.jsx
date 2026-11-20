import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyColorTheme, loadColorTheme } from './colorThemes.js'

// Before the first render, so pages never flash the default colors
applyColorTheme(loadColorTheme())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
