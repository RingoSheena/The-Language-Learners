import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="brand">Yomu</div>
        <Link to="/login" className="login-top-btn">Log in</Link>
      </header>

      <main className="hero-page">
        <div className="hero-copy">
          <p className="eyebrow">Japanese Reading &amp; Flashcard Suite</p>
          <h1>Read smarter, remember more.</h1>
          <p className="subtext">
            Upload your books, build vocabulary, and study with a cleaner reading flow.
          </p>
          <div className="hero-actions">
            <Link to="/login" className="primary-btn">Get started</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
