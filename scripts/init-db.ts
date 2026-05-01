// One-shot bootstrap. Run via `npm run db:init`. Idempotent — safe to
// re-run; it only creates the admin user if no rows exist.
//
// Pulls credentials from env (ADMIN_EMAIL, ADMIN_PASSWORD) or prompts
// for them interactively.

import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import bcrypt from 'bcrypt'
import { db } from '../lib/db'
import { ensureKeys } from '../lib/jwt'
import { writeAudit } from '../lib/audit'

async function ask(question: string, opts?: { silent?: boolean }): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  if (opts?.silent) {
    // best-effort silent input — disable echo, restore on close
    process.stdout.write(question)
    return new Promise<string>((resolve) => {
      const stdin = process.stdin as NodeJS.ReadStream & { setRawMode?: (raw: boolean) => void }
      stdin.setRawMode?.(true)
      let buf = ''
      const onData = (key: Buffer) => {
        const ch = key.toString('utf8')
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode?.(false)
          process.stdin.removeListener('data', onData)
          process.stdout.write('\n')
          rl.close()
          resolve(buf)
        } else if (ch === '') {
          process.exit(130)
        } else if (ch === '') {
          buf = buf.slice(0, -1)
        } else {
          buf += ch
        }
      }
      process.stdin.on('data', onData)
    })
  }
  const ans = await rl.question(question)
  rl.close()
  return ans
}

async function main() {
  console.log('SignPortal License Server — initial bootstrap\n')

  // 1. Ensure DB + migrations.
  db()
  console.log('  ✓ database initialized')

  // 2. Ensure signing keypair.
  const { publicKeyPem } = ensureKeys()
  console.log('  ✓ signing keypair ready')

  // 3. Seed admin if none exists.
  const existing = (db().prepare('SELECT COUNT(*) as n FROM admin_users').get() as { n: number }).n
  if (existing > 0) {
    console.log(`  ✓ ${existing} admin account(s) already present — skipping admin creation\n`)
    console.log('License server public key (paste into the desktop client build env):\n')
    console.log(publicKeyPem)
    return
  }

  let email = process.env.ADMIN_EMAIL ?? ''
  let password = process.env.ADMIN_PASSWORD ?? ''
  if (!email) email = await ask('Admin email: ')
  if (!password) password = await ask('Admin password (input hidden): ', { silent: true })

  if (!email || !password) {
    console.error('\nemail and password required')
    process.exit(1)
  }
  if (password.length < 12) {
    console.error('\npassword must be at least 12 characters')
    process.exit(1)
  }

  const id = randomUUID()
  const password_hash = await bcrypt.hash(password, 12)
  db()
    .prepare('INSERT INTO admin_users (id, email, password_hash) VALUES (?, ?, ?)')
    .run(id, email.trim().toLowerCase(), password_hash)
  writeAudit({ action: 'admin.created', actor: email, details: { id } })
  console.log(`\n  ✓ admin user created: ${email}`)
  console.log('\nLicense server public key (paste into the desktop client build env):\n')
  console.log(publicKeyPem)
  console.log('Done. Start the server with `npm run dev`.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
