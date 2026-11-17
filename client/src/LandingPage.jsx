import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

// Static demo data: the landing page makes no dictionary/API calls.
const DEMO_SENTENCE = [
  { text: '吾輩', reading: 'わがはい', meaning: 'I; me (archaic, masculine)' },
  { text: 'は' },
  { text: '猫', reading: 'ねこ', meaning: 'cat' },
  { text: 'である', reading: 'である', meaning: 'to be (formal, literary)' },
  { text: '。' },
  { text: '名前', reading: 'なまえ', meaning: 'name' },
  { text: 'は' },
  { text: 'まだ', reading: 'まだ', meaning: 'still; yet' },
  { text: '無い', reading: 'ない', meaning: 'to not exist; to have no' },
  { text: '。' },
];

const POPUP_WIDTH = 240;

function DemoReader() {
  const lineRef = useRef(null);
  const [active, setActive] = useState(null); // { index, left, top }
  const [pinned, setPinned] = useState(false);

  const show = (index, el) => {
    const line = lineRef.current;
    if (!line) return;
    const maxLeft = Math.max(0, line.clientWidth - POPUP_WIDTH);
    const left = Math.min(Math.max(0, el.offsetLeft + el.offsetWidth / 2 - POPUP_WIDTH / 2), maxLeft);
    setActive({ index, left, top: el.offsetTop + el.offsetHeight + 6 });
  };

  const close = () => {
    setActive(null);
    setPinned(false);
  };

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const onDown = (e) => { if (!lineRef.current?.contains(e.target)) close(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', close, true);
    };
  }, [active]);

  const entry = active ? DEMO_SENTENCE[active.index] : null;

  return (
    <div className="landing-preview">
      <p className="landing-preview-label">Now reading</p>
      <div className="landing-preview-line" lang="ja" ref={lineRef}>
        {DEMO_SENTENCE.map((tok, i) =>
          tok.meaning ? (
            <button
              key={i}
              type="button"
              className={`landing-word${active?.index === i ? ' is-active' : ''}`}
              aria-describedby={active?.index === i ? 'landing-demo-popup' : undefined}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse' && !pinned) show(i, e.currentTarget); }}
              onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !pinned) setActive(null); }}
              onFocus={(e) => { if (!pinned) show(i, e.currentTarget); }}
              onBlur={() => { if (!pinned) setActive(null); }}
              onClick={(e) => {
                if (pinned && active?.index === i) close();
                else { show(i, e.currentTarget); setPinned(true); }
              }}
            >
              {tok.text}
            </button>
          ) : (
            <span key={i}>{tok.text}</span>
          ),
        )}
        {entry && (
          <div
            id="landing-demo-popup"
            role="tooltip"
            className="landing-popup"
            style={{ left: active.left, top: active.top, width: POPUP_WIDTH }}
          >
            <strong lang="ja">{entry.text}{entry.reading !== entry.text && ` · ${entry.reading}`}</strong>
            <span>{entry.meaning}</span>
            <span className="landing-preview-chip">+ Add to flashcards</span>
          </div>
        )}
      </div>
      <p className="landing-preview-hint">Hover or tap a word to look it up</p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <span className="landing-brand-mark" aria-hidden="true">読</span>
          Yomu
        </div>
        <Link to="/login" className="landing-btn landing-btn-ghost">Log in</Link>
      </header>

      <main>
        <section className="landing-hero">
          <div>
            <p className="landing-eyebrow">Japanese Reading &amp; Flashcard Suite</p>
            <h1>
              Read smarter, <em>remember more.</em>
            </h1>
            <p className="landing-sub">
              Upload your books, build vocabulary, and study with a cleaner reading flow.
            </p>
            <div className="landing-actions">
              <Link to="/login" className="landing-btn landing-btn-primary">Get started</Link>
            </div>
          </div>

          <DemoReader />
        </section>

        <section className="landing-features">
          <div className="landing-feature">
            <div className="landing-feature-icon" aria-hidden="true">📖</div>
            <h3>Read real books</h3>
            <p>Upload your own EPUBs and read them in a comfortable, focused reader.</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon" aria-hidden="true">🔍</div>
            <h3>Look up as you go</h3>
            <p>Hover any word for an instant definition, then save it with one click.</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon" aria-hidden="true">🧠</div>
            <h3>Remember it</h3>
            <p>Spaced-repetition flashcards bring words back right before you forget.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
