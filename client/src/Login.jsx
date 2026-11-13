import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import GoogleSignInButton from './components/GoogleSignInButton';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error || 'Login failed.');
        return;
      }

      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/bookshelf');
    } catch (error) {
      console.error('Fetch error:', error);
      setErrorMessage('Could not connect to the server.');
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h2>Log in</h2>

        {errorMessage && <p className="error-text">{errorMessage}</p>}

        <form onSubmit={handleSubmit}>
          <div className="field-group">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="field-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <button type="submit" className="primary-btn full-width">Log in</button>
        </form>

        <GoogleSignInButton onError={setErrorMessage} />

        <p className="auth-switch">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="text-link">Register</Link>
        </p>
      </div>
    </div>
  );
}
