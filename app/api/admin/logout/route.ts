import { NextResponse } from 'next/server'
import { endSession, getCurrentAdmin } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'

export async function POST() {
  const cur = await getCurrentAdmin()
  if (cur) writeAudit({ action: 'admin.logout', actor: cur.user.email })
  await endSession()
  return NextResponse.json({ ok: true })
}
