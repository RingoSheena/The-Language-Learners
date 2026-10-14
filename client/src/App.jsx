import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './Login'
import LandingPage from './LandingPage'
import RegisterPage from './RegisterPage'
import BookshelfApp from './BookshelfApp.jsx'
import Flashcards from './components/Flashcards.jsx'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/bookshelf" element={<BookshelfApp />} />
        <Route path="/flashcards" element={<Flashcards />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App