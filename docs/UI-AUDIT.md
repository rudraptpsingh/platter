# UI audit — text + box overflow

A running checklist for the class of bug *"the dropdown / text / panel got cropped by the app window."* Every new UI surface must clear this list before merging.

## The clipping boundaries (don't render menus inside these)

Platter has multiple stacked `overflow: hidden` containers. Anything rendered "in place" near the edge of one of them gets cut off:

- `.window` — outer Mac-window chrome with a 20px border-radius. Anything reaching the corners is clipped.
- `.app-body` (CSS grid) — the sidebar/main split.
- `.sidebar` — `overflow: hidden`. Tooltips/menus from a sidebar tree row WILL clip.
- `.main` — `overflow: hidden`. Same problem from cards.
- `.masonry-wrap` — `overflow-y: auto`. Vertical scroll AND clips anything escaping its box.
- `.review-card` — `overflow: hidden`. Modal-internal popovers clip.
- `.modal` (preview) — `overflow: hidden`.
- `.update-banner` — `overflow: hidden`.
- `.demo-window` (landing page) — `overflow: hidden`.

**Rule**: any popover, tooltip, autocomplete suggestion, or drag preview that renders OUTSIDE the immediate box must use a portal. Use `<Popover>` from `src/components/Popover.tsx`. It mounts at `document.body`, positions by `getBoundingClientRect()`, auto-flips on overflow, and closes on outside click + Escape.

```tsx
const ref = useRef<HTMLButtonElement>(null);
const [open, setOpen] = useState(false);

<button ref={ref} className="kebab-btn" onClick={() => setOpen(v => !v)}>⋯</button>
<Popover open={open} anchorRef={ref} onClose={() => setOpen(false)} anchor="bottom-end">
  <PopoverMenu items={[
    { kind: "item", label: "Edit",   onClick: doEdit },
    { kind: "item", label: "Reveal", onClick: doReveal, hint: "⌘R" },
    { kind: "separator" },
    { kind: "item", label: "Delete", onClick: doDelete, danger: true },
  ]} />
</Popover>
```

The first kebab in the codebase lives on Settings → Watch roots. Use that pattern.

## Text truncation with `text-overflow: ellipsis`

When you set `text-overflow: ellipsis; white-space: nowrap; overflow: hidden;` on a label, the user can't recover the full text. Always pair with one of:

1. **`title={fullText}`** on the truncating element — native macOS tooltip, zero work
2. **A `<Popover>` showing the full string on hover/click** — for cases where the truncation is more than one line
3. **`-webkit-line-clamp: N`** (multi-line) when 1 line is genuinely not enough — see `.review-head__h` for the pattern

### Audit log

| Element | Where | How fixed |
|---|---|---|
| `.review-head__h` | ReviewModal — Claude's prompt | Multi-line clamp (2 lines) + `title=` |
| `.tree-row__label` | Sidebar folder tree | `title={node.path}` |
| `.card__name` | Asset cards | `title={file.path}` (also on the `<article>`) |
| `.sibling-meta__name` | Review modal sibling strip | `title={path}` |
| `.pick-card__name` | Pick-one mode cards | `title={path}` |
| `.rank-item__name` | Rank mode list | `title={path}` |
| `.update-banner__sub` | Update banner | `title={fullNotes}` |
| `.root-row` | Settings → Watch roots | `title={root.glob}` on the row |

## Box overflow / panel-cropped-by-parent

If a panel SHOULD extend past its parent's bounds (e.g. a thumbnail strip that scrolls horizontally), give it its own `overflow-x: auto`. Don't rely on the parent staying generous.

### Audit log

| Surface | Risk | Fix |
|---|---|---|
| Sibling thumbnails strip in review modal | Strip is wider than modal at small sizes | Inner `.sibling-thumbs { overflow-x: auto }` ✓ |
| Children strip in review-set view | Same | Inner `.rs-strip__row { overflow-x: auto }` ✓ |
| Pick-one card row | Cards wrap to grid; no overflow | Auto-fit grid ✓ |
| Settings root list | Long globs `word-break: break-all` rather than truncating | ✓ |
| Toolbar breadcrumb | Long paths don't truncate per-segment | Future: add ellipsis on inner segments if needed |

## Common pitfalls (don't reintroduce)

1. **`white-space: nowrap` on a `<h*>` inside a flex item without `min-width: 0`** — the heading expands its container and pushes neighbors offscreen. Always set `min-width: 0` on the flex parent.
2. **Native `<select>`** — clipped by parents on some macOS versions. Don't use; use `<Popover>` instead.
3. **`position: absolute` inside a `transform`-ed ancestor** — anchor coordinates shift. Always pair with portals when the ancestor is transformed.
4. **`z-index` competing with the native macOS title-bar overlay** — use values >= 1000 for popovers, >= 200 for full-screen scrims.
5. **Tooltips that extend off-screen** — native `title=` is fine because macOS clamps automatically. A custom tooltip needs the same auto-flip logic as `<Popover>`.

## Future surfaces that need this audit

- **Right-click context menu on a card** — must use `<Popover>` (anchored to mouse position, not an element)
- **Search suggestions dropdown** — anchor below input, must portal to escape `.toolbar`
- **Folder tree right-click menu** — anchor to the row, portal because `.sidebar` clips
- **Decision-history hover card on a card** — anchor + portal
- **MCP "view active session" peek** — anchor below the dock-status row, portal
