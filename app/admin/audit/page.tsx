'use client'

import { useEffect, useState } from 'react'

interface AuditEvent {
  id: string
  action: string
  license_id: string | null
  actor: string | null
  details: string | null
  created_at: string
}

const ACTION_LABELS: Record<string, string> = {
  'license.issued': 'Issued',
  'license.activated': 'Activated',
  'license.heartbeat': 'Heartbeat',
  'license.deactivated': 'Deactivated',
  'license.revoked': 'Revoked',
  'license.seat.kicked': 'Seat kicked',
  'license.activation.failed': 'Activation failed',
  'admin.login': 'Admin login',
  'admin.logout': 'Admin logout',
  'admin.created': 'Admin created',
  'updates.manifest.published': 'Update published',
}

export default function AuditPage() {
  const [items, setItems] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    fetch('/api/admin/audit')
      .then((r) => r.json())
      .then((b: { items: AuditEvent[] }) => setItems(b.items))
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? items : items.filter((i) => i.action === filter)
  const actions = Array.from(new Set(items.map((i) => i.action))).sort()

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-muted">Activity</p>
        <h1 className="mt-1 text-2xl font-semibold">Audit log</h1>
        <p className="mt-1 text-sm text-muted">Append-only record of every license-affecting action. Last 200 events.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`pill ${filter === 'all' ? 'bg-ink text-canvas' : 'bg-ink/5 text-ink'}`}
        >
          All ({items.length})
        </button>
        {actions.map((a) => (
          <button
            key={a}
            onClick={() => setFilter(a)}
            className={`pill ${filter === a ? 'bg-ink text-canvas' : 'bg-ink/5 text-ink'}`}
          >
            {ACTION_LABELS[a] ?? a} ({items.filter((i) => i.action === a).length})
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <p className="p-12 text-center text-sm text-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            {filter === 'all' ? 'No activity yet.' : 'Nothing matches this filter.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((e) => {
              const details = e.details ? JSON.parse(e.details) as Record<string, unknown> : null
              return (
                <li key={e.id} className="flex items-start gap-3 p-4">
                  <span className="pill bg-ink/5 text-ink min-w-[100px]">{ACTION_LABELS[e.action] ?? e.action}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {e.actor && <span className="font-medium">{e.actor}</span>}
                      {e.actor && details && <span className="text-muted"> · </span>}
                      {details && (
                        <span className="text-xs text-muted">
                          {Object.entries(details).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted">
                      {new Date(e.created_at).toLocaleString()}
                      {e.license_id && (
                        <> · <a href={`/admin/licenses/${e.license_id}`} className="hover:underline">view license</a></>
                      )}
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
