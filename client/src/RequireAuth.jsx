import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

// Asks the server whether the session cookie is still valid before
// showing a protected page. localStorage only remembers who logged in
// last; the cookie is what actually proves it, so a logged-out or
// expired visitor gets sent back to /login.
export default function RequireAuth({ children }) {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let cancelled = false

    fetch('/api/me')
      .then(async (response) => {
        if (cancelled) return

        if (!response.ok) {
          localStorage.removeItem('user')
          setStatus('guest')
          return
        }

        const { user } = await response.json()
        localStorage.setItem('user', JSON.stringify(user))
        setStatus('user')
      })
      .catch(() => {
        if (!cancelled) setStatus('guest')
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (status === 'checking') return null
  if (status === 'guest') return <Navigate to="/login" replace />

  return children
}
