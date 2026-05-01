import { NextRequest, NextResponse } from 'next/server'
import { db, type UpdatesManifestRow } from '@/lib/db'

// GET /api/updates/desktop/:target/:current
//
// Tauri updater feed endpoint. The desktop client polls this every 6h.
//   target  ∈ darwin-aarch64 | darwin-x86_64 | windows-x86_64 | linux-x86_64
//   current — semver of the running build
//
// Returns 204 if up-to-date, otherwise the Tauri 2 manifest shape.
// Admins set `latest_version` + `platforms_json` from the admin UI;
// the row is a singleton (id = 1) seeded by the migration.

interface RouteContext {
  params: Promise<{ target: string; current: string }>
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { target, current } = await params
  const manifest = db()
    .prepare('SELECT * FROM updates_manifest WHERE id = 1')
    .get() as UpdatesManifestRow | undefined

  if (!manifest || !manifest.latest_version) {
    // No release published yet.
    return new NextResponse(null, { status: 204 })
  }

  if (manifest.latest_version === current) {
    return new NextResponse(null, { status: 204 })
  }

  let platforms: Record<string, { signature: string; url: string }> = {}
  if (manifest.platforms_json) {
    try {
      platforms = JSON.parse(manifest.platforms_json)
    } catch {
      return NextResponse.json({ error: 'manifest is corrupt' }, { status: 500 })
    }
  }

  if (!platforms[target]) {
    // No build for this target yet — treat as "up to date" so the
    // client doesn't loop on a 404.
    return new NextResponse(null, { status: 204 })
  }

  // Encode priority into the notes body so the client's existing
  // `[CRITICAL]` / `[RECOMMENDED]` prefix detection works.
  const notesPrefix =
    manifest.priority === 'critical' ? '[CRITICAL] ' :
    manifest.priority === 'recommended' ? '[RECOMMENDED] ' : ''

  return NextResponse.json({
    version: manifest.latest_version,
    notes: notesPrefix + (manifest.notes ?? ''),
    pub_date: manifest.published_at ?? new Date().toISOString(),
    platforms: { [target]: platforms[target] },
  })
}
