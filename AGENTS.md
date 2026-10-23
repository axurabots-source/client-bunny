# Client Bunny - Agent Development Guide & Memory System

## ⚡ MANDATORY FIRST STEP: Read Project Memory
Before performing any research, answering questions, or writing code, every AI agent MUST:
1. Read `.ai_memory/project_state.json` - Complete active project state, architecture, current checkpoint, and immediate next steps.
2. Read `.ai_memory/session_history.jsonl` - Chronological history of past decisions.
3. Whenever a milestone or task is completed, update `.ai_memory/project_state.json` and append to `.ai_memory/session_history.jsonl`.
Never hallucinate or ask the user for context already documented in the memory ledger.

## Project Quick Reference
- **Stack:** Node.js (Express v5) + Vanilla HTML5/CSS/JS (`public/`) + Supabase PostgreSQL
- **Server Entry:** `node server.js` or `npm run dev` (Port 3000)
- **WhatsApp Engine:** `@whiskeysockets/baileys` (`modules/inbox/baileysManager.js`) - Native QR sync
- **Instagram Bridge:** ManyChat Webhook (`/api/webhooks/manychat`)
- **AI Pitches & Reply:** Google Gemini Flash API (`server.js` / `modules/pitch/`)
- **Git Repo:** `axurabots-source/client-bunny` (branch: `main`)

## Build & Run Commands
- `npm run dev` / `node server.js` - Start the local Express server on port 3000
- `node migrate_supabase.js` - Verify and sync Supabase database schema
- `make test` - Run Go unit tests with race detection (if working on scraper engine)
- `make lint` - Run golangci-lint with project configuration
- `make format` - Format Go code with gofmt

## Code Style Guidelines
- **Node.js / Web Frontend:**
  - Vanilla CSS for UI (clean, dark obsidian + emerald accents, responsive, zero sideways overflow).
  - WhatsApp Web PC aesthetic for Omnichannel Inbox (`#EFEAE2` wallpaper, `#D9FDD3` outbound bubbles, `#53BDEB` blue double checks).
  - Modular routers under `modules/` (e.g., `modules/inbox/`).
  - AES-256-GCM encryption for channel secrets via `cryptoVault.js`.
- **Go Engine (Scraper Core):**
  - Use `gofmt` for formatting (spaces, not tabs).
  - Import order: standard library, third-party, local packages (prefix: `github.com/gosom/google-maps-scraper`).
  - Use descriptive variable names (e.g., `entry`, `cfg`, `ctx`).
  - Error handling: return errors, use `fmt.Errorf` with wrapping (`%w`).
  - Use struct tags for JSON marshaling: `json:"field_name"`.
  - Constants use CamelCase (e.g., `RunModeFile`).
  - Interface names end with -er suffix (e.g., `Runner`, `S3Uploader`).
  - Use `context.Context` as first parameter in functions.
  - Prefer early returns to reduce nesting.
  - Add godoc comments for exported types and functions.