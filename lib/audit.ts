import { randomUUID } from 'node:crypto'
import { db, type AuditRow } from './db'

// Append-only audit log. Captures every license-affecting action so we
// can answer "who did what when" — either from the admin UI manual
// actions or from the public client API (activate / heartbeat / revoke).

export type AuditAction =
  | 'license.issued'
  | 'license.activated'
  | 'license.heartbeat'
  | 'license.deactivated'
  | 'license.revoked'
  | 'license.seat.kicked'
  | 'license.activation.failed'
  | 'admin.login'
  | 'admin.logout'
  | 'admin.created'
  | 'updates.manifest.published'

export function writeAudit(input: {
  action: AuditAction
  licenseId?: string | null
  actor?: string | null
  details?: Record<string, unknown> | null
}): AuditRow {
  const id = randomUUID()
  const detailsJson = input.details ? JSON.stringify(input.details) : null
  db()
    .prepare(
      'INSERT INTO audit_events (id, action, license_id, actor, details) VALUES (?, ?, ?, ?, ?)'
    )
    .run(id, input.action, input.licenseId ?? null, input.actor ?? null, detailsJson)
  return {
    id,
    action: input.action,
    license_id: input.licenseId ?? null,
    actor: input.actor ?? null,
    details: detailsJson,
    created_at: new Date().toISOString(),
  }
}

export function listAudit(opts?: { limit?: number; licenseId?: string }): AuditRow[] {
  const limit = Math.min(opts?.limit ?? 100, 1000)
  if (opts?.licenseId) {
    return db()
      .prepare('SELECT * FROM audit_events WHERE license_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(opts.licenseId, limit) as AuditRow[]
  }
  return db()
    .prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?')
    .all(limit) as AuditRow[]
}
