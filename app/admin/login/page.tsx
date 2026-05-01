'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Login is a "naked" page — no admin shell, just a focused single-form
// surface. The admin layout's auth-gate skips its chrome when the user
// is unauthenticated, so this renders with just the page content.

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Login failed')
      }
      router.replace('/admin')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-6">
      <div className="card w-full max-w-md p-8">
        <div className="mb-8 flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-ink text-canvas font-mono text-sm">SP</span>
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-muted">License Server</p>
            <h1 className="text-lg font-semibold">Admin sign in</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-muted">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              autoFocus
              required
              disabled={submitting}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-muted">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              required
              disabled={submitting}
            />
          </div>
          {error && (
            <p className="rounded-md border border-bad/30 bg-bad/5 px-3 py-2 text-xs text-bad">{error}</p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-[11px] text-muted">
          First time? Run <code className="rounded bg-ink/5 px-1.5 py-0.5 font-mono">npm run db:init</code>{' '}
          to seed the initial admin account.
        </p>
      </div>
    </div>
  )
}
