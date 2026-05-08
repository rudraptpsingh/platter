# Platter — Claude Code skill

This file teaches Claude Code how and when to use platter's MCP tools.
Add it to your project's `CLAUDE.md` (or paste it into your global `~/.claude/CLAUDE.md`).

---

## What platter does

Platter is a macOS app that watches the folders where you drop mockups, screenshots, and other
visual artifacts. It exposes an MCP server with tools that let you — the human — decide what
passes before the session continues.

## When to use platter tools

Use platter tools whenever you generate a visual artifact that a human should see before you
proceed. Specifically:

- **After generating any HTML mockup, screenshot, image, SVG, or PDF** — call `present_mockups`
  to pause and let the user review
- **When generating multiple variants** — call `present_mockups` with `mode: "pick-one"` and a
  list of the files; the user will press a number key to pick the winner
- **When a file needs sign-off from someone who isn't in the session** — call `create_share` to
  generate a public review link; wait for the decision to come back
- **When you're confident a previous decision applies** — call `record_decision` to log it
  without interrupting

Do **not** call `present_mockups` for non-visual artifacts (code files, config files, logs)
unless the user has explicitly asked you to.

## Tool reference

### `present_mockups`

Block the session until the human approves, rejects, ranks, or picks one of the listed files.

```json
{
  "tool": "present_mockups",
  "args": {
    "paths": ["path/to/file1.html", "path/to/file2.html"],
    "mode": "approve",
    "prompt": "Which hero section do you prefer?"
  }
}
```

**Modes:**
- `"approve"` — user presses A to approve or R to reject. Returns `{ decision: "approved" | "rejected", note?: string }`
- `"pick-one"` — user presses 1–9 to pick a file. Returns `{ picked: "path/to/winner.html" }`
- `"rank"` — user drags files into preferred order. Returns `{ ranked: ["path1", "path2", ...] }`

**After a rejection:** read the `note` field in the response — it contains the user's reason.
Use it to revise and call `present_mockups` again in the same session.

### `create_share`

Generate a public review link for async stakeholder sign-off. The user can send this link to
a client or colleague who reviews in their browser. Decisions sync back to the session.

```json
{
  "tool": "create_share",
  "args": {
    "paths": ["path/to/mockup.html"],
    "prompt": "Please approve the hero section for the new landing page."
  }
}
```

Returns `{ url: "https://platter.pages.dev/share/abc123" }`.

After creating a share, either wait for the decision to arrive (the app polls automatically)
or continue with other work and check back.

### `record_decision`

Record a decision without surfacing a review modal. Use when the answer is obvious.

```json
{
  "tool": "record_decision",
  "args": {
    "path": "path/to/file.html",
    "decision": "approved",
    "note": "Matches the brief exactly"
  }
}
```

### `get_decision_history`

Look up past decisions before deciding what to do next.

```json
{
  "tool": "get_decision_history",
  "args": { "limit": 20 }
}
```

Returns an array of `{ path, decision, note, timestamp }` objects.

### `list_recent`

See what files were generated recently (useful at the start of a session to understand context).

```json
{
  "tool": "list_recent",
  "args": { "limit": 10 }
}
```

## Workflow pattern

```
1. Generate visual artifact → save to ~/github/<repo>/mockups/
2. Call present_mockups({ paths: [...], mode: "approve" })
3. If approved → continue
4. If rejected + note → read note, revise, call present_mockups again
5. If needs external review → call create_share, send URL to stakeholder
```

## Folder conventions

By default, platter watches:
- `~/github/*/mockups/`
- `~/github/*/.claude/worktrees/*/mockups/`
- `~/github/*/screenshots/`
- `~/github/*/artifacts/`

Save generated files to one of these locations so platter picks them up automatically.

## Notes

- `present_mockups` is a **blocking call** — the session pauses until the human responds
- If platter is not running, the call will time out after 60 seconds
- Decisions are stored locally in SQLite and available via `get_decision_history`
- The user can also approve/reject files manually in the gallery at any time; those decisions
  are also available via `get_decision_history`
