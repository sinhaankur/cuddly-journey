import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, type LicenseRow, type SeatRow, type AuditRow } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/auth'
import { writeAudit, listAudit } from '@/lib/audit'

interface RouteContext {
  params: Promise<{ id: string }>
}

const patchSchema = z.object({
  is_revoked: z.boolean().optional(),
  revoke_reason: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  seat_limit: z.number().int().positive().max(10000).optional(),
  expires_at: z.string().datetime().optional(),
})

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const cur = await getCurrentAdmin()
  if (!cur) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { id } = await params
  const license = db().prepare('SELECT * FROM licenses WHERE id = ?').get(id) as LicenseRow | undefined
  if (!license) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const seats = db()
    .prepare('SELECT * FROM license_seats WHERE license_id = ? ORDER BY activated_at DESC')
    .all(id) as SeatRow[]
  const events = listAudit({ licenseId: id, limit: 50 })

  return NextResponse.json({
    license: {
      id: license.id,
      key_prefix: license.key_prefix,
      customer: license.customer,
      plan: license.plan,
      seat_limit: license.seat_limit,
      expires_at: license.expires_at,
      is_revoked: license.is_revoked === 1,
      revoke_reason: license.revoke_reason,
      notes: license.notes,
      created_at: license.created_at,
      created_by: license.created_by,
    },
    seats,
    events,
  })
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const cur = await getCurrentAdmin()
  if (!cur) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { id } = await params
  const license = db().prepare('SELECT * FROM licenses WHERE id = ?').get(id) as LicenseRow | undefined
  if (!license) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 })
  }

  const updates: string[] = []
  const values: unknown[] = []
  if (parsed.data.is_revoked !== undefined) {
    updates.push('is_revoked = ?')
    values.push(parsed.data.is_revoked ? 1 : 0)
  }
  if (parsed.data.revoke_reason !== undefined) {
    updates.push('revoke_reason = ?')
    values.push(parsed.data.revoke_reason)
  }
  if (parsed.data.notes !== undefined) {
    updates.push('notes = ?')
    values.push(parsed.data.notes)
  }
  if (parsed.data.seat_limit !== undefined) {
    updates.push('seat_limit = ?')
    values.push(parsed.data.seat_limit)
  }
  if (parsed.data.expires_at !== undefined) {
    updates.push('expires_at = ?')
    values.push(parsed.data.expires_at)
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  values.push(id)
  db().prepare(`UPDATE licenses SET ${updates.join(', ')} WHERE id = ?`).run(...values as never[])

  if (parsed.data.is_revoked === true && license.is_revoked === 0) {
    writeAudit({
      action: 'license.revoked',
      licenseId: id,
      actor: cur.user.email,
      details: { reason: parsed.data.revoke_reason ?? null },
    })
  }

  return NextResponse.json({ ok: true })
}
