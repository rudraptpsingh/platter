# Setup guide

Everything needed to run platter end-to-end: the desktop app, the Cloudflare backend (share links + telemetry), and the CI/CD pipeline.

---

## User install (2 steps, no account needed)

### 1. Install the app

**Option A — DMG (recommended)**
```
Download platter_<version>_<arch>.dmg from GitHub Releases
Drag platter.app → /Applications
Launch platter
```

**Option B — Homebrew** *(formula pending cask approval)*
```bash
brew install --cask platter
```

### 2. Register the MCP server

Run once — wires platter into every Claude Code session permanently:
```bash
claude mcp add platter -- /Applications/platter.app/Contents/MacOS/platter --mcp-stdio
```

Or use the setup CLI:
```bash
npx platter-mcp-setup
```

**That's it.** No account, no API key, no GitHub sign-in required.

> **GitHub sign-in** (optional): clicking "Connect GitHub" in the sidebar footer
> shows your `@username` on share links. Not needed for any core feature.

### Default watch roots

Platter automatically watches (no config needed):
- `~/github/*/mockups/`
- `~/github/*/.claude/worktrees/*/mockups/`
- `~/github/*/screenshots/`
- `~/github/*/artifacts/`

Add custom paths in **Settings → Watch roots** (`⌘,`).

### Teach Claude when to review

Copy `docs/CLAUDE.md` into your project's `CLAUDE.md`:
```bash
cat docs/CLAUDE.md >> ~/your-project/CLAUDE.md
```

Or add it to your global `~/.claude/CLAUDE.md` so it applies everywhere.

---

## Developer setup

### Prerequisites

- macOS 13+ (development), macOS 11+ (running builds)
- Node.js 22+
- Rust stable (`rustup install stable`)
- Xcode command-line tools (`xcode-select --install`)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/)

### Run locally

```bash
git clone https://github.com/rudraptpsingh/platter
cd platter
npm install
npm run tauri dev
```

The dev server hot-reloads CSS/TSX instantly. Rust changes rebuild automatically.

The app connects to the **production** Cloudflare backend by default (`platter.pages.dev`).
Share links and telemetry will hit the live API — fine for development.

### Run with a local Cloudflare backend

Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/):
```bash
npm install -g wrangler
wrangler login
```

Create local D1 and R2 (one-time):
```bash
# Apply migrations to local D1
npx wrangler d1 execute platter-telemetry --local --file=./migrations/001_init.sql
npx wrangler d1 execute platter-telemetry --local --file=./migrations/002_shares.sql
npx wrangler d1 execute platter-telemetry --local --file=./migrations/003_collections.sql
```

Start local Pages Functions:
```bash
npm run landing:preview   # starts on http://localhost:4321
```

Point the app at local backend by adding to `src-tauri/src/lib.rs`:
```rust
// temporary — change platter.pages.dev → localhost:4321 for local testing
```

---

## Cloudflare backend setup (production)

The backend is a Cloudflare Pages project with Functions, D1, and R2.

### 1. Create Cloudflare resources

```bash
# D1 database (telemetry + share links)
npx wrangler d1 create platter-telemetry
# → copy the database_id into wrangler.toml [[d1_databases]] section

# R2 bucket (share link asset storage)
npx wrangler r2 bucket create platter-shares
```

### 2. Apply database migrations

```bash
npx wrangler d1 execute platter-telemetry --remote --file=./migrations/001_init.sql
npx wrangler d1 execute platter-telemetry --remote --file=./migrations/002_shares.sql
npx wrangler d1 execute platter-telemetry --remote --file=./migrations/003_collections.sql
```

### 3. Set environment variables

```bash
# Dashboard access secret (pick anything random)
npx wrangler pages secret put DASH_SECRET --project-name=platter

# GitHub OAuth (optional — only needed for the sidebar "Connect GitHub" button)
npx wrangler pages secret put GITHUB_CLIENT_ID --project-name=platter
npx wrangler pages secret put GITHUB_CLIENT_SECRET --project-name=platter
```

**GitHub OAuth setup** (only if you want the "Connect GitHub" feature):
1. Go to GitHub Settings → Developer settings → OAuth Apps → New OAuth App
2. Homepage URL: `https://platter.pages.dev`
3. Authorization callback URL: `https://platter.pages.dev/auth/github/callback`
4. Copy Client ID and Client Secret → set as Cloudflare secrets above

### 4. Deploy

```bash
npm run landing:deploy
# or: git push to main (triggers landing.yml CI workflow automatically)
```

---

## CI/CD setup (GitHub Actions)

### Required secrets

Set these in **GitHub → Settings → Secrets and variables → Actions**:

| Secret | How to get it |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `npx tauri signer generate -w ~/.tauri/platter-updater.key` → contents of the `.key` file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password you chose during keygen |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create Token → Pages:Edit |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → right sidebar under "Account ID" |

**Optional (for signed + notarized Mac builds):**

| Secret | How to get it |
|---|---|
| `MAC_CERT_P12_BASE64` | Export Developer ID Application cert from Keychain as .p12 → `base64 -i cert.p12` |
| `MAC_CERT_P12_PASSWORD` | Password set when exporting the .p12 |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | appleid.apple.com → App-Specific Passwords |
| `APPLE_TEAM_ID` | 10-character team ID from developer.apple.com |

Without the Apple secrets, CI still builds a working `.dmg` — it just won't be notarized (Gatekeeper shows a warning on first open, solvable with right-click → Open).

### Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | Every PR + push to `main` | Frontend build + Rust check/clippy/test + version sync |
| `landing.yml` | Push to `main` touching `landing/` | Deploys landing page to Cloudflare Pages |
| `release.yml` | Push a `v*` tag | Full Tauri build → sign → notarize → GitHub Release + auto-update |

### Cut a release

```bash
# 1. Bump version everywhere
scripts/bump-version.sh 0.6.0

# 2. Review the diff, then:
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml landing/latest.json
git commit -m "chore: bump version to v0.6.0"
git tag v0.6.0
git push origin main && git push origin v0.6.0
```

CI builds, notarizes, uploads the DMG to GitHub Releases, and updates `latest.json` on `platter.pages.dev` so existing installs auto-update.

---

## Updater key (one-time, per app)

Generate a signing keypair for the in-app updater:
```bash
npx tauri signer generate -w ~/.tauri/platter-updater.key
```

The public key goes into `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.
The private key and password go into GitHub Secrets (`TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).

> ⚠️ Never commit the private key. Store it somewhere safe (1Password, etc.).
