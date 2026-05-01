import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db, type LicenseRow } from '@/lib/db'
import { generateLicenseKey, hashLicenseKey, keyPrefix } from '@/lib/keys'
import { getCurrentAdmin } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'

const createSchema = z.object({
  customer: z.string().trim().min(1).max(120),
  plan: z.enum(['basic', 'pro', 'enterprise']),
  seat_limit: z.number().int().positive().max(10000),
  expires_at: z.string().datetime(),
  notes: z.string().max(1000).optional(),
})

interface LicenseListItem {
  id: string
  key_prefix: string
  customer: string
  plan: string
  seat_limit: number
  seat_count: number
  expires_at: string
  is_revoked: boolean
  created_at: string
}

interface LicenseCreatedResponse extends LicenseListItem {
  raw_key: string
}

export async function GET() {
  const cur = await getCurrentAdmin()
  if (!cur) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const rows = db()
    .prepare(
      `SELECT
         l.id, l.key_prefix, l.customer, l.plan, l.seat_limit, l.expires_at, l.is_revoked, l.created_at,
         (SELECT COUNT(*) FROM license_seats s WHERE s.license_id = l.id) AS seat_count
       FROM licenses l
       ORDER BY l.created_at DESC`
    )
    .all() as Array<LicenseRow & { seat_count: number }>

  const items: LicenseListItem[] = rows.map((r) => ({
    id: r.id,
    key_prefix: r.key_prefix,
    customer: r.customer,
    plan: r.plan,
    seat_limit: r.seat_limit,
    seat_count: r.seat_count,
    expires_at: r.expires_at,
    is_revoked: r.is_revoked === 1,
    created_at: r.created_at,
  }))
  return NextResponse.json({ items, total: items.length })
}

export async function POST(req: NextRequest) {
  const cur = await getCurrentAdmin()
  if (!cur) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 })
  }

  const id = randomUUID()
  const rawKey = generateLicenseKey()
  const keyHash = hashLicenseKey(rawKey)
  const prefix = keyPrefix(rawKey)

  db()
    .prepare(
      `INSERT INTO licenses (id, key_hash, key_prefix, customer, plan, seat_limit, expires_at, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      keyHash,
      prefix,
      parsed.data.customer,
      parsed.data.plan,
      parsed.data.seat_limit,
      parsed.data.expires_at,
      parsed.data.notes ?? null,
      cur.user.email
    )

  writeAudit({
    action: 'license.issued',
    licenseId: id,
    actor: cur.user.email,
    details: { customer: parsed.data.customer, plan: parsed.data.plan, seat_limit: parsed.data.seat_limit },
  })

  // Raw key returned ONCE here; never persisted in plaintext, never
  // shown again. The admin UI must save / display it immediately.
  const response: LicenseCreatedResponse = {
    id,
    key_prefix: prefix,
    customer: parsed.data.customer,
    plan: parsed.data.plan,
    seat_limit: parsed.data.seat_limit,
    seat_count: 0,
    expires_at: parsed.data.expires_at,
    is_revoked: false,
    created_at: new Date().toISOString(),
    raw_key: rawKey,
  }
  return NextResponse.json(response, { status: 201 })
}
