# Changelog

All notable changes to platter are documented here.
Format: `## v<version>` headers, newest first.

---

## v0.6.0 — 2026-05-08

**Design system, CI/CD, and growth infrastructure.**

- Design: semantic button tokens — `--btn-primary-bg/fg`, `--btn-approve-*`, `--btn-reject-*`
- Design: all orange/vermilion button backgrounds removed across 10 CSS files; vermilion now strictly for indicators and active states
- Design: new 2×2 grid app icon consistent with landing page logomark
- Landing: Showcase section (4 real session cards), Pricing section (Free + Coming 2026 tiers), brew install row, live GitHub star count badge
- CI: `ci.yml` — frontend build + `cargo check/clippy/test` + version sync gate on every PR
- CI: `landing.yml` — auto-deploys landing page on push to `main`
- CI: `release.yml` — version sync check before build, richer `latest.json` notes from changelog
- Fix: `latest.json` was pointing to `.dmg` (wrong for updater); now correctly points to `.app.tar.gz`
- New: `scripts/bump-version.sh` — syncs all version files in one command
- New: `scripts/mcp-setup/` — `npx platter-mcp-setup` CLI for one-command MCP registration
- New: `scripts/homebrew/platter.rb` — Homebrew cask formula
- New: `docs/CLAUDE.md` — drop-in Claude Code skill file
- New: `docs/SETUP.md` — full install + Cloudflare backend + CI secrets guide
- GitHub auth: "Connect GitHub" now ghost-styled and labelled "optional"; no feature requires it

---

## v0.5.0 — 2026-05-06

**Share links for async review.**

- New: `create_share` MCP tool — generates a public review URL for any file or set
- New: Web review page — stakeholders approve/reject in their browser at full fidelity
- New: GitHub OAuth for share link identity — reviewers sign in with GitHub
- New: Decision sync — share link verdicts flow back into the app automatically
- Fix: approve/reject on a single file now correctly records the decision
- Fix: slideshow play button no longer shows orange (uses neutral tint on dark background)
- Design: all primary action buttons now use `var(--ink)` dark fill — vermilion reserved for indicators only
- Design: semantic button design tokens (`--btn-primary-bg`, `--btn-approve-bg`, `--btn-reject-bg`) added to `tokens.css`

---

## v0.4.0 — 2026-04-18

**Revision loops and compare mode.**

- New: Revision loop — reject with a note; Claude reads it and re-presents in the same session
- New: Compare modal — ⌘-click two cards to open side-by-side diff view
- New: `open_folder` MCP tool — navigate the gallery to a specific folder programmatically
- New: Slideshow mode — fullscreen slide-through of any file set, shareable as a collection link
- New: Worktree branch filter pill in toolbar — filter by Claude Code worktree
- Improved: Review modal keyboard handling — `1`–`9` for pick-one, `←/→` to navigate siblings
- Improved: Sidebar footer — GitHub account sign-in, connection status

---

## v0.3.0 — 2026-03-29

**Review sets and the MCP server.**

- New: MCP server — `present_mockups`, `record_decision`, `get_decision_history`, `list_recent`
- New: Review-set view — when a folder contains `index.html` + numbered variants + `.md` plan, it's promoted as a structured set with hero layout
- New: Blocking review modal — Claude calls `present_mockups()`, platter comes forward, session pauses
- New: Three review modes: `approve`, `reject`, `pick-one`
- New: Dock badge for pending review requests
- Improved: File-type filter pills (html, png, jpg, pdf, svg, md)
- Improved: Decision-state filter pills (approved / rejected / undecided)

---

## v0.2.0 — 2026-03-08

**Decisions and search.**

- New: Approve / reject per file with `A` / `R` keyboard shortcuts
- New: Decision marks on cards — green checkmark, red X
- New: Decisions view — Approved, Rejected, All tabs
- New: Decision export — Markdown export (today / this week / this month / all)
- New: Recap view — weekly/monthly summary of what was made and decided
- New: Global search across all indexed files
- New: Preview modal — fullscreen preview with `←/→` navigation

---

## v0.1.0 — 2026-02-20

**Initial release.**

- Mac desktop app (Tauri v2, Apple Silicon)
- Watches `~/github/*/mockups/`, `screenshots/`, `artifacts/`
- Pinterest-style masonry gallery with live HTML iframe thumbnails
- Sidebar with Recent view + per-repo folder tree
- Live file-system watching (~1s latency on new files)
- Auto-updater via Cloudflare Pages endpoint
