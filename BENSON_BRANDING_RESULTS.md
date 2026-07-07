# Benson branding and PWA results

Completed: 2026-06-01 (local pre-alpha stack)

## Logo source

- **Source:** `/home/elliott/Downloads/Benson Logo.png` (1254×1254 PNG, ~1.7 MB)
- **Copied to:** `dashboard/public/icons/benson-logo.png` (no redesign; original asset preserved)

## Files created

| File | Purpose |
|------|---------|
| `dashboard/public/icons/benson-logo.png` | Official logo (header + source for icons) |
| `dashboard/public/icons/icon-192.png` | PWA icon 192×192 |
| `dashboard/public/icons/icon-512.png` | PWA icon 512×512 |
| `dashboard/public/icons/icon-512-maskable.png` | Android maskable icon (extra safe-zone padding) |
| `dashboard/public/icons/apple-touch-icon.png` | Apple home screen 180×180 |
| `dashboard/public/favicon.ico` | Browser favicon (16×16 + 32×32) |
| `dashboard/public/manifest.webmanifest` | Static Benson PWA manifest |
| `scripts/generate-benson-pwa-icons.py` | Regenerate icons from `benson-logo.png` (Pillow) |

## Files changed

| File | Change |
|------|--------|
| `dashboard/app/layout.tsx` | Benson metadata (manifest, favicon, apple-touch, OpenGraph/Twitter); header logo + “Benson” |
| `dashboard/lib/branding.ts` | Benson `metadataTitle` / `metadataDescription` aligned with manifest |
| `dashboard/app/manifest.ts` | **Removed** — static `public/manifest.webmanifest` is authoritative |

## Files removed

| File | Reason |
|------|--------|
| `dashboard/public/icons/icon-192.svg` | Replaced by PNG PWA assets |
| `dashboard/public/icons/icon-512.svg` | Replaced by PNG PWA assets |

## Icon generation notes

- ImageMagick was not available; icons were generated with **Python Pillow** (`scripts/generate-benson-pwa-icons.py`).
- Logo is centered on a white canvas with ~8% padding; aspect ratio preserved (no stretch).
- Source is large enough (1254×1254) that 512×512 exports are sharp without upscaling.
- Maskable variant uses ~18% padding for Android safe zone; `purpose: "maskable"` is separate from `any` icons so normal display is unaffected.

## Manifest (`/manifest.webmanifest`)

```json
{
  "name": "Benson",
  "short_name": "Benson",
  "description": "Benson — Kellie's KC content and sponsor assistant",
  "display": "standalone",
  "start_url": "/",
  "scope": "/",
  "theme_color": "#000000",
  "background_color": "#ffffff"
}
```

Icons: `icon-192.png`, `icon-512.png` (`purpose: any`), `icon-512-maskable.png` (`purpose: maskable`).

## App metadata and header

- **Title / applicationName:** Benson
- **Description:** Benson — Kellie's KC content and sponsor assistant
- **Links in HTML:** `manifest`, `icon` → `/favicon.ico`, `apple-touch-icon` → `/icons/apple-touch-icon.png`
- **OpenGraph / Twitter:** title + description + `/icons/icon-512.png`
- **Header:** Benson logo image + “Benson” text; nav links and PRE-ALPHA / demo / outreach indicators unchanged
- **Version label:** hidden below `lg` to reduce mobile header crowding

## Verification (local)

All `curl -I` checks against `http://127.0.0.1:3000` returned **HTTP 200**:

| URL | Status |
|-----|--------|
| `/manifest.webmanifest` | 200 |
| `/icons/icon-192.png` | 200 |
| `/icons/icon-512.png` | 200 |
| `/icons/apple-touch-icon.png` | 200 |
| `/favicon.ico` | 200 |

Manifest body served Benson name/icons as specified. Home HTML includes `rel="manifest"`, favicon, apple-touch-icon, and Benson logo preload.

## Build and restart

- `pnpm build:pwa` — succeeded via `npx pnpm@9 run build` in `dashboard/` (global `pnpm` not on PATH in this shell; pre-alpha scripts use project `pnpm` successfully).
- `bash scripts/pre-alpha-stop.sh` + `bash scripts/pre-alpha-start.sh` — stack healthy; dashboard and API health checks passed.

## Production (`https://benson.kckellie.com`)

- Unauthenticated `curl` receives **302 → Cloudflare Access** login (expected; tunnel/Access config unchanged).
- After signing in, manifest and icons should match local static assets once the tunnel serves this build.
- Android install prompt / home-screen icon branding depends on browser cache (see below).

## PWA icon cache (Android / Chrome)

If the installed shortcut still shows an old icon:

1. Remove the old home-screen shortcut.
2. Clear site data for `benson.kckellie.com` (Chrome: Settings → Site settings → Storage).
3. Reinstall the PWA from the site menu (“Install app” / “Add to Home screen”).

iOS may also cache `apple-touch-icon` until Safari cache is cleared or the shortcut is re-added.

## Regenerating icons

```bash
python3 scripts/generate-benson-pwa-icons.py
```

## Remaining issues

- None blocking for branding/PWA scope.
- Production icon/manifest verification requires an authenticated Cloudflare Access session.
- Re-run `python3 scripts/generate-benson-pwa-icons.py` after replacing `benson-logo.png` if the official logo file changes.

## Scope respected

- No backend logic, routes, Cloudflare, DNS, Access, or tunnel changes.
- No new product features.
