# Going live: quickprint.thiruvengadam.me

```
Customer phone ──▶ quickprint.thiruvengadam.me          (GitHub Pages — always online, free)
                        │  API calls
                        ▼
                   quickprint-api.thiruvengadam.me      (Cloudflare Tunnel — free, no router setup)
                        │
                        ▼
                   Shop PC: server :4000 + print agent ──▶ Epson L3250
```

When the shop PC is off, the site still loads and shows "closed / can't reach the shop" with your hours and contact details.

> **Why `quickprint-api.` and not `api.quickprint.`?** Cloudflare's free SSL certificate covers one level of subdomain (`*.thiruvengadam.me`). A two-level name would need a paid certificate.

---

## 1. Cloudflare DNS (one time, ~15 min)

The tunnel needs `thiruvengadam.me`'s DNS to be managed by Cloudflare.

- **Already on Cloudflare?** Skip to step 2.
- **Not yet:** in the Cloudflare dashboard, choose *Add a site* → `thiruvengadam.me` → Free plan. Cloudflare copies your existing DNS records, so check that your current site's records are all there. Then change the nameservers at your domain registrar to the two Cloudflare gives you. It takes minutes to a few hours. Your existing site keeps working.

## 2. GitHub repo + Pages (one time, ~10 min)

1. Create a repository, e.g. `quickprint`.
   - The free GitHub Pages plan requires a **public** repo. No secrets are in the code (`.env` and `data/` are git-ignored). If you want the code private, you need GitHub Pro, or use Cloudflare Pages instead.
2. Push this project to it (Claude CLI can do this: "commit and push to my GitHub repo quickprint").
3. In the repo, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Still in **Settings → Pages**, set **Custom domain** to `quickprint.thiruvengadam.me`, then tick **Enforce HTTPS** once it becomes available.
5. In Cloudflare DNS, add **CNAME** `quickprint` → `<your-github-username>.github.io`, with **Proxy status: DNS only** (grey cloud).
6. Open the **Actions** tab. The "Deploy site" workflow runs on every push to `main`. You can also run it by hand.

## 3. Shop PC setup (Claude CLI can do all of this, ~30 min)

1. Install **Node.js 22 LTS**, **Git**, **SumatraPDF** and the **Epson L3250 driver**. Print a Windows test page.
2. Clone the repo, then run `npm install`.
3. Create `.env` from `.env.example`:
   ```
   ADMIN_PASSWORD=<strong password>
   AGENT_TOKEN=<long random string>
   CORS_ORIGINS=https://quickprint.thiruvengadam.me
   PAYMENT_MODE=counter
   SHOP_NAME=QuickPrint
   SHOP_LEGAL_NAME=<name on your PAN>
   SHOP_ADDRESS=<shop address>
   SHOP_PHONE=<mobile>
   SHOP_EMAIL=<email>
   AGENT_DRY_RUN=0
   ```
4. Run `npm run printers -w @quickprint/agent` and note the Epson's exact name.
5. Start everything at login (hidden, restarts on crash):
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1
   ```
   Logs are in `data\logs\`. To remove: add `-Remove`.
6. Windows settings: **Sleep = Never** while plugged in, and log in automatically (or stay logged in). The print agent runs in your user session so it can see the printers.

## 4. Cloudflare Tunnel ✅ created

Already done on the development PC (22 Oct 2026):

- Tunnel **`quickprint`** (id `00a69f8c-60af-45a2-87ec-b5112688c00e`)
- DNS: `quickprint-api.thiruvengadam.me` → tunnel
- Config: `%USERPROFILE%\.cloudflared\config.yml` → `http://localhost:4000`
- `cloudflared.exe` in `%LOCALAPPDATA%\cloudflared\`
- `install-autostart.ps1` starts the tunnel with the server and agent when `config.yml` exists

**Moving it to the shop PC:**

1. Copy `%LOCALAPPDATA%\cloudflared\cloudflared.exe` to the same folder on the shop PC.
2. Copy `%USERPROFILE%\.cloudflared\config.yml` and `00a69f8c-60af-45a2-87ec-b5112688c00e.json` to `%USERPROFILE%\.cloudflared\` on the shop PC.
   - The `.json` file is the tunnel's password. Copy it with a USB stick or similar; **never commit or share it**.
   - `cert.pem` isn't needed to run the tunnel.
3. If the shop PC's Windows username differs, fix the `credentials-file:` path in `config.yml`.
4. **Stop the tunnel on the old PC.** Two copies running would split customers between both PCs. Run `install-autostart.ps1 -Remove` there, or just don't run it.
5. Run `install-autostart.ps1` on the shop PC.
6. Check that https://quickprint-api.thiruvengadam.me/api/status shows `{"open": …}`.

## 5. First run checklist

- [ ] https://quickprint.thiruvengadam.me loads on your phone (mobile data, not shop Wi-Fi).
- [ ] Admin: https://quickprint.thiruvengadam.me/admin (or http://localhost:4000/admin on the shop PC after `npm run build`)
- [ ] **Pricing & settings**: prices, **shop hours**, last-order cutoff.
- [ ] **Printers**: Windows name matches, then **Print 3-sheet duplex test** and set reverse/rotate until backs are correct.
- [ ] Place a real order from your phone, then **Paid cash**, check that it prints, then **Mark collected**.
- [ ] Try **Close shop now** and check that the phone shows the closed page. Then **Reopen now**.
- [ ] Turn the PC off and check that the phone shows "can't reach the shop".
- [ ] Print a QR poster for the counter pointing to `https://quickprint.thiruvengadam.me`.

## Daily use

| Situation | What to do |
|---|---|
| Customer at counter with an unpaid order | Type or scan their code → collect cash/UPI → **Paid cash** / **Paid UPI**. It starts printing. |
| "FLIP NEEDED" beep | Flip the printed stack, reload it, press **Reloaded — print back sides**. |
| Private document | Ask for the 4-digit PIN → **Release & print**. |
| Paper/ink/jam | **Pause printing**. Orders keep coming in and wait. Press **Resume printing** when fixed. |
| Leaving early / emergency | **Close shop now** with a message. Paid orders still print. |
| Handing over | Scan or type the code → green "Ready — hand over" → **Mark collected**. |

## Later: online payments

When a Razorpay account is approved, add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` to `.env` and remove `PAYMENT_MODE=counter`. Webhook URL: `https://quickprint-api.thiruvengadam.me/api/payments/razorpay/webhook`.
