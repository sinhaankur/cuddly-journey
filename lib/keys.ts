import { createHash, randomBytes } from 'node:crypto'

// License key format: SP-XXXX-XXXX-XXXX-XXXX
//
// Five groups of 4 alphanumeric chars (uppercase + digits, ambiguous chars
// like 0/O and 1/I/L removed for human readability). The last group is a
// 4-char checksum derived from the first 4 groups so a typo can be caught
// client-side before hitting the server.
//
// We store only the SHA-256 hash of the key in the database; the raw key
// is shown to the customer once at issuance and never persisted again.

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no I, L, O, 0, 1

function randomGroup(len = 4): string {
  const buf = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) {
    out += ALPHABET[buf[i] % ALPHABET.length]
  }
  return out
}

function checksum(input: string): string {
  // Truncated SHA-256, mapped onto ALPHABET. 4 chars from a 31-symbol
  // alphabet gives ~961k distinct checksums — enough to catch single-char
  // typos with high probability while staying short.
  const hash = createHash('sha256').update(input).digest()
  let out = ''
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[hash[i] % ALPHABET.length]
  }
  return out
}

export function generateLicenseKey(): string {
  const groups = [randomGroup(), randomGroup(), randomGroup(), randomGroup()]
  const body = `SP-${groups.join('-')}`
  const cs = checksum(body)
  return `${body}-${cs}`
}

export function isLicenseKeyShape(input: string): boolean {
  const trimmed = input.trim().toUpperCase()
  return /^SP(?:-[A-Z2-9]{4}){4}$/.test(trimmed)
}

export function verifyLicenseKeyChecksum(input: string): boolean {
  const trimmed = input.trim().toUpperCase()
  if (!isLicenseKeyShape(trimmed)) return false
  const lastDash = trimmed.lastIndexOf('-')
  const body = trimmed.slice(0, lastDash)
  const provided = trimmed.slice(lastDash + 1)
  return checksum(body) === provided
}

export function hashLicenseKey(input: string): string {
  return createHash('sha256').update(input.trim().toUpperCase()).digest('hex')
}

export function keyPrefix(input: string): string {
  // First two groups (SP + first random group) — enough to identify a key
  // for admin display without revealing it. Stored alongside the hash so
  // we can show "SP-A2BC-…" in the admin UI.
  const trimmed = input.trim().toUpperCase()
  const parts = trimmed.split('-')
  return `${parts[0]}-${parts[1]}`
}
