import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

function getHashType() {
  const hash = window.location.hash
  if (hash.includes('type=invite')) return 'invite'
  if (hash.includes('type=recovery')) return 'recovery'
  return null
}

export default function Login() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const hashType = getHashType()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'forgot' | 'set-password'>(
    hashType ? 'set-password' : 'login'
  )
  const [resetSent, setResetSent] = useState(false)

  // Allow set-password to render even when user session exists (invite/recovery flow)
  if (user && mode !== 'set-password') return <Navigate to="/" replace />

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    if (password.length < 12) { setError('Password must be at least 12 characters'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    navigate('/', { replace: true })
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) { setError(error.message); setLoading(false); return }
    setResetSent(true)
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "'Figtree', sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 360 }}>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--accent,#7c3aed)', color: '#fff', fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>H</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>HallManager</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {mode === 'set-password' ? (hashType === 'invite' ? 'Set a password to activate your account' : 'Choose a new password') : mode === 'login' ? 'Sign in to your account' : 'Reset your password'}
          </div>
        </div>

        <div className="card" style={{ padding: '24px 22px' }}>
          {mode === 'set-password' ? (
            <form onSubmit={handleSetPassword}>
              <div className="notice notice-accent" style={{ marginBottom: 14 }}>
                {hashType === 'invite' ? 'Welcome! Choose a password to complete your account setup.' : 'Enter your new password below.'}
              </div>
              <div className="form-row">
                <label className="form-label">New password</label>
                <input
                  className="form-input"
                  type="password"
                  required
                  placeholder="At least 12 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
              <div className="form-row">
                <label className="form-label">Confirm password</label>
                <input
                  className="form-input"
                  type="password"
                  required
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>
              {error && <div className="notice notice-warn" style={{ marginBottom: 12 }}>{error}</div>}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                {loading ? 'Saving…' : hashType === 'invite' ? 'Set password & continue' : 'Set new password'}
              </button>
            </form>
          ) : mode === 'login' ? (
            <form onSubmit={handleSignIn}>
              <div className="form-row">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div className="form-row">
                <label className="form-label">Password</label>
                <input
                  className="form-input"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
              {error && <div className="notice notice-warn" style={{ marginBottom: 12 }}>{error}</div>}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent-text)', fontWeight: 600 }}
                  onClick={() => { setMode('forgot'); setError('') }}
                >
                  Forgot password?
                </button>
              </div>
            </form>
          ) : resetSent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📧</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Check your email</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                We've sent a password reset link to <strong>{email}</strong>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setMode('login'); setResetSent(false); setError('') }}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgot}>
              <div className="notice notice-accent" style={{ marginBottom: 14 }}>
                Enter your email and we'll send you a link to reset your password.
              </div>
              <div className="form-row">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              {error && <div className="notice notice-warn" style={{ marginBottom: 12 }}>{error}</div>}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent-text)', fontWeight: 600 }}
                  onClick={() => { setMode('login'); setError('') }}
                >
                  Back to sign in
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
