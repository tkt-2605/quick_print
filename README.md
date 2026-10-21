# QuickPrint

Upload → preview → pay → prints automatically. A "Blinkit for printing" for a stationery shop.

```
 Customer phone / laptop            Shop PC (Windows)
 ┌──────────────────────┐   HTTPS   ┌─────────────────────────────┐
 │  Web app (React)     │ ────────▶ │  Server  (apps/server)      │
 │  upload · preview ·  │           │  A4 conversion · pricing ·  │
 │  pay · track order   │           │  Razorpay · queue · admin   │
 └──────────────────────┘           └──────────────┬──────────────┘
                                                   │ polls every 3 s
                                    ┌──────────────▼──────────────┐
 Shopkeeper: /admin                 │  Print agent (apps/agent)   │──▶ Epson L3250 (colour)
 queue · flip prompts · PINs ·      │  SumatraPDF silent printing │──▶ Canon LBP2900B (B&W, later)
 printers · trending · pricing      └─────────────────────────────┘
```

| Folder | What it is |
|---|---|
| `apps/web` | Customer web app + shop admin (`/admin`). React + Vite, mobile-first, blue/white. |
| `apps/server` | Node/Express API. SQLite (built into Node), files in `data/`. Serves the built web app. |
| `apps/agent` | Runs on the PC the printers are connected to. Pulls paid jobs and prints them. |

**Why a web app (not Electron)?** Customers don't install anything — they scan a QR code at the counter or open a link from home. The same pages can be wrapped in Electron/Capacitor later if you want a kiosk or Play Store app. Only the print agent needs to live on the shop PC.

## Features (v0.1)

- **Upload** PDF, JPG, PNG (and Word/Excel/PowerPoint if LibreOffice is installed). Max 50 MB, 500 pages.
- **Everything becomes A4** on the server: odd-sized/rotated PDF pages are scaled onto A4 (portrait or landscape), phone photos are auto-rotated (EXIF) and placed "whole photo" or "fill page".
- **Preview = what prints.** The customer sees the converted A4 file, sheet by sheet, front/back pairing for double-sided, greyscale for B&W.
- **Options:** B&W / colour, single / both sides, copies, page ranges (`1-3, 5, 8-`).
- **Payments:** **pay at counter** (default: customer gets a code, staff taps *Paid cash / Paid UPI*, printing starts) or Razorpay online payments once approved. `PAYMENT_MODE=mock` gives a fake pay button for development.
- **Shop hours:** customers can only order inside opening hours (with a last-order cutoff). *Close shop now* (with a message), *Pause printing* for paper/ink problems. When the shop PC is off, the site still loads and says so.
- **Pickup pass:** order code + QR, shareable so someone else can collect. Admin scans/types it and gets a clear hand-over verdict.
- **Order history** on the customer's device with live status; policy pages (terms, privacy, refunds, pickup, contact) for payment-gateway approval.
- **Automatic queue:** paid jobs go straight to the printer. B&W can be routed to a mono laser when one is online.
- **Manual double-sided** for printers without a duplex unit (both the L3250 and LBP2900B): fronts print → dashboard beeps and shows "flip the stack" → shopkeeper presses *Reloaded* → backs print. A calibration test page sets the flip order per printer.
- **Private documents** (Aadhaar, PAN, bank statements…): encrypted on disk (AES-256-GCM), never viewable in the admin, **held until the customer tells the PIN at the counter**, deleted right after printing (or within 1 hour if never printed).
- **Trending prints:** upload once (e.g. "Wild animals — Class 3 project"), customers just tap *Add*.
- **Order tracking:** order code + live status for the customer; "Ready — call customer" for the shop.
- Customer files are auto-deleted 24 h after the order closes (configurable). Unpaid orders auto-cancel after 24 h.

## Quick start (development)

Requires **Node.js 22.13+** and (for real printing) **SumatraPDF** — already found on this PC at `%LOCALAPPDATA%\SumatraPDF`.

```powershell
npm install
copy .env.example .env      # then edit ADMIN_PASSWORD and AGENT_TOKEN
npm run dev                 # server :4000 + web :5173 + print agent
```

- Customer site: http://localhost:5173 (phones on the same Wi-Fi: `http://<pc-ip>:5173`)
- Admin: http://localhost:5173/admin

**Test without wasting paper:** set `AGENT_DRY_RUN=1` in `.env`. The agent then writes each print pass to `data/agent-out/*.pdf` instead of printing, and treats every printer as online.

## Production on the shop PC

**Step-by-step go-live for quickprint.thiruvengadam.me: [docs/GO-LIVE.md](docs/GO-LIVE.md)** (GitHub Pages site + Cloudflare Tunnel to the shop PC + auto-start).

Manual run:

```powershell
npm run build      # builds the web app into apps/web/dist
npm start          # server on :4000 serving the site + API
npm run agent      # in a second window — the print agent
```

Auto-start at login (hidden, restarts on crash, logs in `data/logs`): `powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1`

Later you can move the server to a cloud VPS. The agent then simply points `SERVER_URL` at it. No other changes are needed, because the agent pulls jobs and needs no open ports in the shop.

## Printer setup

1. Install the **Epson L3250** driver on the shop PC and print a Windows test page.
2. List exact printer names: `npm run printers -w @quickprint/agent`
3. Admin → **Printers**: set the *Windows printer name* to match (default `EPSON L3250 Series`).
4. Click **Print 3-sheet duplex test**, follow the flip prompt in *Print queue*, and adjust *reverse order* / *rotate 180°* until each BACK lands behind its FRONT, upright.
5. When the **Canon LBP2900B** is connected: enable it in Admin → Printers (name on this PC is currently `Canon LBP2900 @ trt-2` — update if it changes). B&W jobs then go to the Canon automatically; colour stays on the Epson.

> The L3250 and LBP2900B both lack automatic duplex, so double-sided jobs always need one flip by hand. A printer with a duplex unit can be added with *Double-sided: Automatic*.

## Payments (Razorpay, later)

Until a gateway is approved, keep `PAYMENT_MODE=counter`.


1. Create a Razorpay account → Settings → API Keys → put `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in `.env`.
2. Webhooks → add `https://<your-domain>/api/payments/razorpay/webhook`, events `payment.captured` and `order.paid`, and set `RAZORPAY_WEBHOOK_SECRET`.
3. Refunds for cancelled orders are done from the Razorpay dashboard (v0.1).

## Roadmap ideas

- **More paper types** (A3, photo paper, card/bond): add a `paper` option per item and per printer (tray/bin), priced in settings.
- Token slips on the thermal receipt printer (already installed) when an order finishes.
- WhatsApp/SMS "your prints are ready" notifications.
- Binding, lamination and spiral as add-on products.
- Automatic refunds via the Razorpay API on cancel.
- Electron kiosk mode for a self-service tablet at the counter.
- Rate limiting and CAPTCHA on uploads once it is public on the internet.

## Data

Everything lives in `data/` (git-ignored): `quickprint.db` (SQLite), `files/` (converted PDFs, `.enc` = encrypted private files), and two generated secrets (`file_key.secret`, `session_secret.secret`). **Back up the secrets with the DB.** If `file_key.secret` is lost, pending private files can't be decrypted.
