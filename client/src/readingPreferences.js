const STORAGE_KEY = 'yomu-reading-preferences'

export const defaultPreferences = {
  backgroundColor: '#ffffff',
  textColor: '#1a1a1a',
  fontSize: 16,
  letterSpacing: 0,
  lineSpacing: 1.5,
  orientation: 'vertical',
  pageMargin: 24,
}

export function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { ...defaultPreferences }
    }
    return { ...defaultPreferences, ...JSON.parse(raw) }
  } catch (error) {
    console.error('Failed to load reading preferences:', error)
    return { ...defaultPreferences }
  }
}

export function savePreferences(preferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
}
