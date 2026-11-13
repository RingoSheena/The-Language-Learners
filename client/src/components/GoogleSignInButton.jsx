import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GIS_SRC = 'https://accounts.google.com/gsi/client';

// Google's script is loaded once and shared by every button on the page
let scriptPromise;
function loadGoogleScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => {
      scriptPromise = undefined; // allow a retry on the next mount
      reject(new Error('Could not load Google sign-in.'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

// Google's own "Sign in with Google" button. When clicked, Google shows its
// account chooser and hands back a signed ID token, which we send to
// /api/auth/google; the server verifies it and starts the same session a
// password login does. Renders nothing when no client id is configured, so
// the pages still work without Google set up.
export default function GoogleSignInButton({ onError }) {
  const buttonRef = useRef(null);
  const navigate = useNavigate();
  // Kept in a ref so re-renders of the page don't re-initialize Google's button
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!CLIENT_ID) return undefined;
    let cancelled = false;

    const handleCredential = async ({ credential }) => {
      onErrorRef.current?.('');
      try {
        const response = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential }),
        });
        const data = await response.json();

        if (!response.ok) {
          onErrorRef.current?.(data.error || 'Google sign-in failed.');
          return;
        }

        localStorage.setItem('user', JSON.stringify(data.user));
        navigate('/bookshelf');
      } catch (error) {
        console.error('Google sign-in error:', error);
        onErrorRef.current?.('Could not connect to the server.');
      }
    };

    loadGoogleScript()
      .then(() => {
        if (cancelled || !buttonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: handleCredential,
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          // Google takes a fixed pixel width (200-400), so match the card's
          // current content width instead of overflowing it on narrow phones
          width: Math.max(200, Math.min(400, buttonRef.current.clientWidth)),
        });
      })
      .catch((error) => onErrorRef.current?.(error.message));

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!CLIENT_ID) return null;

  return (
    <>
      <div className="auth-divider"><span>or</span></div>
      <div className="google-button" ref={buttonRef} />
    </>
  );
}
