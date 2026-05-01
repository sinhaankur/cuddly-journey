import { redirect } from 'next/navigation'
import { getCurrentAdmin } from '@/lib/auth'

// Root: bounce to admin dashboard if signed in, login otherwise. Public
// API endpoints (/api/licenses/*, /api/updates/*) don't need a UI.
export default async function RootPage() {
  const cur = await getCurrentAdmin()
  if (cur) redirect('/admin')
  redirect('/admin/login')
}
