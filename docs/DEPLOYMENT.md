# Deployment

Three paths, ordered easiest to most-control.

## 1. Render (one-click)

1. Push this repo to GitHub (already there if you're reading this).
2. New Web Service → connect repo → settings:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Environment: Node 20+
3. Add a persistent disk: 1 GB at `/app/data`. Sufficient for hundreds
   of thousands of licenses; SQLite is tiny.
4. Set environment variables:
   - `NODE_ENV=production`
   - `LICENSE_PRIVATE_KEY` — paste the PEM from `data/keys/license-signing.pem`
   - `LICENSE_PUBLIC_KEY` — paste the PEM from `data/keys/license-signing.pub.pem`
5. Deploy. Visit `/admin/login` and sign in with the seeded admin.

Cost: $7/mo for the smallest instance.

## 2. Fly.io

Single `fly.toml` + `Dockerfile`. The Next.js `standalone` build keeps
the image small (~80 MB).

```dockerfile
# Dockerfile (commit this in repo root if you go this path)
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public 2>/dev/null || true
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
VOLUME /app/data
CMD ["node", "server.js"]
```

```toml
# fly.toml
app = "signportal-license"
primary_region = "iad"

[build]

[mounts]
source = "license_data"
destination = "/app/data"

[http_service]
internal_port = 3000
force_https = true
auto_stop_machines = true
auto_start_machines = true
min_machines_running = 1
```

```bash
fly launch
fly volumes create license_data --size 1
fly secrets set LICENSE_PRIVATE_KEY="$(cat data/keys/license-signing.pem)"
fly secrets set LICENSE_PUBLIC_KEY="$(cat data/keys/license-signing.pub.pem)"
fly deploy
```

## 3. Bare VM (Caddy + systemd)

Most control, most operational work. Use when you need to host inside a
specific network (enterprise on-prem).

1. Install Node 20, copy this repo, run `npm ci && npm run build`.
2. Run `npm run db:init` once to seed admin + keys.
3. Systemd unit (`/etc/systemd/system/signportal-license.service`):

   ```
   [Unit]
   Description=SignPortal License Server
   After=network.target

   [Service]
   Type=simple
   User=signportal
   WorkingDirectory=/srv/signportal-license
   Environment=NODE_ENV=production PORT=3000 LICENSE_DB_PATH=/var/lib/signportal/license.db
   EnvironmentFile=/etc/signportal/license.env
   ExecStart=/usr/bin/node .next/standalone/server.js
   Restart=on-failure

   [Install]
   WantedBy=multi-user.target
   ```

4. Caddy reverse-proxy with auto-HTTPS:

   ```
   license.signportal.io {
     reverse_proxy localhost:3000
   }
   ```

5. `systemctl enable --now signportal-license` and you're live.

## Backups

The whole license server state is in **one SQLite file**. Daily backup
recipe:

```bash
sqlite3 /var/lib/signportal/license.db ".backup /backups/license-$(date +%F).db"
```

Compress + ship to S3 / R2. Restoration is `cp` back into place.

The signing keypair (in `data/keys/` or set via env) is the **other**
critical piece — losing it means every issued JWT becomes unverifiable.
Back it up to your password manager / secrets vault, not to the same
S3 bucket as the database.

## Pointing the desktop client at production

After deploying, in the SignPortal repo:

1. Run `npm run keys:generate` against a clone of this repo (or fetch
   the pubkey from your secrets manager).
2. Set GitHub Actions repo secret `SIGNPORTAL_LICENSE_PUBKEY_PEM` to
   the pubkey content.
3. Set repo variable `SIGNPORTAL_DEFAULT_SERVER` to your deployed URL
   (e.g. `https://license.signportal.io`).
4. Re-tag `desktop-v0.1.0` (or bump the version) to rebuild installers
   with the production config baked in.

The client tries `SIGNPORTAL_LICENSE_SERVER` env var at runtime first
(useful for staging or air-gapped customers), then falls back to the
build-time `SIGNPORTAL_DEFAULT_SERVER`.
