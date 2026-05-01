import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import { cookies } from 'next/headers'
import { db, type AdminUserRow, type SessionRow } from './db'

// Admin auth: bcrypt-hashed password + opaque session cookie. Sessions
// are server-side rows; client only sees the random session id. Cookies
// are httpOnly + sameSite=lax + secure-when-https.

const SESSION_COOKIE = 'license_admin_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const BCRYPT_ROUNDS = 12

export async function createAdminUser(email: string, password: string): Promise<AdminUserRow> {
  const id = randomUUID()
  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  const stmt = db().prepare(
    'INSERT INTO admin_users (id, email, password_hash) VALUES (?, ?, ?)'
  )
  stmt.run(id, email.trim().toLowerCase(), password_hash)
  return findAdminByEmail(email)!
}

export function findAdminByEmail(email: string): AdminUserRow | null {
  const row = db()
    .prepare('SELECT * FROM admin_users WHERE email = ?')
    .get(email.trim().toLowerCase()) as AdminUserRow | undefined
  return row ?? null
}

export async function verifyAdminPassword(user: AdminUserRow, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash)
}

export async function startSession(userId: string): Promise<string> {
  const sessionId = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  db()
    .prepare('INSERT INTO admin_sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sessionId, userId, expiresAt)
  // Best-effort GC of expired sessions on each login. Cheap; runs once
  // per ~7 days per admin.
  db().prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(new Date().toISOString())

  const jar = await cookies()
  jar.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
  return sessionId
}

export async function endSession(): Promise<void> {
  const jar = await cookies()
  const sid = jar.get(SESSION_COOKIE)?.value
  if (sid) {
    db().prepare('DELETE FROM admin_sessions WHERE id = ?').run(sid)
  }
  jar.delete(SESSION_COOKIE)
}

export interface CurrentAdmin {
  user: AdminUserRow
  session: SessionRow
}

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const jar = await cookies()
  const sid = jar.get(SESSION_COOKIE)?.value
  if (!sid) return null

  const session = db()
    .prepare('SELECT * FROM admin_sessions WHERE id = ?')
    .get(sid) as SessionRow | undefined
  if (!session) return null
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db().prepare('DELETE FROM admin_sessions WHERE id = ?').run(sid)
    return null
  }

  const user = db()
    .prepare('SELECT * FROM admin_users WHERE id = ?')
    .get(session.user_id) as AdminUserRow | undefined
  if (!user) return null

  return { user, session }
}

export async function requireAdmin(): Promise<CurrentAdmin> {
  const cur = await getCurrentAdmin()
  if (!cur) throw new Error('UNAUTHENTICATED')
  return cur
}
