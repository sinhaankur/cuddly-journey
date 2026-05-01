import { NextResponse } from 'next/server'
import { listAudit } from '@/lib/audit'
import { getCurrentAdmin } from '@/lib/auth'

export async function GET() {
  const cur = await getCurrentAdmin()
  if (!cur) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  return NextResponse.json({ items: listAudit({ limit: 200 }) })
}
