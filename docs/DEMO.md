# Recording the demo gif

A 15-second screen recording of the agent → modal → decision loop is the single most effective marketing asset for platter. Plant it on the landing page, in the GitHub README, and in every Show HN / Twitter post.

## What to capture

The demo should answer **"what does this actually do"** in 10 seconds, with no narration:

1. **A terminal**, where Claude Code is running with platter wired up via `claude mcp add`
2. **The platter window** showing a few mockups
3. The user types something to Claude like *"give me three hero variants for the Penova landing page"*
4. Claude generates 3 HTML mockups, files appear in platter's grid
5. Claude calls `present_mockups({ mode: "pick_one" })` — the dark stage modal pops in platter
6. User presses **`2 ⏎`** — picks variant B
7. Modal closes, Claude continues with the chosen variant
8. End frame: hold on the platter window for 1s with the chosen mockup highlighted

## Screen setup

- Resolution: **1920×1200** (16:10) for high-density Twitter and OG image cards
- Window arrangement: terminal on the left half, platter on the right half. Use [Magnet](https://magnet.crowdcafe.com) or `Rectangle.app` for clean halves.
- macOS Light Mode (the cream paper aesthetic depends on it)
- Increase terminal font size to 16pt+ so it's legible at 720p downscaled
- Hide your dock and menu bar (`System Settings → Desktop & Dock → Automatically hide and show`)

## Recording tools

**Best for landing-page hero**: [`Kap`](https://getkap.co) (free, open source) — exports gif and high-quality mp4

```bash
brew install --cask kap
```

**Best for high-quality video**: macOS built-in `Cmd+Shift+5` records mp4 directly

## Encoding for the web

After recording, optimize:

```bash
# Install ffmpeg + gifsicle if needed
brew install ffmpeg gifsicle

# Step 1: trim to exactly 15 seconds (adjust -ss start time)
ffmpeg -i raw.mov -ss 0 -t 15 -c:v libx264 -crf 18 trimmed.mp4

# Step 2: scale + convert to optimized gif
ffmpeg -i trimmed.mp4 -vf "fps=18,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" platter-demo.gif

# Step 3: optimize gif size
gifsicle -O3 --lossy=80 -o platter-demo-optimized.gif platter-demo.gif
```

Target: under 4MB for the gif (Twitter limit is 15MB but smaller loads faster on the landing page).

For the landing page, **use the mp4** with `<video autoplay muted loop playsinline>` — much higher quality and smaller filesize than the gif equivalent.

## The actual demo script (run this in your terminal)

While platter is open, switch to a project folder and run this. The exact prompt below produces a clean recording:

```bash
cd ~/github/Penova   # or any project with a mockups/ folder

claude
> Generate three hero variants for the Penova landing page.
> Save them as ~/github/Penova/mockups/mac/hero-variant-A.html (editorial),
> hero-variant-B.html (bold/dark), and hero-variant-C.html (photographic).
> Then call platter.present_mockups with all three in pick_one mode and
> the prompt "Which hero variant should we ship?".
```

Claude will generate three files, then call `platter.present_mockups`. The modal pops up. Press `2 ⏎` to pick variant B. Watch Claude receive the decision and continue.

## Manual fallback (no agent, just the platter loop)

If you don't want to involve Claude Code in the recording (e.g. you're showing UI only), fire the same flow with the smoke-test stdio command:

```bash
cd ~/github/platter
cat <<EOF | src-tauri/target/release/bundle/macos/platter.app/Contents/MacOS/platter --mcp-stdio
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"present_mockups","arguments":{"paths":["$(pwd)/mockups/v1/01-empty-state.html","$(pwd)/mockups/v1/02-populated-main.html","$(pwd)/mockups/v1/05-approve-reject.html"],"prompt":"Which screen reads best?","mode":"pick_one","timeout_seconds":300,"context":{"task":"design-review","repo":"platter"}}}}
EOF
```

## Where to put the file

- `landing/screenshot.png` — first-frame still (already there from the design pass)
- `landing/demo.mp4` — the optimized mp4 for the hero section
- `landing/demo.gif` — the gif fallback (shown when video fails to autoplay)
- Update `landing/index.html` to swap `<img src="screenshot.png">` for the `<video>` once recorded

## Suggested social copy

When posting:

> Built [platter](https://github.com/rudraptpsingh/platter) — the human-in-the-loop step Claude Code is missing.
>
> Agents make mockups. The MCP server pauses. You decide in three keystrokes. Work continues.
>
> Free, open-source Mac app. Editorial-gallery aesthetic. <demo-gif>
