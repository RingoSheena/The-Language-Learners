import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './Login';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={
          <main>
            <h1>Yomu</h1>
            <p>Japanese Reading &amp; Flashcard Suite</p>
            <Login />
          </main>
        } />
        
        <Route path="/app" element={
          <div>
            <h1>Welcome to the App!</h1>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
