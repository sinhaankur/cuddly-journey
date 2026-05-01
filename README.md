# SignPortal License Server

Self-hosted license + activation + auto-update server for **SignPortal Desktop**.
Single Next.js process, SQLite-backed, deployable as one container.

📄 **Site:** https://sinhaankur.github.io/cuddly-journey/

## What this gives you

- **Issue activation keys** in the format `SP-XXXX-XXXX-XXXX-XXXX` with checksum
- **Sign Ed25519 JWTs** that the desktop client verifies against an embedded pubkey
- **Track seats** per license — hard cap, idempotent re-activation, admin-kick
- **Tauri 2 auto-updater feed** at `/api/updates/desktop/{target}/{current}`
- **Append-only audit log** of every issuance, activation, heartbeat, revocation
- **Admin web UI** for issuing / monitoring / revoking — bcrypt + session cookies

## Quickstart

```bash
git clone https://github.com/sinhaankur/cuddly-journey.git
cd cuddly-journey
npm install

# Initialise the SQLite DB, generate the Ed25519 signing keypair,
# and seed your first admin user (prompts for email + password).
npm run db:init

# Print the license-signing public key to paste into the desktop
# client's build env (SIGNPORTAL_LICENSE_PUBKEY_PEM).
npm run keys:generate

# Start the server.
npm run dev    # http://localhost:3000
```

The admin UI is at `/admin`. Sign in with the email + password you set
during `db:init`.

## Public API (called by the desktop client)

| Endpoint | Purpose |
| --- | --- |
| `POST /api/licenses/activate` | Claim a seat, return a 14-day Ed25519 JWT bound to the device fingerprint |
| `POST /api/licenses/heartbeat` | Refresh the token, surface remote revocation |
| `POST /api/licenses/deactivate` | Free a seat (uninstall, machine move) |
| `GET /api/updates/desktop/{target}/{current}` | Tauri 2 updater manifest |

## Admin API (cookie-authenticated)

| Endpoint | Purpose |
| --- | --- |
| `POST /api/admin/login` | Bcrypt verify, set session cookie |
| `POST /api/admin/logout` | Clear session |
| `GET /api/admin/licenses` | List all licenses with seat counts |
| `POST /api/admin/licenses` | Issue a new key — raw key returned **once** |
| `GET /api/admin/licenses/{id}` | Detail: license + seats + audit |
| `PATCH /api/admin/licenses/{id}` | Revoke / extend / edit notes |
| `DELETE /api/admin/licenses/{id}/seats?fingerprint=…` | Kick a seat |
| `GET /api/admin/audit` | Last 200 audit events |

## Architecture

- **Next.js 15** (App Router, server components for the admin UI)
- **better-sqlite3** — synchronous, single-process, WAL mode. Migrations
  via `pragma user_version`. Swap-in path to Postgres documented in `lib/db.ts`.
- **Ed25519 JWT** — `node:crypto` for sign/verify; matches the desktop
  client's `jsonwebtoken` Rust crate (`Algorithm::EdDSA`).
- **bcrypt** at cost 12 for admin passwords.
- **httpOnly + sameSite=lax + secure-when-https** session cookies.

The trust boundary lives at the JWT: server signs with the private key,
desktop client verifies with the embedded public key. A leaked or
compromised server can't issue tokens for a different signer.

## Connecting the desktop client

1. Run `npm run keys:generate` here. Copy the public key.
2. In SignPortal repo, set the GitHub Actions secret
   `SIGNPORTAL_LICENSE_PUBKEY_PEM` to that public key.
3. Set the repo variable `SIGNPORTAL_DEFAULT_SERVER` to your deployed
   license-server URL (e.g. `https://license.signportal.io`).
4. Re-tag `desktop-v0.x.y` to rebuild installers with the production
   pubkey baked in.

## Deployment

See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for Render, Fly,
Docker, and bare-VM recipes. The TL;DR:

- One container. Mount a volume at `/app/data` for SQLite + signing keys.
- Set `LICENSE_PRIVATE_KEY` and `LICENSE_PUBLIC_KEY` env vars from your
  secrets manager so keys aren't on disk in production.
- HTTPS in front (Cloudflare, Caddy, nginx) — the activation tokens
  must travel encrypted.

## Repository layout

```
cuddly-journey/
├── app/                  Next.js App Router
│   ├── admin/            Admin UI (login, dashboard, licenses, audit)
│   └── api/              REST endpoints (public + admin)
├── lib/
│   ├── db.ts             SQLite connection + migrations
│   ├── keys.ts           License key generation, hashing, checksum
│   ├── jwt.ts            Ed25519 sign + verify, key bootstrap
│   ├── auth.ts           Admin session cookies, bcrypt
│   └── audit.ts          Append-only event recording
├── scripts/
│   ├── init-db.ts        First-time bootstrap (DB + keys + admin)
│   └── generate-signing-key.ts  Print pubkey for client build
├── docs/
│   ├── index.html        GitHub Pages landing site
│   ├── ARCHITECTURE.md
│   └── DEPLOYMENT.md
└── data/                 (gitignored) SQLite DB + signing keys
```

## License

Internal — part of the SignPortal product family.
