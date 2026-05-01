# Changelog

All notable changes to the SignPortal License Server.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-05-01

Initial release. Production-shape architecture, hobby-grade footprint.

### Added

- **Public REST API** for desktop clients
  - `POST /api/licenses/activate` — claim a seat, return a 14-day Ed25519 JWT bound to the device fingerprint
  - `POST /api/licenses/heartbeat` — refresh the token, surface remote revocation
  - `POST /api/licenses/deactivate` — free a seat at uninstall / machine move
  - `GET /api/updates/desktop/{target}/{current}` — Tauri 2 auto-updater manifest
- **Admin REST API** (cookie-authenticated)
  - License CRUD with raw-key reveal on issuance (one-time, never persisted)
  - Per-license seat list with kick action
  - Audit log read with filter by action type
- **Admin web UI**
  - Login (bcrypt + httpOnly session cookies)
  - Dashboard with KPI tiles + recent activity
  - License list with seat counts + status pills
  - License detail (seats table, audit trail, revoke / kick actions)
  - Full filterable audit log
- **Crypto**
  - Ed25519 signing keypair generated on first boot to `data/keys/`
  - Override via `LICENSE_PRIVATE_KEY` / `LICENSE_PUBLIC_KEY` env (production)
  - License keys: `SP-XXXX-XXXX-XXXX-XXXX` with 4-char checksum
  - Stored as SHA-256 hash; raw key shown once at issuance
- **Storage**
  - SQLite via `better-sqlite3` with WAL journal mode
  - Schema versioned via `pragma user_version`; documented Postgres migration path
  - Six tables: `licenses`, `license_seats`, `admin_users`, `admin_sessions`, `audit_events`, `updates_manifest`
- **Marketing site** at <https://sinhaankur.github.io/cuddly-journey/>
  - Single static HTML page with embedded CSS, no build step
  - Hero, bento feature grid, architecture diagram, API reference, quickstart, vendor comparison
  - Auto-published via `pages.yml` workflow on push to `main`
- **Container image** at `ghcr.io/sinhaankur/cuddly-journey:v0.1.0`
  - Multi-stage Dockerfile, ~80 MB final image, multi-arch (linux/amd64 + linux/arm64)
  - Volume mount at `/app/data` for SQLite + signing-key persistence
  - `release.yml` workflow builds and pushes on every `v*` tag
- **Deployment recipes** in `docs/DEPLOYMENT.md` for Render, Fly.io, and bare-VM (Caddy + systemd)
- **Architecture documentation** in `docs/ARCHITECTURE.md` covering trust boundaries, threat model, data model, and the Postgres migration path

### Known limitations (deliberate, on the roadmap)

- No Stripe / billing integration yet — keys are issued manually via the admin UI
- No SSO / SAML for the admin login (single bcrypt-hashed admin user)
- SQLite-only; Postgres migration is documented but not implemented
- No on-prem-customer license-pool sync (the Altova-style enterprise model) — every desktop hits this server directly
- No alerting on suspicious activation patterns (e.g., the same key activating from N geographically distant fingerprints)

[Unreleased]: https://github.com/sinhaankur/cuddly-journey/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sinhaankur/cuddly-journey/releases/tag/v0.1.0
