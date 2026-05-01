'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface LicenseListItem {
  id: string
  key_prefix: string
  customer: string
  plan: 'basic' | 'pro' | 'enterprise'
  seat_limit: number
  seat_count: number
  expires_at: string
  is_revoked: boolean
  created_at: string
}

interface NewLicenseResponse extends LicenseListItem {
  raw_key: string
}

export default function LicensesPage() {
  const [items, setItems] = useState<LicenseListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState<NewLicenseResponse | null>(null)

  // Issue form
  const [customer, setCustomer] = useState('')
  const [plan, setPlan] = useState<'basic' | 'pro' | 'enterprise'>('pro')
  const [seatLimit, setSeatLimit] = useState(5)
  const [validityDays, setValidityDays] = useState(365)
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/licenses')
      if (!res.ok) throw new Error('Could not load licenses')
      const body = await res.json() as { items: LicenseListItem[] }
      setItems(body.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const expires_at = new Date(Date.now() + validityDays * 86400 * 1000).toISOString()
      const res = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer, plan, seat_limit: seatLimit, expires_at }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Could not issue license')
      }
      const created = await res.json() as NewLicenseResponse
      setNewKey(created)
      setShowForm(false)
      setCustomer('')
      void load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-muted">Licenses</p>
          <h1 className="mt-1 text-2xl font-semibold">All licenses</h1>
          <p className="mt-1 text-sm text-muted">Issue, monitor, and revoke activation keys.</p>
        </div>
        <button onClick={() => { setShowForm((v) => !v); setError(null) }} className="btn-primary">
          {showForm ? 'Close' : 'Issue license'}
        </button>
      </div>

      {newKey && (
        <div className="card border-accent bg-accent/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">New license issued</p>
          <p className="mt-2 text-sm text-ink">
            Copy the activation key now. <strong>It is shown only once</strong> — only its hash is stored.
          </p>
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-ink p-3">
            <code className="flex-1 break-all font-mono text-sm text-canvas">{newKey.raw_key}</code>
            <button
              onClick={() => navigator.clipboard.writeText(newKey.raw_key)}
              className="rounded-md bg-canvas/10 px-3 py-1.5 text-xs text-canvas hover:bg-canvas/20"
            >
              Copy
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-muted">
              Customer: <strong>{newKey.customer}</strong> · Plan: <strong>{newKey.plan}</strong> · Seats: <strong>{newKey.seat_limit}</strong>
            </p>
            <button onClick={() => setNewKey(null)} className="text-xs text-muted hover:text-ink">Dismiss</button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleIssue} className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold">Issue a new license</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Customer name</label>
              <input value={customer} onChange={(e) => setCustomer(e.target.value)} className="input" required disabled={submitting} placeholder="Acme Inc." />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Plan</label>
              <select value={plan} onChange={(e) => setPlan(e.target.value as 'basic' | 'pro' | 'enterprise')} className="input" disabled={submitting}>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Seat limit</label>
              <input type="number" min={1} max={10000} value={seatLimit} onChange={(e) => setSeatLimit(parseInt(e.target.value, 10) || 1)} className="input" disabled={submitting} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Valid for (days)</label>
              <input type="number" min={1} max={3650} value={validityDays} onChange={(e) => setValidityDays(parseInt(e.target.value, 10) || 1)} className="input" disabled={submitting} />
            </div>
          </div>
          {error && <p className="rounded-md border border-bad/30 bg-bad/5 px-3 py-2 text-xs text-bad">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary" disabled={submitting}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting || !customer.trim()}>
              {submitting ? 'Issuing…' : 'Issue license'}
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium">No licenses yet</p>
            <p className="mt-1 text-xs text-muted">Click <strong>Issue license</strong> to create your first activation key.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink/5 text-xs font-mono uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Key</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">Seats</th>
                <th className="px-4 py-3 text-left">Expires</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-ink/[0.02]">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/admin/licenses/${item.id}`} className="hover:underline">{item.key_prefix}-…</Link>
                  </td>
                  <td className="px-4 py-3">{item.customer}</td>
                  <td className="px-4 py-3 capitalize">{item.plan}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {item.seat_count} / {item.seat_limit}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{new Date(item.expires_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {item.is_revoked
                      ? <span className="pill-revoked">Revoked</span>
                      : new Date(item.expires_at).getTime() < Date.now()
                      ? <span className="pill-expired">Expired</span>
                      : <span className="pill-active">Active</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
