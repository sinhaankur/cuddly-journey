import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db, type LicenseRow, type SeatRow } from '@/lib/db'
import { hashLicenseKey, isLicenseKeyShape, verifyLicenseKeyChecksum } from '@/lib/keys'
import { signLicenseToken, SOFT_EXPIRY_DAYS } from '@/lib/jwt'
import { writeAudit } from '@/lib/audit'

// POST /api/licenses/activate
//
// Body: { activation_key, machine_fingerprint, platform }
// Returns: { token } — a 14-day Ed25519-signed JWT bound to this fingerprint
//
// Idempotent: re-activating from the same fingerprint refreshes the
// token without claiming a new seat.

const schema = z.object({
  activation_key: z.string().min(1),
  machine_fingerprint: z.string().min(8),
  platform: z.string().min(1).max(40),
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
  const { activation_key, machine_fingerprint, platform } = parsed.data

  if (!isLicenseKeyShape(activation_key) || !verifyLicenseKeyChecksum(activation_key)) {
    writeAudit({
      action: 'license.activation.failed',
      details: { reason: 'malformed_key', fingerprint: machine_fingerprint },
    })
    return NextResponse.json({ error: 'Invalid key format' }, { status: 400 })
  }

  const license = db()
    .prepare('SELECT * FROM licenses WHERE key_hash = ?')
    .get(hashLicenseKey(activation_key)) as LicenseRow | undefined

  if (!license) {
    writeAudit({
      action: 'license.activation.failed',
      details: { reason: 'unknown_key', fingerprint: machine_fingerprint },
    })
    return NextResponse.json({ error: 'Unknown activation key' }, { status: 404 })
  }
  if (license.is_revoked) {
    writeAudit({
      action: 'license.activation.failed',
      licenseId: license.id,
      details: { reason: 'revoked', fingerprint: machine_fingerprint },
    })
    return NextResponse.json({ error: 'License revoked' }, { status: 403 })
  }
  if (new Date(license.expires_at).getTime() < Date.now()) {
    writeAudit({
      action: 'license.activation.failed',
      licenseId: license.id,
      details: { reason: 'expired', fingerprint: machine_fingerprint },
    })
    return NextResponse.json({ error: 'License expired' }, { status: 403 })
  }

  const existingSeat = db()
    .prepare('SELECT * FROM license_seats WHERE license_id = ? AND machine_fingerprint = ?')
    .get(license.id, machine_fingerprint) as SeatRow | undefined

  if (!existingSeat) {
    const seatCount = (db()
      .prepare('SELECT COUNT(*) as n FROM license_seats WHERE license_id = ?')
      .get(license.id) as { n: number }).n
    if (seatCount >= license.seat_limit) {
      writeAudit({
        action: 'license.activation.failed',
        licenseId: license.id,
        details: { reason: 'seat_limit_reached', fingerprint: machine_fingerprint, seatCount, seatLimit: license.seat_limit },
      })
      return NextResponse.json(
        { error: `Seat limit reached (${license.seat_limit})` },
        { status: 409 }
      )
    }
  }

  const now = new Date()
  const seatId = existingSeat?.id ?? randomUUID()

  // Upsert the seat. INSERT OR REPLACE preserves the activation timestamp
  // when re-activating from the same fingerprint (idempotent re-activation).
  db()
    .prepare(
      `INSERT INTO license_seats (id, license_id, machine_fingerprint, platform, activated_at, last_heartbeat_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(license_id, machine_fingerprint) DO UPDATE SET
         platform = excluded.platform,
         last_heartbeat_at = excluded.last_heartbeat_at`
    )
    .run(
      seatId,
      license.id,
      machine_fingerprint,
      platform,
      existingSeat?.activated_at ?? now.toISOString(),
      now.toISOString()
    )

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
    action: 'license.activated',
    licenseId: license.id,
    details: { fingerprint: machine_fingerprint, platform, reactivation: !!existingSeat },
  })

  return NextResponse.json({ token })
}
