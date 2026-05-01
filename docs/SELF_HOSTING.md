# Self-hosting the License Server on your own machine

You can run the SignPortal License Server on a spare laptop, NAS,
Raspberry Pi, or any always-on Linux box. This guide takes you from a
fresh login to a publicly-reachable HTTPS endpoint via Podman +
Cloudflare Tunnel + auto-updates.

Two stages. Stage 1 is local-network only; do it first. Stage 2 makes
the server reachable from the public internet so the SignPortal Desktop
client (running on someone else's machine) can activate against it.

---

## Stage 1 — Run it on your laptop, talk to it from the same network

**Time:** ~10 min. **Result:** the admin UI works at `http://<your-laptop-ip>:3000` from any device on your home network.

### 1.1 Install Podman

Ubuntu / Debian:

```bash
sudo apt update
sudo apt install -y podman
```

Fedora / RHEL:

```bash
sudo dnf install -y podman
```

Verify:

```bash
podman --version    # should be 4.0+ for quadlet support
```

### 1.2 Pull the image

If the GHCR package is **public** (check at
`https://github.com/users/sinhaankur/packages/container/cuddly-journey/settings`
→ Change visibility → Public):

```bash
podman pull ghcr.io/sinhaankur/cuddly-journey:latest
```

If it's still **private**, authenticate first with a GitHub Personal
Access Token that has `read:packages` scope:

```bash
echo "$YOUR_GITHUB_TOKEN" | podman login ghcr.io -u sinhaankur --password-stdin
podman pull ghcr.io/sinhaankur/cuddly-journey:latest
```

### 1.3 Run it

```bash
# Create a persistent volume for the SQLite DB and signing keys.
# This is THE critical thing to back up — losing it means every issued
# JWT becomes unverifiable.
podman volume create signportal-data

# Bind to all interfaces on port 3000 so other devices on your LAN
# can reach it. Use 127.0.0.1:3000:3000 instead if you only want
# localhost access.
podman run -d \
  --name signportal-license \
  --restart=unless-stopped \
  --label io.containers.autoupdate=registry \
  -p 3000:3000 \
  -v signportal-data:/app/data \
  ghcr.io/sinhaankur/cuddly-journey:latest

# Check it's running
podman ps
podman logs -f signportal-license   # Ctrl-C to stop tailing
```

### 1.4 Seed the first admin user

The image doesn't include a default admin — you have to create one
once. The init script prompts interactively:

```bash
podman exec -it signportal-license sh -c 'cd /app && node scripts/init-db.js'
```

Or non-interactive:

```bash
podman exec -it \
  -e ADMIN_EMAIL=you@yourdomain.com \
  -e ADMIN_PASSWORD='a-password-with-12-or-more-chars' \
  signportal-license sh -c 'cd /app && node scripts/init-db.js'
```

The script prints the **license-signing public key** at the end. **Save
this string** — you'll bake it into the SignPortal Desktop client's
build env (`SIGNPORTAL_LICENSE_PUBKEY_PEM`) so the desktop binary
verifies tokens this server issues.

### 1.5 Test it

From another device on the same WiFi:

```bash
# Find your laptop's LAN IP
ip -4 addr show | grep inet | grep -v 127.0.0.1
# e.g., 192.168.1.42
```

In a browser on a phone or another laptop, open
`http://192.168.1.42:3000`. The admin login page should load. Sign in
with the admin email + password you set.

Issue your first license, copy the activation key it shows once, and
you're ready to point the desktop client at it.

> The desktop client reads `SIGNPORTAL_LICENSE_SERVER` env var at
> runtime if set. So for testing, you can launch the desktop with
> `SIGNPORTAL_LICENSE_SERVER=http://192.168.1.42:3000` and skip the
> rebake.

### 1.6 Survive a reboot

Once you confirm it works, make it auto-start. Podman 4+ has
**quadlets** — systemd-native service definitions, no `docker-compose`
needed.

Create `~/.config/containers/systemd/signportal-license.container`:

```ini
[Unit]
Description=SignPortal License Server
After=network-online.target

[Container]
Image=ghcr.io/sinhaankur/cuddly-journey:latest
ContainerName=signportal-license
PublishPort=3000:3000
Volume=signportal-data:/app/data
AutoUpdate=registry
Label=io.containers.autoupdate=registry

[Service]
Restart=on-failure
TimeoutStartSec=900

[Install]
WantedBy=default.target
```

Then:

```bash
# Stop and remove the manually-run container (the quadlet will recreate it)
podman stop signportal-license
podman rm signportal-license

# Tell systemd to pick up the new quadlet
systemctl --user daemon-reload
systemctl --user enable --now signportal-license.service

# Make user services run even when you're logged out (or the laptop is
# sitting idle on the lock screen)
loginctl enable-linger $USER

# Verify
systemctl --user status signportal-license.service
```

### 1.7 Don't let the laptop sleep

By default, a closed-lid laptop suspends. Two options:

**Option A — disable lid-close suspend:**

```bash
sudo nano /etc/systemd/logind.conf
# Set:
#   HandleLidSwitch=ignore
#   HandleLidSwitchExternalPower=ignore
sudo systemctl restart systemd-logind
```

**Option B — keep it open and turn off the screen:**

```bash
# GNOME
gsettings set org.gnome.desktop.session idle-delay 0
# (set screen blank to "never" in Settings → Power)
```

Power loss is now your only outage source — fine for testing.

---

## Stage 2 — Make it reachable from the public internet (free, no port forwarding)

**Time:** ~10 min. **Result:** an `https://...` URL that resolves to your laptop with a real cert.

Two options. Pick one based on whether your customers will reach the
server over the public internet (Tailscale Funnel + Cloudflare Tunnel
both work) or only your internal team will (plain Tailscale tailnet is
the simplest answer).

### Option A — Tailscale (recommended)

If you're already using Tailscale or planning to, this is the path of
least resistance. No domain to buy, no DNS to manage.

#### A.1 Install Tailscale on the laptop

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# Sign in via the browser link it prints
```

#### A.2 Pick your access mode

**Mode 1 — Tailnet only (internal team / dogfooding)**

Anyone on your Tailscale account can reach the server over the
encrypted tailnet. The desktop client running on a tester's laptop
also signed into your tailnet talks to the license server at the
laptop's tailnet IP or MagicDNS name. Customers outside your tailnet
cannot reach it — perfect for early testing.

```bash
# Find the tailnet name of this laptop
tailscale status | head -3
# Example output:  100.99.42.7 spare-laptop you@github linux

# That host is now reachable as:
#   http://spare-laptop:3000           (MagicDNS, from any tailnet device)
#   http://100.99.42.7:3000            (raw IP)
```

The Tauri desktop client accepts plain HTTP over the tailnet because
the network is already encrypted by Tailscale's WireGuard layer. Set
`SIGNPORTAL_DEFAULT_SERVER=http://spare-laptop:3000` and the testers
log into the same tailnet — done.

**Mode 2 — Tailscale Funnel (public internet, free HTTPS)**

When you're ready for testers outside your tailnet to activate against
the server, turn on Funnel:

```bash
# Get HTTPS for tailnet members (also a prerequisite for Funnel)
sudo tailscale serve --bg http://localhost:3000

# Then expose it publicly
sudo tailscale funnel --bg 3000

# Print the public URL
tailscale funnel status
# Shows something like:
#   https://spare-laptop.your-tailnet.ts.net  →  http://localhost:3000
```

That `https://...ts.net` URL is now reachable from anywhere on the
public internet, with a real Let's Encrypt cert, served through
Tailscale's edge. No port forwarding, no router config. Free for
personal use (one node + three Funnels).

If you later want a custom domain (`license.signportal.io` instead of
`*.ts.net`), point a CNAME at the funnel hostname.

### Option B — Cloudflare Tunnel (alt: when you want a custom domain from day one)

If you already own a domain and want the URL to be on it, Cloudflare
Tunnel is the equivalent path. Requires a domain on Cloudflare
nameservers. Otherwise indistinguishable from Option A's Funnel mode.

```bash
# Install cloudflared
sudo apt install -y cloudflared   # or: sudo dnf install -y cloudflared

# Authenticate + create tunnel
cloudflared tunnel login
cloudflared tunnel create signportal-license
cloudflared tunnel route dns signportal-license license.YOURDOMAIN.com
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: signportal-license
credentials-file: /home/YOUR_USER/.cloudflared/<tunnel-uuid>.json
ingress:
  - hostname: license.YOURDOMAIN.com
    service: http://localhost:3000
  - service: http_status:404
```

```bash
# Test, then install as a service
cloudflared tunnel run signportal-license
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

### 2.x Wire the desktop client

Whichever option you picked, take the resulting URL and:

In the SignPortal repo settings:

- **Variable** `SIGNPORTAL_DEFAULT_SERVER` = `https://your-server-url`
  (or the tailnet `http://spare-laptop:3000` for Mode 1)
- **Secret** `SIGNPORTAL_LICENSE_PUBKEY_PEM` = the PEM string
  `init-db.js` printed earlier

Re-tag desktop:

```bash
cd /path/to/SignPortal
git tag desktop-v0.1.1
git push origin desktop-v0.1.1
```

CI rebuilds installers wired to your real production server. Done.

---

## Auto-updates

Both `--label io.containers.autoupdate=registry` and the quadlet's
`AutoUpdate=registry` arm Podman's native auto-updater. To turn the
timer on:

```bash
systemctl --user enable --now podman-auto-update.timer
systemctl --user list-timers | grep auto-update
# Default: checks daily at ~midnight UTC
```

When a new tag (e.g., `v0.1.1`) lands on `latest` in GHCR, the next
timer fire pulls + restarts. Roll back by pinning to a specific tag in
the quadlet (`Image=ghcr.io/sinhaankur/cuddly-journey:v0.1.0`).

If you'd rather use **Watchtower**, run it against the user-level
Podman socket:

```bash
systemctl --user enable --now podman.socket

podman run -d \
  --name watchtower \
  --restart=unless-stopped \
  -e DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock \
  -v /run/user/$(id -u)/podman/podman.sock:/run/user/$(id -u)/podman/podman.sock \
  -e WATCHTOWER_POLL_INTERVAL=3600 \
  -e WATCHTOWER_CLEANUP=true \
  -e WATCHTOWER_INCLUDE_RESTARTING=true \
  containrrr/watchtower:latest \
  signportal-license
```

Native `podman auto-update` is the lower-overhead choice; Watchtower
is the lower-mental-overhead choice if you already use it elsewhere.

---

## Backups

The whole license-server state is in **one volume**. Daily backup:

```bash
mkdir -p ~/signportal-backups

# Snapshot the SQLite DB (consistent online-backup, not a raw cp)
podman exec signportal-license sh -c \
  'sqlite3 /app/data/license-server.db ".backup /app/data/snapshot.db"'

# Copy out
podman cp signportal-license:/app/data/snapshot.db \
  ~/signportal-backups/license-$(date +%F).db

# Also back up the signing keys (lose these = invalidate every JWT)
podman exec signportal-license tar c -C /app/data keys \
  > ~/signportal-backups/keys-$(date +%F).tar
```

Wire that into a daily systemd-user timer or cron, and ship the
files to S3/Backblaze B2/anywhere off-host.

The signing keys are the **single most critical asset**. If your laptop
dies and the keys are gone, every active license token becomes
unverifiable on the desktop. Back them up to your password manager
(1Password, Bitwarden) or an encrypted USB stick — somewhere offline,
not the same disk.

---

## When to move off the laptop

Run this for the first 5–10 customers. As soon as one of these is
true, migrate to a real host (Render, Fly.io, Hetzner Cloud):

- Customers complain about activation outages during your reboots
- Backup-restore drill takes more than 10 minutes
- You want to disconnect the laptop from the network

The migration is `rsync` the volume + run the same image on the new
host. The container is the unit; nothing about it is bound to the
specific laptop. See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for Render and
Fly recipes.
