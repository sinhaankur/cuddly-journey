import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, type LicenseRow, type SeatRow } from '@/lib/db'
import { hashLicenseKey, isLicenseKeyShape, verifyLicenseKeyChecksum } from '@/lib/keys'
import { signLicenseToken, SOFT_EXPIRY_DAYS } from '@/lib/jwt'
import { writeAudit } from '@/lib/audit'

// POST /api/licenses/heartbeat
//
// Re-validates an existing seat. The desktop client calls this every
// ~6h to slide the soft-expiry window forward. Returns a fresh token
// or a `revoked: true` payload if the license was killed remotely.
//
// We DON'T require the client to send the activation_key — the seat
// fingerprint is enough to identify the seat, and asking for the key
// every 6h is bad operational practice (key would have to be cached
// somewhere). Instead the client's existing JWT carries `sub` (license
// id), which we accept.

const schema = z.object({
  license_id: z.string().min(1).optional(),
  activation_key: z.string().min(1).optional(),
  machine_fingerprint: z.string().min(8),
}).refine((v) => !!v.license_id || !!v.activation_key, {
  message: 'license_id or activation_key required',
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 })
  }
  const { license_id, activation_key, machine_fingerprint } = parsed.data

  let license: LicenseRow | undefined
  if (license_id) {
    license = db().prepare('SELECT * FROM licenses WHERE id = ?').get(license_id) as LicenseRow | undefined
  } else if (activation_key) {
    if (!isLicenseKeyShape(activation_key) || !verifyLicenseKeyChecksum(activation_key)) {
      return NextResponse.json({ error: 'Invalid key format' }, { status: 400 })
    }
    license = db().prepare('SELECT * FROM licenses WHERE key_hash = ?').get(hashLicenseKey(activation_key)) as LicenseRow | undefined
  }

  if (!license) return NextResponse.json({ error: 'Unknown license' }, { status: 404 })
  if (license.is_revoked) {
    return NextResponse.json({ revoked: true, reason: license.revoke_reason ?? 'revoked' }, { status: 403 })
  }
  if (new Date(license.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'License expired' }, { status: 403 })
  }

  const seat = db()
    .prepare('SELECT * FROM license_seats WHERE license_id = ? AND machine_fingerprint = ?')
    .get(license.id, machine_fingerprint) as SeatRow | undefined
  if (!seat) {
    return NextResponse.json({ error: 'Seat not found — re-activate' }, { status: 404 })
  }

  const now = new Date()
  db()
    .prepare('UPDATE license_seats SET last_heartbeat_at = ? WHERE id = ?')
    .run(now.toISOString(), seat.id)

  const token = signLicenseToken({
    sub: license.id,
    customer: license.customer,
    plan: license.plan,
    fingerprint: machine_fingerprint,
    lic_exp: license.expires_at,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor((now.getTime() + SOFT_EXPIRY_DAYS * 86400 * 1000) / 1000),
  })

  writeAudit({
    action: 'license.heartbeat',
    licenseId: license.id,
    details: { fingerprint: machine_fingerprint },
  })

  return NextResponse.json({ token })
}
