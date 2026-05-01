import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { generateKeyPairSync } from 'node:crypto'

// Ed25519 JWT signing matched to what the Tauri client (jsonwebtoken
// crate, Algorithm::EdDSA) expects.
//
// Keys live in ./data/keys/ by default. Override with LICENSE_PRIVATE_KEY
// (PEM string) and LICENSE_PUBLIC_KEY (PEM string) env vars in production
// so secrets aren't on disk.
//
// First boot generates a fresh keypair and prints the public key. Copy
// the public key into the Tauri client's build env (SIGNPORTAL_LICENSE_
// PUBKEY_PEM) so the binary can verify tokens this server issues.

const KEY_DIR = join(process.cwd(), 'data', 'keys')
const PRIVATE_KEY_PATH = join(KEY_DIR, 'license-signing.pem')
const PUBLIC_KEY_PATH = join(KEY_DIR, 'license-signing.pub.pem')

interface KeyMaterial {
  privateKeyPem: string
  publicKeyPem: string
}

let _cached: KeyMaterial | null = null

export function ensureKeys(): KeyMaterial {
  if (_cached) return _cached

  const envPrivate = process.env.LICENSE_PRIVATE_KEY
  const envPublic = process.env.LICENSE_PUBLIC_KEY
  if (envPrivate && envPublic) {
    _cached = { privateKeyPem: envPrivate, publicKeyPem: envPublic }
    return _cached
  }

  if (existsSync(PRIVATE_KEY_PATH) && existsSync(PUBLIC_KEY_PATH)) {
    _cached = {
      privateKeyPem: readFileSync(PRIVATE_KEY_PATH, 'utf8'),
      publicKeyPem: readFileSync(PUBLIC_KEY_PATH, 'utf8'),
    }
    return _cached
  }

  mkdirSync(dirname(PRIVATE_KEY_PATH), { recursive: true })
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const priv = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
  const pub = publicKey.export({ format: 'pem', type: 'spki' }).toString()
  writeFileSync(PRIVATE_KEY_PATH, priv, { mode: 0o600 })
  writeFileSync(PUBLIC_KEY_PATH, pub)
  console.log('[jwt] generated new Ed25519 keypair at', KEY_DIR)
  console.log('[jwt] paste this public key into the Tauri client build env (SIGNPORTAL_LICENSE_PUBKEY_PEM):')
  console.log(pub)

  _cached = { privateKeyPem: priv, publicKeyPem: pub }
  return _cached
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(input: string): Buffer {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4)
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export interface LicenseClaims {
  sub: string                    // license id
  customer: string
  plan: 'basic' | 'pro' | 'enterprise'
  fingerprint: string
  lic_exp?: string               // ISO datetime — license subscription end
  iat: number                    // unix timestamp
  exp: number                    // soft expiry — token re-validation deadline
}

export function signLicenseToken(claims: LicenseClaims): string {
  const { privateKeyPem } = ensureKeys()
  const header = { alg: 'EdDSA', typ: 'JWT' }
  const headerB64 = b64url(JSON.stringify(header))
  const payloadB64 = b64url(JSON.stringify(claims))
  const signingInput = `${headerB64}.${payloadB64}`
  const signature = sign(null, Buffer.from(signingInput), createPrivateKey(privateKeyPem))
  return `${signingInput}.${b64url(signature)}`
}

export function verifyLicenseToken(token: string): LicenseClaims {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('malformed token')
  const [headerB64, payloadB64, sigB64] = parts
  const { publicKeyPem } = ensureKeys()
  const ok = verify(
    null,
    Buffer.from(`${headerB64}.${payloadB64}`),
    createPublicKey(publicKeyPem),
    b64urlDecode(sigB64)
  )
  if (!ok) throw new Error('signature invalid')
  const claims = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as LicenseClaims
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) {
    throw new Error('token expired')
  }
  return claims
}

export const SOFT_EXPIRY_DAYS = 14
