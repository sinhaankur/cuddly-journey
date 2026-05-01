import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/auth'
import { listAudit } from '@/lib/audit'

export default async function AdminDashboardPage() {
  const cur = await getCurrentAdmin()
  if (!cur) redirect('/admin/login')

  const stats = db()
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM licenses WHERE is_revoked = 0) AS active_licenses,
        (SELECT COUNT(*) FROM licenses WHERE is_revoked = 1) AS revoked_licenses,
        (SELECT COUNT(*) FROM license_seats) AS total_seats,
        (SELECT COUNT(DISTINCT machine_fingerprint) FROM license_seats) AS unique_machines,
        (SELECT COUNT(*) FROM licenses WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days') AND is_revoked = 0) AS expiring_soon
      `
    )
    .get() as {
      active_licenses: number
      revoked_licenses: number
      total_seats: number
      unique_machines: number
      expiring_soon: number
    }

  const recentEvents = listAudit({ limit: 8 })

  const tiles = [
    { label: 'Active licenses', value: stats.active_licenses, hint: 'Not revoked' },
    { label: 'Active seats', value: stats.total_seats, hint: 'Across all licenses' },
    { label: 'Unique machines', value: stats.unique_machines, hint: 'Distinct fingerprints' },
    { label: 'Expiring in 30 days', value: stats.expiring_soon, hint: 'Active and approaching renewal' },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-muted">Overview</p>
          <h1 className="mt-1 text-2xl font-semibold">License management</h1>
          <p className="mt-1 text-sm text-muted">Issue keys, monitor activations, revoke seats.</p>
        </div>
        <Link href="/admin/licenses" className="btn-primary">
          Issue a license →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map((t, i) => (
          <div key={t.label} className={`card p-5 ${i === 0 ? 'bg-ink text-canvas border-ink' : ''}`}>
            <p className={`text-xs font-mono uppercase tracking-wider ${i === 0 ? 'text-canvas/70' : 'text-muted'}`}>{t.label}</p>
            <p className="mt-2 text-4xl font-light">{t.value}</p>
            <p className={`mt-1 text-xs ${i === 0 ? 'text-canvas/70' : 'text-muted'}`}>{t.hint}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center justify-between border-b border-line p-5">
          <div>
            <h2 className="text-sm font-semibold">Recent activity</h2>
            <p className="text-xs text-muted">Last 8 audit events. <Link href="/admin/audit" className="underline-offset-2 hover:underline">Full log →</Link></p>
          </div>
        </div>
        {recentEvents.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">No activity yet. Issue a license to get started.</p>
        ) : (
          <ul className="divide-y divide-line">
            {recentEvents.map((e) => {
              const details = e.details ? JSON.parse(e.details) as Record<string, unknown> : null
              return (
                <li key={e.id} className="flex items-start gap-3 p-4">
                  <span className="pill bg-ink/5 text-ink">{e.action}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted truncate">
                      {e.actor && <span className="font-medium text-ink">{e.actor}</span>}
                      {details && (
                        <span> · {Object.entries(details).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')}</span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted">{new Date(e.created_at).toLocaleString()}</p>
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
