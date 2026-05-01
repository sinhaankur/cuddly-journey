import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getCurrentAdmin } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'

interface RouteContext {
  params: Promise<{ id: string }>
}

// DELETE /api/admin/licenses/:id/seats?fingerprint=...
//
// Kicks a specific seat from a license. The seat's binding to its
// machine is broken; the user can re-activate to claim a new seat
// (counted as a fresh activation).

const deleteSchema = z.object({
  fingerprint: z.string().min(8),
})

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const cur = await getCurrentAdmin()
  if (!cur) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { id } = await params
  const fingerprint = req.nextUrl.searchParams.get('fingerprint') ?? ''
  const parsed = deleteSchema.safeParse({ fingerprint })
  if (!parsed.success) {
    return NextResponse.json({ error: 'fingerprint query param required' }, { status: 400 })
  }

  const result = db()
    .prepare('DELETE FROM license_seats WHERE license_id = ? AND machine_fingerprint = ?')
    .run(id, parsed.data.fingerprint)

  if (result.changes === 0) {
    return NextResponse.json({ error: 'Seat not found' }, { status: 404 })
  }

  writeAudit({
    action: 'license.seat.kicked',
    licenseId: id,
    actor: cur.user.email,
    details: { fingerprint: parsed.data.fingerprint },
  })

  return NextResponse.json({ ok: true })
}
