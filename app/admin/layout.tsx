import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentAdmin } from '@/lib/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The login page is served at /admin/login — its `page.tsx` does its
  // own pre-check (logged-in users bounce to /admin). Other admin paths
  // require a session.
  // We can't easily detect the current path here in App Router server
  // components, so the login page bypasses by being inside its own
  // layout-less route group via group `(public)/login`. For simplicity
  // we let the login page render outside this layout entirely (see
  // app/admin/login/page.tsx — it returns <html> directly via being
  // inside this layout but we skip the chrome when user is null).

  const cur = await getCurrentAdmin()
  if (!cur) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/admin" className="flex items-center gap-2 text-sm font-semibold">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-ink text-canvas font-mono">SP</span>
            License Server
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/admin" className="rounded-md px-3 py-1.5 text-muted hover:bg-ink/5 hover:text-ink">Dashboard</Link>
            <Link href="/admin/licenses" className="rounded-md px-3 py-1.5 text-muted hover:bg-ink/5 hover:text-ink">Licenses</Link>
            <Link href="/admin/audit" className="rounded-md px-3 py-1.5 text-muted hover:bg-ink/5 hover:text-ink">Audit</Link>
          </nav>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="hidden sm:inline">{cur.user.email}</span>
            <form action="/api/admin/logout" method="post">
              <button type="submit" className="rounded-md px-2 py-1 hover:bg-ink/5 hover:text-ink">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4 text-xs text-muted">
          SignPortal License Server · v0.1.0
        </div>
      </footer>
    </div>
  )
}
