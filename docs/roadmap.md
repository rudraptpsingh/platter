# platter — roadmap

**Where we are**: a working v1 — gallery, watcher, MCP server, three review modes. The MCP loop (agent calls `present_mockups`, blocks until human decides, decision flows back) is the moat. Nothing else in the AI-tooling space does this.

**The four things separating "prototype" from "product"**:
1. Settings UI — without it, the demo flow breaks for anyone whose folders aren't ours.
2. Notarized release at `/Applications/platter.app/...` — `claude mcp add` needs a stable path.
3. Pre-rendered PNG thumbnails — live iframes choke past ~50 items.
4. Public landing page + demo gif — the product is invisible right now.

---

## Week 1 — Daily-driver polish

- [ ] **Settings UI**: watch roots (toggle/add/remove), denylist editor — mockup screen 08 already designed
- [ ] **Pre-rendered PNG thumbnails** via headless WebKit (`platter-snapshotter` Swift CLI). Cache by content hash. Replaces live iframes in the grid.
- [ ] **Notarized release DMG** — stable `/Applications/platter.app/...` path
- [ ] **Spacebar = Quicklook**: opens the preview modal from the grid, no click needed
- [ ] **`review-resolved` event** so the modal dismisses cleanly when a review times out server-side

## Week 2 — Decision quality of life

- [ ] **Undo as a toast**: "Rejected hero-A · ⌘Z to undo" (5s window)
- [ ] **Decision history view**: smart sidebar filter, grouped by task or repo
- [ ] **Comparison mode**: pick two cards → side-by-side (`C` to enter)
- [ ] **Star ratings + tags**: persisted, filterable
- [ ] **Review-set hero layout**: when folder has `index.html` + numbered siblings + `.md`, render screen-03 layout

## Week 3 — Strengthen the agent moat

More MCP tool surface so agents can do more than just `present_mockups`:

- [ ] `record_decision(path, verdict, note?)` — agent writes a decision when it doesn't need a human
- [ ] `get_decision_history(paths[])` — agent reads past decisions to inform what to make next
- [ ] `request_iteration(path, what_to_change)` — rejection becomes structured feedback, not silence
- [ ] `list_recent(repo?, kind?, since?)` — agent asks "what have I made recently"
- [ ] **Dock bounce + macOS notification** when a review fires while platter is in the background (screen 10)
- [ ] **Async mode**: `present_mockups({async: true})` returns a `request_id`, agent polls or webhook fires

## Week 4 — Surface the wow

- [ ] **Decision log export**: one-click "copy markdown of today's decisions"
- [ ] **Approved-only contact sheet PDF**: portfolio one-pager from your week
- [ ] **Public review link**: "share this asset with a teammate, they get a private link, decision flows back to platter" — no account on their side
- [ ] **Time-lapse / brag-reel**: scroll through everything you and Claude made this week

## Week 5–6 — Light the spark

- [ ] **Landing page** at platter.app (or rudraptpsingh.github.io/platter)
- [ ] **15-second demo video** of the loop
- [ ] **Show HN + Twitter launch** with the demo gif
- [ ] **Privacy-respecting opt-in telemetry** (install count + retention)

---

## Beyond v1 — three growth horizons

### Horizon 1 (months 2–3): The team feature

A single-user app is hard to monetize. Team-review unlocks the price tag:

- **Public review links** (free, capped to N/mo on free tier)
- **Slack integration**: post asset to channel, decisions sync
- **Multi-reviewer voting** for client-facing studios

### Horizon 2 (months 3–6): Web/mobile companion

- **iPad companion**: review pending mockups while away from the desk
- **iOS push notifications** when Claude is waiting on you
- **Cloud sync of decisions** (E2E encrypted)
- Natural "Pro" SKU at $8–12/mo

### Horizon 3 (months 6+): Open the protocol

- **Cursor / Codex / custom-agent integrations** beyond Claude Code
- **Plugin system** for new file kinds (Figma frames, 3D models, video clips)
- **Public protocol spec** — platter stops being "Rudra's Mac app" and becomes a category

---

## Pricing thesis (when ready)

- **Free, forever, locally** — the goodwill compounds
- **$8/mo Pro**: cloud sync, mobile/iPad companion, public review links, unlimited watch roots
- **$99/team flat** (up to 5 seats): slack, vote tally, decision audit log
- **$49 one-time**: lifetime Pro for indie devs who hate subscriptions (~⅓ of buyers)

## The pitch

> **Platter is the human-in-the-loop step Claude Code is missing — agents make mockups, you decide in three keystrokes, work continues.**

The aesthetic is the marketing. Nothing else in AI tooling looks like Italian-print-shop vermilion on cream paper. People will screenshot the review modal without being asked.
