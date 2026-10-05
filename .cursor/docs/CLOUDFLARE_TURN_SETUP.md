# Cloudflare TURN setup (fix black camera in live class)

**Why:** When a student or teacher is on a strict network (mobile data, school or office Wi-Fi), the video cannot connect directly. A TURN relay passes the video through. Our own relay on the Hostinger VPS (port 3478) is blocked by Hostinger's firewall, so we use Cloudflare's hosted TURN instead. The code is already in the project (`server/services/hostedTurn.js`, `/api/rtc-config`). It only needs two keys.

**Never** paste the API token in chat, in git, or in screenshots. If it leaks, delete the key in Cloudflare and create a new one.

---

## Part 1 — Cloudflare dashboard (whoever owns the Cloudflare account)

1. Sign up or log in at <https://dash.cloudflare.com>. Verify the email.
2. In the left menu open **Realtime** (older name: *Calls*) and then **TURN Server**.
   - Direct link: <https://dash.cloudflare.com/?to=/:account/calls>
   - If a plan or card is requested: TURN is free up to 1,000 GB/month, and a card is only needed for usage beyond that.
3. Click **Create** (or **Create TURN key**).
   - Name: `remoedph-turn`
   - Leave the default lifetime. The server asks for 24-hour credentials itself.
4. Cloudflare shows two values. **Copy both now**, because the token is shown only once:
   - **TURN Key ID**
   - **API Token** (also called *TURN Key API Token*)
5. Send both values privately to the person who manages the Hostinger server (not in a group chat, and not through Cursor chat).

---

## Part 2 — Hostinger VPS (server admin, srv1948835)

Open hPanel → VPS → **Browser terminal**, then run these in order.

1. Find the project folder and the `.env` file:
   ```bash
   pm2 list
   pm2 show <app-name> | grep -i "exec cwd"
   ```
2. Edit the `.env` in that folder:
   ```bash
   cd <exec cwd folder>
   nano .env
   ```
3. Add these two lines at the bottom (use the real values):
   ```
   CLOUDFLARE_TURN_KEY_ID=<TURN Key ID>
   CLOUDFLARE_TURN_API_TOKEN=<API Token>
   ```
   Save with `Ctrl+O`, `Enter`, then exit with `Ctrl+X`.
4. Deploy the latest code (after it is committed and pushed), then restart:
   ```bash
   git pull
   npm install --omit=dev
   pm2 restart <app-name> --update-env
   ```
   `--update-env` is required, otherwise the new keys are not loaded.

Remove the old `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` lines if they are still there (the own coturn is switched off, and a dead relay in the list only slows the connection):
```bash
sed -i -E '/^#?(TURN_URL|TURN_USERNAME|TURN_CREDENTIAL)=/d' .env
```

---

## Part 3 — Check that it works

1. Open `https://remoedph.com/api/rtc-config` in a browser. You should see:
   - `"turnConfigured": true`
   - entries in `iceServers` whose `urls` contain `turn.cloudflare.com` (the username and credential are shared 24-hour values, which is expected).
   - If `turnConfigured` is `false`, or there is no `turn.cloudflare.com`, see Troubleshooting.
2. Hard refresh both sides (`Ctrl+Shift+R`): teacher and student.
3. Join a live class on two devices, ideally the student on mobile data. Both cameras should show.
4. In Chrome, open `chrome://webrtc-internals` during the class. A connection of type `relay` means Cloudflare TURN is being used.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `turnConfigured: false` | Keys missing or not loaded | Check the two lines in `.env` (no quotes, no spaces) and run `pm2 restart <app> --update-env` |
| No `turn.cloudflare.com` but `turnConfigured: true` | Cloudflare rejected the request | Run `pm2 logs <app> --lines 50` and look for `[hosted-turn] credential request failed`. Wrong Key ID or token is the usual cause. Re-create the key |
| Still black camera | Browser cache, or only one side refreshed | Hard refresh on both sides. Do not use Observe on the same account while testing |
| Token leaked | Shared by mistake | Delete the key in Cloudflare Realtime → TURN, create a new one, update `.env`, restart |

Notes:
- Port 53 URLs from Cloudflare are ignored on purpose (Chrome blocks them). The `turns:443` TCP URL is the one that gets through strict networks.
- The credentials are cached on the server for about 22 hours. A restart refreshes them.
- This is now the production relay. The own coturn on the VPS is stopped and disabled. Emergency steps for a black camera are in `STABLE_BASELINE.md` → “Camera relay configuration and emergency guidelines”.
