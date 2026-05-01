'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface LicenseDetail {
  license: {
    id: string
    key_prefix: string
    customer: string
    plan: 'basic' | 'pro' | 'enterprise'
    seat_limit: number
    expires_at: string
    is_revoked: boolean
    revoke_reason: string | null
    notes: string | null
    created_at: string
    created_by: string | null
  }
  seats: Array<{
    id: string
    machine_fingerprint: string
    platform: string
    activated_at: string
    last_heartbeat_at: string
  }>
  events: Array<{
    id: string
    action: string
    actor: string | null
    details: string | null
    created_at: string
  }>
}

export default function LicenseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<LicenseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/licenses/${id}`)
      if (!res.ok) throw new Error('Could not load license')
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  const handleRevoke = async () => {
    const reason = window.prompt('Reason for revocation (shown to user on next heartbeat):')
    if (reason === null) return
    try {
      const res = await fetch(`/api/admin/licenses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_revoked: true, revoke_reason: reason || null }),
      })
      if (!res.ok) throw new Error('Could not revoke')
      void load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed')
    }
  }

  const handleKickSeat = async (fingerprint: string) => {
    if (!window.confirm('Kick this seat? The user can re-activate to claim a new one.')) return
    try {
      const res = await fetch(`/api/admin/licenses/${id}/seats?fingerprint=${encodeURIComponent(fingerprint)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Could not kick seat')
      void load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed')
    }
  }

  if (loading) return <div className="text-sm text-muted">Loading…</div>
  if (error || !data) return <div className="rounded-md border border-bad/30 bg-bad/5 p-3 text-sm text-bad">{error ?? 'Not found'}</div>

  const lic = data.license

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/licenses" className="text-xs text-muted hover:text-ink">← All licenses</Link>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-muted">{lic.key_prefix}-…</p>
            <h1 className="mt-1 text-2xl font-semibold">{lic.customer}</h1>
            <p className="mt-1 text-sm text-muted capitalize">{lic.plan} plan · {lic.seat_limit} seat{lic.seat_limit === 1 ? '' : 's'}</p>
          </div>
          <div className="flex items-center gap-2">
            {lic.is_revoked ? <span className="pill-revoked">Revoked</span> : <span className="pill-active">Active</span>}
            {!lic.is_revoked && (
              <button onClick={handleRevoke} className="btn-danger">Revoke</button>
            )}
          </div>
        </div>
      </div>

      {lic.is_revoked && lic.revoke_reason && (
        <div className="card border-bad/30 bg-bad/5 p-4">
          <p className="text-xs font-semibold text-bad uppercase tracking-wider">Revoked</p>
          <p className="mt-1 text-sm text-bad">{lic.revoke_reason}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-mono uppercase tracking-wider text-muted">Seats in use</p>
          <p className="mt-2 text-3xl font-light">{data.seats.length} / {lic.seat_limit}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-mono uppercase tracking-wider text-muted">Expires</p>
          <p className="mt-2 text-sm font-medium">{new Date(lic.expires_at).toLocaleDateString()}</p>
          <p className="text-xs text-muted">{Math.max(0, Math.floor((new Date(lic.expires_at).getTime() - Date.now()) / (86400 * 1000)))} days left</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-mono uppercase tracking-wider text-muted">Created</p>
          <p className="mt-2 text-sm font-medium">{new Date(lic.created_at).toLocaleDateString()}</p>
          {lic.created_by && <p className="text-xs text-muted">by {lic.created_by}</p>}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-line p-4">
          <h2 className="text-sm font-semibold">Active seats</h2>
          <p className="text-xs text-muted">Each row is a machine bound to this license.</p>
        </div>
        {data.seats.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">No seats activated yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink/5 text-xs font-mono uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Fingerprint</th>
                <th className="px-4 py-3 text-left">Platform</th>
                <th className="px-4 py-3 text-left">Activated</th>
                <th className="px-4 py-3 text-left">Last heartbeat</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.seats.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted">{s.machine_fingerprint.slice(0, 24)}…</td>
                  <td className="px-4 py-3 capitalize">{s.platform}</td>
                  <td className="px-4 py-3 text-xs text-muted">{new Date(s.activated_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-muted">{new Date(s.last_heartbeat_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleKickSeat(s.machine_fingerprint)} className="btn-danger">Kick</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-line p-4">
          <h2 className="text-sm font-semibold">Audit trail</h2>
          <p className="text-xs text-muted">Last 50 events for this license.</p>
        </div>
        {data.events.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">No events yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.events.map((e) => {
              const details = e.details ? JSON.parse(e.details) as Record<string, unknown> : null
              return (
                <li key={e.id} className="flex items-start gap-3 p-3">
                  <span className="pill bg-ink/5 text-ink">{e.action}</span>
                  <div className="min-w-0 flex-1">
                    {details && (
                      <p className="truncate text-xs text-muted">
                        {Object.entries(details).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}
                      </p>
                    )}
                    <p className="text-[11px] text-muted">
                      {e.actor && <><span className="font-medium text-ink">{e.actor}</span> · </>}
                      {new Date(e.created_at).toLocaleString()}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
