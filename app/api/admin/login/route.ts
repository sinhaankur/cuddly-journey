import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { findAdminByEmail, startSession, verifyAdminPassword } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
  const { email, password } = parsed.data

  const user = findAdminByEmail(email)
  if (!user || !(await verifyAdminPassword(user, password))) {
    // Generic message — don't reveal which half was wrong.
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  await startSession(user.id)
  writeAudit({ action: 'admin.login', actor: user.email })
  return NextResponse.json({ ok: true })
}
