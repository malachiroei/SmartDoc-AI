# SmartDoc AI

Intelligent document scanning and autonomous filing — **Phase 1: Core Scanning & Direct Actions**.

## Stack

- **Frontend:** Next.js 16 (App Router) + Tailwind CSS 4 + PWA manifest
- **Scanning:** WebRTC camera, real-time edge detection, perspective warp, filters
- **Export:** Multi-page PDF (jsPDF) or high-res JPG
- **Integrations:** Google Drive API + SMTP email (demo mode without credentials)

## Phase 1 features

1. **CamScanner-quality scanner**
   - Live viewfinder with document edge overlay
   - Auto-crop via perspective warp + manual corner drag
   - Filters: Original, Magic Color, Grayscale, Sharp
   - Multi-page session → PDF or JPG

2. **Post-scan action modal**
   - **Save to Google Drive** — folder picker (root / last used)
   - **Send via Email** — recipient autocomplete + subject/body
   - Local download fallback

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Allow camera access (HTTPS or localhost required).

## Integrations

Copy `.env.example` → `.env.local` and fill in:

| Variable | Purpose |
|----------|---------|
| `GOOGLE_ACCESS_TOKEN` | Drive folder list + upload |
| `SMTP_*` | Real email via Nodemailer |

Without these, APIs run in **demo mode** (UI fully functional).

## Project layout

```
src/
  app/                  # Pages + API routes
  components/
    scanner/            # Camera, crop, filters, session
    actions/            # Drive + Email post-scan modal
    ui/                 # Shared primitives
  lib/
    image/              # Edge detect, warp, filters, export
    storage/            # Recent contacts / last Drive folder
```

## Phase 2 — AI Vision & 3-Strike Learning

- `POST /api/ai/classify` — Vision LLM → JSON classification (OpenAI / Gemini / Anthropic)
- `GET /api/rules/lookup` — Supabase memory lookup by vendor
- `POST /api/rules/upsert` — Increment confirmation_count; at 3 → `is_autonomous`
- Smart Routing Dialog after scan (reuse / create / manual)
- Autonomous Drive upload when `is_autonomous === true` + toast

Requires `NEXT_PUBLIC_SUPABASE_*` and at least one of `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`.

## Next phases (planned)

- Gmail ingestion & Bill Alerts
- Broader autonomous filing UI
