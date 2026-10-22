# Moving QuickPrint to the shop PC (the one with the Epson L3250)

Written for Claude CLI (or a person) on the shop PC. Everything already works on the development PC;
this moves the **server, print agent and Cloudflare tunnel** to the PC that has the printer.
The website itself is on GitHub Pages and needs no changes.

```
Customers → quickprint.thiruvengadam.me (GitHub Pages)
          → quickprint-api.thiruvengadam.me (Cloudflare Tunnel "quickprint")
          → this PC: server :4000 + print agent → Epson L3250
```

## 0. Bring these from the development PC (USB stick — never commit or share them)

| File on dev PC | Put it on shop PC at |
|---|---|
| `Downloads\quickprint\.env` | project root `.env` |
| `%USERPROFILE%\.cloudflared\config.yml` | `%USERPROFILE%\.cloudflared\config.yml` |
| `%USERPROFILE%\.cloudflared\00a69f8c-60af-45a2-87ec-b5112688c00e.json` | same folder (this is the tunnel's password) |
| `%LOCALAPPDATA%\cloudflared\cloudflared.exe` | `%LOCALAPPDATA%\cloudflared\cloudflared.exe` |

Optional: copy the dev PC's `data\` folder too to keep trending items and order history.
Without it the shop PC starts with an empty database (fine — only test orders so far).

## 1. Stop it on the development PC first

Only one PC may run the tunnel/server at a time. On the **dev PC**:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1 -Remove
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'quickprint|apps\\(server|agent)' } | Stop-Process -Force
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'run\.ps1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
# QuickPrint's tunnel is the plain "cloudflared tunnel run"; other tunnels (e.g. iot-gw) keep running
Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -match 'tunnel run"?\s*$' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

## 2. Install on the shop PC

1. **Node.js 22 LTS** (nodejs.org) and **Git**.
2. **SumatraPDF** (sumatrapdfreader.org, default install) — the agent prints through it.
3. **Epson L3250 driver** from epson.co.in; print a Windows test page to confirm the printer works.
4. Get the code and install:
   ```powershell
   cd $env:USERPROFILE\Downloads
   git clone https://github.com/tkt-2605/quick_print.git quickprint
   cd quickprint
   npm install
   npm run build
   ```
5. Put the files from step 0 in place.
6. If the shop PC's Windows username is not `user`, fix the `credentials-file:` path inside
   `%USERPROFILE%\.cloudflared\config.yml`.

## 3. Check `.env` on the shop PC

These must be set (values come from the dev PC's `.env`):
```
ADMIN_PASSWORD=...            # strong, 14+ characters recommended
AGENT_TOKEN=...
CORS_ORIGINS=https://quickprint.thiruvengadam.me
RAZORPAY_KEY_ID=rzp_test_...  # test keys until Razorpay approves the domain
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=      # optional for testing
AGENT_DRY_RUN=0               # IMPORTANT: 0 = really print (dev PC had 1)
```
Shop name/address/phone/email/hours live in `apps/web/src/shop-info.json` (already in git).

Find the printer's exact Windows name:
```powershell
npm run printers -w @quickprint/agent
```

## 4. Start everything (and at every login)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1
```
Starts the server, print agent and tunnel hidden; they restart on crash. Logs: `data\logs\`.
Windows: set **Sleep = Never** (plugged in) and keep the user logged in.

Check:
- `http://localhost:4000/api/status` and `https://quickprint-api.thiruvengadam.me/api/status` return JSON
- `data\logs\server-<date>.log` says `payments: razorpay`
- `data\logs\tunnel-<date>.log` shows `Registered tunnel connection` ×4

## 5. Set up the printer in Admin

https://quickprint.thiruvengadam.me/admin → log in with `ADMIN_PASSWORD`.

1. **Printers** tab: *Epson EcoTank L3250* → Windows printer name must match step 3 exactly
   (default `EPSON L3250 Series`) → tick **Use this printer** → Save. Status should turn **Online**.
   **Double-sided printing → Off** (the L3250 has no duplex unit). Customers then only see single side.
   "Both sides" appears on the site only when some printer in use allows it.
2. *Only if you later choose Manual double-sided:* **Print 3-sheet duplex test** → go to **Print queue** → when it says **FLIP NEEDED**, take the
   printed sheets, flip the stack, put it back in the rear tray, press **Reloaded — print back sides**.
   Check each BACK is behind its FRONT and upright. If the order is wrong, toggle *reverse order*;
   if upside-down, toggle *rotate 180°*; repeat the test until right.
3. **Pricing & settings**: check prices and shop hours (Mon–Sat 9:00 AM – 9:00 PM, Sunday closed).

## 6. Test a real order with a test payment

During shop hours, on a phone using **mobile data**:
1. Open https://quickprint.thiruvengadam.me → **Choose files** → pick a PDF or photo → **Pay**.
2. Razorpay opens (it says *Test Mode*). Pay with **Netbanking** → choose any bank →
   on the Razorpay test page press **Success**. (On a phone, UPI may also offer a box —
   type `success@razorpay`. Desktop UPI only shows a QR, which can't be paid in test mode.)
3. You land on the order page with a code + QR. The Epson starts printing.
   For "Both sides" jobs, Admin beeps → flip → **Reloaded**.
4. Admin → Print queue → **Mark collected** (or type/scan the code at the top).

No real money moves in test mode.

## Updating to a newer version

When new code is pushed to GitHub (the website updates by itself; the server here does not):
```powershell
cd $env:USERPROFILE\Downloads\quickprint
git pull
npm install
npm run build
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'apps\\(server|agent)' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```
The autostart loop restarts the server and agent within a few seconds with the new code.
Don't update while something is printing.

## Payment options

With Razorpay keys set, customers choose **Pay online now** or **Pay at the counter** at checkout.
Counter orders appear in Admin → Print queue under *Waiting for payment at counter* and **do not print**
until staff press **Paid cash** or **Paid UPI**. Turn the counter option off in
Admin → Pricing & settings → Payment. Unpaid counter orders are cancelled automatically after 24 hours.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Site says "can't reach the shop" during hours | Is the tunnel running? Check `data\logs\tunnel-*.log`; is the dev PC's tunnel stopped? |
| Printer shows offline in Admin | Windows name mismatch, printer off, or agent not running (`data\logs\agent-*.log`) |
| Order paid but not printing | Printer offline, or **Pause printing** is on; jobs wait and print when it's back |
| Razorpay popup error "payment service unavailable" | Key ID/secret wrong in `.env` (secret is shown only once when generated — regenerate if unsure) |
| Payment done but order still unpaid | Server checks Razorpay every 5 min and at startup; it will catch up |
