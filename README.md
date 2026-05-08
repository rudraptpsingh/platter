# platter

**The human-in-the-loop step Claude Code is missing.**

Platter watches the folders where Claude Code drops mockups, screenshots, and PDFs — and surfaces them in a Pinterest-style gallery on your Mac. When Claude wants your call, it pauses and asks. Three keystrokes. Or press `S` to send a link — stakeholders review in their browser, decision syncs back.

→ **[platter.pages.dev](https://platter.pages.dev)**

---

## Install

**Download** — grab the `.dmg` from [Releases](https://github.com/rudraptpsingh/platter/releases) and drag to `/Applications`.

**Homebrew** *(formula in `scripts/homebrew/platter.rb` — pending cask submission)*
```bash
brew install --cask platter
```

**Wire into Claude Code** — run once, works in every session:
```bash
claude mcp add platter -- /Applications/platter.app/Contents/MacOS/platter --mcp-stdio
```

Or use the one-command setup:
```bash
npx platter-mcp-setup
```

---

## What it does

| | |
|---|---|
| **Gallery** | Pinterest-style masonry over every watched folder. Live HTML iframe thumbnails. Recency-sorted across all projects. |
| **MCP review** | Claude calls `present_mockups()` mid-session. Platter comes forward. `A` approve, `R` reject, `1`–`9` pick one. Decision flows back. |
| **Async share** | Press `S` in any preview. A public link is generated. Stakeholder approves in their browser. Verdict syncs back automatically. |
| **Revision loop** | Reject with a note. Claude reads it, adjusts, re-presents — all inside one session. |
| **Compare** | ⌘-click two cards to open side-by-side diff. Approve/reject per pane. |
| **Slideshow** | Fullscreen slide-through of any set. Shareable as a collection link. |
| **Decisions** | Every approve/reject stored in SQLite. Exportable as Markdown. Weekly/monthly recap view. |

---

## MCP tools

Once registered, Claude has access to:

```
present_mockups      — block until human approves / rejects / picks
create_share         — generate async public review link
record_decision      — log a verdict without asking
get_decision_history — look up past decisions
list_recent          — see what was generated recently
open_folder          — navigate the gallery to a specific folder
```

Copy [`docs/CLAUDE.md`](docs/CLAUDE.md) into your project's `CLAUDE.md` to teach Claude exactly when and how to use each tool.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `A` | Approve |
| `R` | Reject |
| `1`–`9` | Pick one (pick-one mode) |
| `S` | Create share link |
| `Space` | Open preview |
| `←` / `→` | Navigate files in preview |
| `Esc` | Close modal |
| `⌘,` | Settings |
| `⌘F` | Search |

---

## Pricing

**Free for individuals and companies with three or fewer people.** No account required. No credit card.

Paid tiers for larger teams are in design — arriving later in 2026. See [platter.pages.dev/#pricing](https://platter.pages.dev/#pricing).

---

## Development

```bash
npm install
npm run tauri dev
```

**Bump version** — syncs `package.json`, `tauri.conf.json`, `Cargo.toml`, and `landing/latest.json` in one command:
```bash
scripts/bump-version.sh 0.6.0
```

**Deploy landing page:**
```bash
npm run landing:deploy
```

**Cut a release** — push a version tag; CI builds, signs, notarizes, attaches to GitHub Release, and updates the auto-update endpoint:
```bash
scripts/bump-version.sh 0.6.0 --tag
git push origin main && git push origin v0.6.0
```

---

## CI / CD

| Workflow | Trigger | What runs |
|---|---|---|
| `ci.yml` | Every PR + push to `main` | Frontend build · `cargo check` · `cargo clippy` · `cargo test` · version sync check |
| `landing.yml` | Push to `main` touching `landing/` | Deploys landing to Cloudflare Pages |
| `release.yml` | Push of `v*` tag | Tauri build → sign → notarize → GitHub Release → auto-update endpoint |

### Required secrets

| Secret | Purpose |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | In-app auto-update signature |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Key password |
| `MAC_CERT_P12_BASE64` | Apple Developer ID cert *(optional — unsigned build without it)* |
| `MAC_CERT_P12_PASSWORD` | |
| `APPLE_ID` | Notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | |
| `APPLE_TEAM_ID` | |
| `CLOUDFLARE_API_TOKEN` | Deploy landing + `latest.json` |
| `CLOUDFLARE_ACCOUNT_ID` | |

---

## Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 19, TypeScript 5.8, Vite 7 |
| Styling | Vanilla CSS (design tokens) |
| Database | SQLite (file index + decisions) |
| File watching | Rust `notify` crate |
| MCP transport | stdio JSON-RPC 2.0 |
| Auto-update | `@tauri-apps/plugin-updater` |
| Landing | Static HTML/CSS on Cloudflare Pages |
| Auth | GitHub OAuth (share link identity) |

---

## License

Free for individuals, open source projects, and companies with three or fewer people.  
Paid license required for larger companies — see [platter.pages.dev/#pricing](https://platter.pages.dev/#pricing).
