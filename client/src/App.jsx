import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './Login'
import LandingPage from './LandingPage'
import RegisterPage from './RegisterPage'
import BookshelfApp from './BookshelfApp.jsx'
import Flashcards from './components/Flashcards.jsx'
import RequireAuth from './RequireAuth.jsx'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/bookshelf"
          element={
            <RequireAuth>
              <BookshelfApp />
            </RequireAuth>
          }
        />
        <Route
          path="/flashcards"
          element={
            <RequireAuth>
              <Flashcards />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App