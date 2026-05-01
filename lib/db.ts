import Database, { type Database as DB } from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

// SQLite is fast, embedded, and the right default for an MVP license server.
// Migrate to Postgres later by swapping this module — every query goes
// through the helpers below, so the call sites won't change.
//
// File location: ./data/license-server.db (gitignored). Override with
// LICENSE_DB_PATH env var when deploying.

const DEFAULT_DB_PATH = join(process.cwd(), 'data', 'license-server.db')

let _db: DB | null = null

export function db(): DB {
  if (_db) return _db
  const path = process.env.LICENSE_DB_PATH ?? DEFAULT_DB_PATH
  mkdirSync(dirname(path), { recursive: true })
  const conn = new Database(path)
  conn.pragma('journal_mode = WAL')
  conn.pragma('foreign_keys = ON')
  conn.pragma('synchronous = NORMAL')
  runMigrations(conn)
  _db = conn
  return conn
}

// Schema versioning — pragma user_version. Each numbered block runs once
// when its number exceeds the stored version. Append new blocks; never
// modify existing ones. SQLite reads user_version for free on every
// connection, so this is cheap.
function runMigrations(conn: DB) {
  const current = conn.pragma('user_version', { simple: true }) as number

  if (current < 1) {
    conn.exec(`
      CREATE TABLE licenses (
        id              TEXT PRIMARY KEY,
        key_hash        TEXT NOT NULL UNIQUE,
        key_prefix      TEXT NOT NULL,
        customer        TEXT NOT NULL,
        plan            TEXT NOT NULL CHECK (plan IN ('basic', 'pro', 'enterprise')),
        seat_limit      INTEGER NOT NULL CHECK (seat_limit > 0),
        expires_at      TEXT NOT NULL,
        is_revoked      INTEGER NOT NULL DEFAULT 0,
        revoke_reason   TEXT,
        notes           TEXT,
        created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        created_by      TEXT
      );
      CREATE INDEX idx_licenses_prefix ON licenses(key_prefix);
      CREATE INDEX idx_licenses_customer ON licenses(customer);

      CREATE TABLE license_seats (
        id                  TEXT PRIMARY KEY,
        license_id          TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
        machine_fingerprint TEXT NOT NULL,
        platform            TEXT NOT NULL,
        activated_at        TEXT NOT NULL,
        last_heartbeat_at   TEXT NOT NULL,
        UNIQUE (license_id, machine_fingerprint)
      );
      CREATE INDEX idx_seats_license ON license_seats(license_id);
      CREATE INDEX idx_seats_fingerprint ON license_seats(machine_fingerprint);

      CREATE TABLE admin_users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE admin_sessions (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        expires_at  TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_sessions_expiry ON admin_sessions(expires_at);

      CREATE TABLE audit_events (
        id          TEXT PRIMARY KEY,
        action      TEXT NOT NULL,
        license_id  TEXT REFERENCES licenses(id) ON DELETE SET NULL,
        actor       TEXT,
        details     TEXT,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_audit_license ON audit_events(license_id);
      CREATE INDEX idx_audit_created ON audit_events(created_at);

      CREATE TABLE updates_manifest (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        latest_version  TEXT,
        platforms_json  TEXT,
        notes           TEXT,
        priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'recommended', 'critical')),
        published_at    TEXT
      );
      INSERT INTO updates_manifest (id, latest_version, platforms_json, notes, priority)
      VALUES (1, NULL, NULL, NULL, 'normal');
    `)
    conn.pragma('user_version = 1')
  }

  // Add future migrations as `if (current < 2) { ... }` blocks here.
}

// ---------------------------------------------------------------------------
// Type definitions matching the schema rows.
// ---------------------------------------------------------------------------

export interface LicenseRow {
  id: string
  key_hash: string
  key_prefix: string
  customer: string
  plan: 'basic' | 'pro' | 'enterprise'
  seat_limit: number
  expires_at: string
  is_revoked: 0 | 1
  revoke_reason: string | null
  notes: string | null
  created_at: string
  created_by: string | null
}

export interface SeatRow {
  id: string
  license_id: string
  machine_fingerprint: string
  platform: string
  activated_at: string
  last_heartbeat_at: string
}

export interface AdminUserRow {
  id: string
  email: string
  password_hash: string
  created_at: string
}

export interface SessionRow {
  id: string
  user_id: string
  expires_at: string
  created_at: string
}

export interface AuditRow {
  id: string
  action: string
  license_id: string | null
  actor: string | null
  details: string | null
  created_at: string
}

export interface UpdatesManifestRow {
  id: 1
  latest_version: string | null
  platforms_json: string | null
  notes: string | null
  priority: 'normal' | 'recommended' | 'critical'
  published_at: string | null
}
