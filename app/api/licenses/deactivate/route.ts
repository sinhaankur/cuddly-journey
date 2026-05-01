import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { writeAudit } from '@/lib/audit'

// POST /api/licenses/deactivate
//
// Frees a seat from a license, identified solely by machine fingerprint.
// Always returns 200 — even if no matching seat existed. Client uses
// this on uninstall or "move to new machine" flows.

const schema = z.object({
  machine_fingerprint: z.string().min(8),
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
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { machine_fingerprint } = parsed.data

  // Look up affected seats first so the audit log can record which
  // licenses were involved.
  const seats = db()
    .prepare('SELECT id, license_id FROM license_seats WHERE machine_fingerprint = ?')
    .all(machine_fingerprint) as { id: string; license_id: string }[]

  if (seats.length === 0) return NextResponse.json({ ok: true, released: 0 })

  const tx = db().transaction(() => {
    for (const seat of seats) {
      db().prepare('DELETE FROM license_seats WHERE id = ?').run(seat.id)
      writeAudit({
        action: 'license.deactivated',
        licenseId: seat.license_id,
        details: { fingerprint: machine_fingerprint, seatId: seat.id },
      })
    }
  })
  tx()

  return NextResponse.json({ ok: true, released: seats.length })
}
