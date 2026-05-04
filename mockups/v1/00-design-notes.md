# platter — design notes

## Aesthetic direction: editorial gallery

Asset review is a moment of judgment. A critic at a print room. An editor on a contact sheet. Not a file manager, not a chat sidebar. Platter borrows from that world: cream paper, ink, hairlines, generous whitespace, italic display moments. The app itself is the platter — a curated tray, not a dump.

Deliberate departure from the iOS-blue / indigo-gradient default that dominates modern AI tooling. Platter should feel quietly considered when sitting in your dock, and feel important when it asks for a decision.

## Type system

- **Display — Instrument Serif (italic)**. Free, characterful, editorial. Used sparingly: window subtitle, prompts during review, hero copy on the empty state. The italic carries the "this is a moment" feeling. Roman cuts only when italic would harm rhythm.
- **Body — SF system stack** (`-apple-system, BlinkMacSystemFont, …`). Authentic Mac feel — the text reads as part of the OS, not an Electron veneer. Letter-spacing nudged ‑0.5% for Mac-app density.
- **Mono — JetBrains Mono → SF Mono fallback**. Paths, globs, keyboard hints, file metadata, the `claude mcp add` command. Mono is *only* used for things that are literally code or paths — it's a signal, not decoration.

## Color

- **Paper** `#F4EFE5` — warm off-white, slightly creamy. Not pure white; pure white reads digital. The grain overlay (subtle SVG noise at 6% opacity, multiply blend) reinforces the paper feeling without being twee.
- **Ink** `#1B1714` — warm near-black. Pure black is dead.
- **Vermilion** `#C9472A` — the single brand accent. The color of Italian print-shop ink, of book-cover spot color, of a stamp on archival paper. Reads "considered craft," not "tech startup." Used for: brand mark, the focused state ring, the "new since last visit" dot, the active filter chip.
- **Sage** `#6E7F58` for **approve** — a muted, considered green. Spring green would be too cheerful; this is the green of an approval stamp.
- **Brick** `#A04428` for **reject** — sits in the vermilion family but darker and earthier. Reads serious, not alarming.
- **Void** `#14110D` — dark mode used *only* during review modals. The rest of the app is paper. The shift to dark when Claude asks for a decision is the visual equivalent of the lights dimming in a theater: you are now looking at the work.

## Motion principles

- One orchestrated reveal per screen entry — staggered, never simultaneous. The grid tiles in cascade on load (50ms apart, ease-out), the review modal scales up from 0.96 with a 200ms ease-spring.
- Hover lifts are tiny: 1–2px translate + soft shadow gain. No card pop, no flip, no bounce on common surfaces.
- Decisions are deliberate. Approve/reject buttons take 200ms to fill on hover — fast enough to feel responsive, slow enough that you don't accidentally stamp something.
- Keyboard wins over click. Every decision has a single-key shortcut visible in mono-typeset hints.

## Layout

- Cards: 12px corner radius. Soft, non-directional shadows (0 6px 20px / 7% opacity). On hover: the border thins toward vermilion at 45% opacity.
- Hairlines (0.5px-equivalent) over heavy borders. Borders always 6–10% opacity over ink, never solid lines.
- Generous gutters: 24px between cards in the masonry, 32px between sections in the review surface.
- Asymmetric grid: when a folder has an `index.html`, that card spans 2 columns and 1.4× height — a deliberate hierarchical break that reads "this is the hub."

## Deliberate departures from macOS HIG

- **System fonts for body, but italic Instrument Serif for moments.** HIG recommends SF for everything. We override only for display copy where the italic serif communicates "this is curated," not "this is a control."
- **No window title in the conventional sense.** The titlebar centers an italic mark (`platter`) instead of the active folder name. The folder is conveyed by sidebar selection + breadcrumb in the toolbar — the titlebar is brand surface, not navigation.
- **Custom button shapes for the decision moment.** Approve/Reject are pill buttons in display-italic type — they look like editorial captions, not OS controls. This is intentional: a system-styled button would erase the gravity of the moment.
- **Vibrancy used sparingly.** Toolbar and sidebar use it; the masonry grid sits on solid paper. Vibrancy on the gallery would compete with the assets being reviewed.

## Accessibility

- Decision colors paired with iconography (✓ / ✕) and keyboard hints — never color-alone signaling.
- Vermilion-on-paper passes 4.5:1; sage and brick on paper hit ≥4.8:1 for body text size.
- Grain overlay disabled under `prefers-reduced-transparency` (the mockups don't fully implement this — a v2 polish note).
- All interactive elements ≥28px hit target.

## What these mockups are *not*

These are HTML mockups for design review, not the implementation. The Tauri shell will use system controls where it can (NSWindow chrome, NSToolbar, system materials). The cream paper, vermilion, and Instrument Serif moments come through the React UI layer.
