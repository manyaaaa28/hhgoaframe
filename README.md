# HH Goa 2026 — Frame Generator

Built for Task #1 (Frame / ID Card Generator) of the HH Goa 2026 shortlisting round.

**Flow:** pick team size (1–3, matches HH Goa's own team rule) → pick how the frame
divides your photos → fill each slot from gallery or camera (HEIC supported),
drag/zoom to reposition, add name + stack per teammate, drop in a few Goa-themed
stickers → download the PNG or share straight to X with `#FrameInGoa` and a
pre-filled caption.

No login, no signup, everything happens client-side except the optional
share-to-X link preview (see below).

## Stack

- Next.js 14 (App Router) + TypeScript
- `react-konva` for the interactive canvas (drag, zoom, sticker transform, export)
- `heic2any` to convert iPhone HEIC photos in-browser before rendering
- `@vercel/blob` — only used for the "share via link" fallback so the X link
  preview shows the real generated image (Twitter/X card requires a hosted
  image + an `og:image` meta tag; it can't preview a browser-only canvas)

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Go to vercel.com → New Project → import the repo. Framework preset
   `Next.js` is auto-detected, no config needed.
3. **Attach Blob storage** (only needed for the desktop link-share fallback —
   direct mobile sharing works without it):
   Project → Storage tab → Create Database → **Blob** → connect to this
   project. Vercel auto-injects `BLOB_READ_WRITE_TOKEN`; no manual env setup.
4. Deploy. That's your live link.

If you skip step 3, everything still works — Download and mobile
Share-to-X (Web Share API, attaches the image directly) function with zero
config. Only the desktop "share via link with preview" fallback needs Blob.

## How the share flow works

- **Mobile with Web Share API support:** the generated PNG is shared as an
  actual file through the OS share sheet — picking X attaches the image
  directly, no hosting needed.
- **Fallback (desktop, or unsupported browsers):** the PNG is uploaded to
  Vercel Blob, and a `/card/[id]` page is generated with `og:image` /
  `twitter:image` meta tags pointing at it. The tweet intent opens with that
  link + a pre-filled caption, so X's crawler picks up the real graphic as
  the link preview instead of a blank thumbnail.

## Notes / things to tune before submitting

- The exact HH Goa font (used in "HACKER HOUSE") isn't publicly available —
  this uses **Fraunces** (display) + **Space Mono** (labels/timestamps) as a
  close match to the site's serif-headline + mono-terminal pairing. Swap in
  `app/layout.tsx` if you get the real font files.
- Colors/frame chrome were eyeballed from screenshots
  (`--hh-green #0b5c39`, `--hh-yellow #f4d913`, `--hh-pink #ec1876`,
  `--hh-cream #f6f0de` — see `app/globals.css`). Nudge to match exactly if
  you get the official brand kit.
- Layout templates live in `lib/layouts.ts` — easy to add more frame-division
  options per team size.
- Stickers are hand-drawn Konva shapes in `lib/stickers.tsx` (no external
  image assets needed) — add more by extending `StickerKind`.
