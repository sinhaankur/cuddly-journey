/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native Node module and can't be bundled. Telling
  // the Next compiler to leave it as an external `require` lets it work
  // in the App Router server runtime.
  serverExternalPackages: ['better-sqlite3', 'bcrypt'],
  output: 'standalone',
}

export default nextConfig
