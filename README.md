# ⛏ Minecraft Panel
Tiny, iOS-styled Fabric server panel. Zero runtime deps (Node 18+, Java 21+). Discord bridge is optional.

```bash
git clone https://github.com/YOUR_NAME/mc-panel.git && cd mc-panel && npm run setup
```
Setup asks for a username + password (stored as a scrypt hash in `.env`), then serves the panel on http://localhost:8080.
Next time: `npm start`.

**Security:** scrypt hashing, constant-time compare, per-IP lockout + global brute-force slowdown, HttpOnly + SameSite=Strict
sessions (12 h), CSRF header, strict CSP, path-traversal guard, optional **TOTP 2FA**, full **activity log**, password change,
jar checksums and a one-click server hardening check (Settings → Security).

**Lock it down (do these):**
1. Setup asks if the panel should be reachable from the internet. Say **no** and reach it through a tunnel (Cloudflare Tunnel, Tailscale, WireGuard or an SSH tunnel). Only port **25565** needs to be public.
2. If you must expose it, put it behind HTTPS (Caddy/nginx) and set `TRUST_PROXY=1` in `.env` so lockouts use real visitor IPs. Or set `TLS_KEY=/path/key.pem` and `TLS_CERT=/path/cert.pem` for built-in HTTPS.
3. Enable 2FA, use a long unique password, and never run the panel as root (use a dedicated user or Docker).
4. Keep the Minecraft server on `online-mode=true` with a whitelist, and only op people you fully trust.

**Auto-start** needs the panel to own Minecraft's port (25565) while the server sleeps. **Backups** live in `backups/` — drop any `.tar.gz` there.

## Discord setup
1. Developer Portal → Bot → enable **Message Content Intent**, copy the token.
2. Invite the bot with *View Channels, Send Messages, Embed Links, Read History*.
3. Paste token + role/channel IDs in **Settings → Discord**. `discord.js` installs itself on first use.
The panel message is posted once, remembered, and **edited in place** (status, players, version) every few seconds.
Bot problems show up under *Settings → Discord → Bot status*.
