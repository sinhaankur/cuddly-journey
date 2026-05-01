# Architecture

## Trust boundaries

```
┌─────────────────────────────────────────────────────────────┐
│  Desktop client (Tauri 2)                                    │
│  • Holds the embedded Ed25519 PUBLIC key.                    │
│  • Cannot mint tokens. Can only verify them.                 │
│  • Stores the activation token in OS keychain.               │
└────────────────────────┬─────────────────────────────────────┘
                         │ POST /api/licenses/{activate,heartbeat,deactivate}
                         │ TLS-required.
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  License server (this project)                               │
│  • Holds the Ed25519 PRIVATE key.                            │
│  • Hashes activation keys; stores hash + first 8 chars.      │
│  • SQLite WAL for the DB, journaled to disk.                 │
│  • Bcrypt-hashed admin sessions.                             │
└─────────────────────────────────────────────────────────────┘
```

The server's job is to be the **only thing in the world** that can
produce valid activation tokens. The desktop client's job is to verify
they were minted by exactly this server (via the embedded pubkey)
and bound to its own machine fingerprint.

## Threat model — what we protect

| Threat | Mitigation |
| --- | --- |
| Stolen activation key reused on N machines | Per-license `seat_limit`, fingerprint binding, admin can kick |
| Database leak | Keys stored hashed. An attacker gets `key_hash` + customer metadata; cannot mint tokens without the private key |
| Compromised license server (RCE) | Only this attack lets the adversary mint tokens. Keep the signing key in a secrets manager, rotate on incident |
| Compromised CDN / man-in-the-middle | TLS-required. Token signature verified locally before trust |
| Stolen admin password | Bcrypt cost 12, session timeout, audit log shows every action |
| Activation key brute-force | 4 groups × 31 chars = 31^16 ≈ 4 × 10^23 keyspace. Rate limit at the LB if you want belt + suspenders |

## What we DON'T protect against

- **Compromised desktop client (binary patching)**. If an attacker
  modifies the Tauri binary to skip JWT verification, no server-side
  protection helps. This is fundamentally why code-signing matters at
  the OS level.
- **Stolen device with valid token**. Whoever has the token + matching
  machine has access for the remainder of the soft-expiry window.
  Mitigate via shorter `SOFT_EXPIRY_DAYS` and faster heartbeat cadence.

## Data model

```
licenses (1) ─── (N) license_seats
   │
   └── (N) audit_events

admin_users (1) ─── (N) admin_sessions

updates_manifest (singleton, id=1)
```

### `licenses`
- `key_hash` (UNIQUE): SHA-256 of the uppercased activation key
- `key_prefix`: first 8 chars (`SP-XXXX`) for admin display
- `customer`, `plan`, `seat_limit`, `expires_at`
- `is_revoked`, `revoke_reason`, `notes`
- `created_at`, `created_by`

### `license_seats`
- `(license_id, machine_fingerprint)` UNIQUE — idempotent re-activation
- `platform` (darwin / windows / linux)
- `activated_at` (immutable), `last_heartbeat_at` (sliding)

### `audit_events`
- Append-only. Indexed by `license_id` and `created_at`.
- Action types: `license.{issued,activated,heartbeat,deactivated,revoked}`,
  `license.activation.failed`, `license.seat.kicked`, `admin.{login,logout,created}`,
  `updates.manifest.published`

### `updates_manifest`
- Singleton row. Admin sets `latest_version` + `platforms_json`. The
  Tauri updater feed reads this on every poll.

## JWT shape

The activation token is a standard JWT (header.payload.signature):

```json
{
  "alg": "EdDSA",
  "typ": "JWT"
}
.
{
  "sub": "license-uuid-here",
  "customer": "Acme Inc",
  "plan": "pro",
  "fingerprint": "sha256-of-machine-uid-hex",
  "lic_exp": "2027-05-01T00:00:00Z",
  "iat": 1714896000,
  "exp": 1716105600
}
.
<Ed25519 signature over header.payload>
```

The desktop client's verifier (`Algorithm::EdDSA` in the `jsonwebtoken`
Rust crate) checks signature, `exp`, and that `fingerprint` matches the
device. Mismatched fingerprint → soft-lock with `fingerprint_mismatch`
reason.

## Migration to Postgres

When SQLite stops being enough (probably never, but plan for it):

1. The schema in `lib/db.ts` is plain SQL. Translate `INTEGER` (used as
   boolean) and `TEXT` (used as ISO datetime) to Postgres `BOOLEAN` and
   `TIMESTAMPTZ`.
2. Replace `better-sqlite3` with `pg` in `lib/db.ts`. Every call site
   uses `.prepare(...).get/all/run(...)` — straightforward to swap.
3. Migrations: keep the `pragma user_version` pattern, just store the
   version in a `schema_meta` table instead.
4. Connection pooling: SQLite is single-process; Postgres needs a pool.
   `pg-pool` is fine.

The interface every API route uses (`db()`) doesn't change. The swap
is contained to `lib/db.ts`.
