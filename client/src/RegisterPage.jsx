import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error || 'Registration failed.');
        return;
      }

      setSuccessMessage('Account created successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 800);
    } catch (error) {
      console.error('Registration error:', error);
      setErrorMessage('Could not connect to the server.');
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h2>Create account</h2>

        {errorMessage && <p className="error-text">{errorMessage}</p>}
        {successMessage && <p className="success-text">{successMessage}</p>}

        <form onSubmit={handleSubmit}>
          <div className="field-group">
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="field-group">
            <label htmlFor="register-password">Password</label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <div className="field-group">
            <label htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>

          <button type="submit" className="primary-btn full-width">Register</button>
        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <Link to="/login" className="text-link">Log in</Link>
        </p>
      </div>
    </div>
  );
}
