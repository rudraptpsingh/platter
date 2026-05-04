# platter

A Mac desktop app that watches the folders where Claude Code (and other agents) drop mockups, screenshots, and PDFs — then surfaces them in a Pinterest-style gallery so you can actually see what got generated.

> Built for the moment between *"the agent says it made something"* and *"I've actually looked at it."*

## What's here

- **`mockups/v1/`** — Editorial-gallery mockups (10 screens + an `index.html` hub + design notes). Open `index.html` in a browser to walk through every screen with live iframe thumbnails.
- **`src/`** — React + TypeScript frontend.
- **`src-tauri/`** — Rust backend (Tauri 2). File watcher, SQLite index, file serving via blob URLs.

## Run it

```bash
npm install
npm run tauri dev
```

The first launch indexes the default watch roots:

- `~/github/*/mockups/*`
- `~/github/*/.claude/worktrees/*/mockups/*`
- `~/github/*/screenshots`
- `~/github/*/artifacts`

## v1 features

- Folder tree (recency-sorted), Pinterest-style masonry grid
- Live HTML iframe thumbnails + image previews
- **Home view** — most recent files across every watched folder
- **Global search** across all indexed files
- Live folder watching via `notify-rs` — new files appear within ~1s
- Decision marks per file (approve / reject) with keyboard shortcuts (`A` / `R`)
- Preview modal with `← / →` arrow navigation through the current view

## Design

See [`mockups/v1/00-design-notes.md`](mockups/v1/00-design-notes.md) for the type system, color rationale, motion principles, and deliberate departures from macOS HIG.

Direction: editorial gallery — cream paper, ink, vermilion accent (`#C9472A`), system serif (`ui-serif` / New York) for display moments, SF system stack for body, JetBrains Mono for paths and code.

## Roadmap (next)

- MCP server (`present_mockups` blocking tool call) so Claude Code can hand mockups to a human-in-the-loop step
- Review-set hero layout (promote `index.html` + numbered siblings + sibling `.md` plan)
- Three review modes: `approve_reject`, `rank`, `pick_one`
- Sparkle auto-update + notarized DMG
