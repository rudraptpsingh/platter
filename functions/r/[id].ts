// GET /r/:id — public single-asset review page.

import { ShareEnv, jsonError, loadShare } from "../_share-lib";

export const onRequest: PagesFunction<ShareEnv, "id"> = async (ctx) => {
  if (ctx.request.method !== "GET") return jsonError(405, "method not allowed");

  const result = await loadShare(ctx.env, ctx.params.id as string);
  if (!result.ok) return errorPage(result.response.status, await safeText(result.response));
  const { row } = result;

  const html = renderPage(row.id, row.filename, row.kind, row.prompt);
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
};

async function safeText(r: Response): Promise<string> {
  try { const j = (await r.json()) as { error?: string }; return j.error ?? "Something went wrong."; }
  catch { return "Something went wrong."; }
}

function esc(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function errorPage(status: number, message: string): Response {
  const headline = status === 404 ? "This review link doesn't exist."
    : status === 410 ? "This review has expired."
    : "Something went wrong.";
  return new Response(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>platter — ${esc(headline)}</title>${BASE_STYLES}</head>
<body class="body--center">
<div class="err">
  <div class="err__code">★ ${status}</div>
  <h1 class="err__h">${esc(headline)}</h1>
  <p class="err__msg">${esc(message)}</p>
  <a class="err__home" href="https://platter.pages.dev">platter.pages.dev →</a>
</div></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderPage(id: string, filename: string, kind: string, prompt: string | null): string {
  const isHtml  = kind === "html" || kind === "htm";
  const isImage = ["png","jpg","jpeg","gif","svg","webp"].includes(kind);
  const isPdf   = kind === "pdf";
  const assetUrl = `/api/share/${id}?raw=1`;
  const promptText = prompt ? esc(prompt) : "What do you think?";
  const safeName   = esc(filename);
  const BASE = "https://platter.pages.dev";
  const ogImage  = isImage ? `${BASE}/api/share/${id}?raw=1` : `${BASE}/screenshot.png`;
  const twCard   = isImage ? "summary_large_image" : "summary";

  let innerEl = "";
  if (isHtml) {
    innerEl = `<iframe id="asset" class="asset asset--frame" src="${assetUrl}"
      sandbox="allow-same-origin allow-scripts" title="${safeName}"></iframe>`;
  } else if (isImage) {
    innerEl = `<img id="asset" class="asset asset--img" src="${assetUrl}" alt="${safeName}">`;
  } else if (isPdf) {
    innerEl = `<embed id="asset" class="asset asset--frame" src="${assetUrl}" type="application/pdf">`;
  } else {
    innerEl = `<a id="asset" class="asset asset--fallback" href="${assetUrl}" target="_blank" rel="noopener">Download ${safeName} ↗</a>`;
  }

  return /* html */`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeName} — platter review</title>
<meta property="og:title" content="${safeName} · review request">
<meta property="og:description" content="${promptText}">
<meta property="og:image" content="${ogImage}">
<meta property="og:type" content="website">
<meta property="og:url" content="${BASE}/r/${id}">
<meta name="twitter:card" content="${twCard}">
<meta name="twitter:title" content="${safeName} · review request">
<meta name="twitter:description" content="${promptText}">
<meta name="twitter:image" content="${ogImage}">
<meta name="theme-color" content="#14110D">
${BASE_STYLES}
${PAGE_STYLES}
</head>
<body>

  <!-- Floating header -->
  <header class="hd" id="hd">
    <a class="brand" href="https://platter.pages.dev" tabindex="-1">
      <svg class="brand__logo" width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="22" height="22" rx="5" fill="#13100D"/>
        <ellipse cx="11" cy="9.2" rx="6.6" ry="2.1" fill="#5A5652"/>
        <rect x="4.4" y="12.9" width="13.2" height="1.65" rx="0.5" fill="#B8B0A4"/>
        <ellipse cx="11" cy="12.9" rx="6.6" ry="2.1" fill="#EDE7DA"/>
        <ellipse cx="11" cy="12.6" rx="5.2" ry="1.5" fill="#F6F0E6"/>
      </svg>
      <span class="brand__name">platter</span>
    </a>
    <span class="hd__file">${safeName}</span>
    <button class="hd__copy" id="copyBtn" title="Copy link (C)">
      <svg class="hd__copy-icon" width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="5" y="5" width="9" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
        <path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="1.4"/>
      </svg>
      <span class="hd__copy-label">Copy link</span>
    </button>
  </header>

  <!-- Prompt -->
  <div class="prompt" id="prompt">
    <div class="prompt__eyebrow">★ a review is requested</div>
    <h1 class="prompt__h">${promptText}</h1>
  </div>

  <!-- Stage -->
  <div class="stage" id="stage">
    <div class="stage__shimmer" id="shimmer"></div>
    <div class="asset-wrap" id="assetWrap">${innerEl}</div>
    <div class="stage__actions">
      ${isHtml ? `
      <button class="stage__dl" id="copyCodeBtn" title="Copy HTML source">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M5 4L1 8l4 4M11 4l4 4-4 4M9 2l-2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Copy code
      </button>` : ''}
      <button class="stage__dl" id="dlBtn" title="Download file">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2M8 2v8M5 7l3 3 3-3"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Download
      </button>
    </div>
  </div>

  <!-- Bottom HUD -->
  <div class="hud" id="hud">
    <div class="hud__card">
      <!-- Note area — collapsed until opened -->
      <div class="hud__note-wrap" id="noteWrap">
        <textarea class="hud__note" id="noteInput"
                  placeholder="Leave a note for the creator…" rows="3" maxlength="4000"></textarea>
      </div>
      <!-- Action row -->
      <div class="hud__row">
        <input class="hud__name" id="nameInput" type="text"
               placeholder="Your name" maxlength="80" autocomplete="name">
        <div class="hud__actions">
          <button class="act act--reject"  data-d="rejected"  type="button" title="Reject">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            <span>Reject</span>
          </button>
          <button class="act act--revise"  data-d="iterated"  id="reviseBtn" type="button" title="Request changes with a note">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 10.5V12h1.5l5.06-5.06-1.5-1.5L2 10.5zM11.71 3.29a1 1 0 0 0-1.42 0L9.06 4.52l1.5 1.5 1.15-1.15a1 1 0 0 0 0-1.58z" fill="currentColor"/>
            </svg>
            <span>Revise</span>
          </button>
          <button class="act act--approve" data-d="approved"  type="button" title="Approve">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Approve</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Verdict overlay (shown after decision) -->
  <div class="verdict" id="verdict" hidden>
    <div class="verdict__icon" id="verdictIcon"></div>
    <h2 class="verdict__h" id="verdictH"></h2>
    <p class="verdict__sub" id="verdictSub"></p>
    <button class="verdict__undo" id="undoBtn" type="button">Change my mind</button>
  </div>

<script>
(function() {
  const SHARE_ID  = ${JSON.stringify(id)};
  const asset     = document.getElementById('asset');
  const shimmer   = document.getElementById('shimmer');
  const hud       = document.getElementById('hud');
  const verdict   = document.getElementById('verdict');
  const verdictIcon = document.getElementById('verdictIcon');
  const verdictH    = document.getElementById('verdictH');
  const verdictSub  = document.getElementById('verdictSub');
  const undoBtn   = document.getElementById('undoBtn');
  const nameInput = document.getElementById('nameInput');
  const noteInput = document.getElementById('noteInput');
  const noteWrap  = document.getElementById('noteWrap');
  const reviseBtn = document.getElementById('reviseBtn');
  const buttons   = document.querySelectorAll('.act');

  // Revise button opens the note area; clicking again collapses it
  function openNote() {
    noteWrap.classList.add('open');
    reviseBtn.classList.add('act--open');
    requestAnimationFrame(() => noteInput.focus());
  }
  function closeNote() {
    if (noteInput.value.trim()) return; // keep open if there's content
    noteWrap.classList.remove('open');
    reviseBtn.classList.remove('act--open');
  }

  reviseBtn.addEventListener('click', (e) => {
    if (noteWrap.classList.contains('open') && !noteInput.value.trim()) {
      closeNote();
      // Don't submit if just toggling
      return;
    }
    if (!noteWrap.classList.contains('open')) {
      openNote();
      return; // first click just opens — user adds note then clicks again to submit
    }
    // Note is open and has content (or empty) — fall through to submit
    submit('iterated');
  });

  // On desktop render the full 1280×800 layout; on mobile use the device viewport
  // so narrow designs don't appear as a tiny scaled-down desktop view.
  const isMobile  = window.innerWidth < 768;
  const NATIVE_W  = isMobile ? window.innerWidth  : 1280;
  const NATIVE_H  = isMobile ? window.innerHeight : 800;
  const assetWrap = document.getElementById('assetWrap');

  function fitFrame() {
    if (!assetWrap) return;
    const stageEl = document.getElementById('stage');
    const hudEl   = document.getElementById('hud');
    const topPad  = 20;
    const botPad  = (hudEl ? hudEl.offsetHeight : 90) + 20;
    // Push bottom padding so flex centering keeps the frame above the fixed HUD
    stageEl.style.paddingBottom = botPad + 'px';
    const availW  = stageEl.clientWidth  - 56;            // 28px side padding × 2
    const availH  = stageEl.clientHeight - topPad - botPad;
    const scale   = Math.min(availW / NATIVE_W, availH / NATIVE_H, 1);
    const fw = Math.round(NATIVE_W * scale);
    const fh = Math.round(NATIVE_H * scale);
    assetWrap.style.width  = fw + 'px';
    assetWrap.style.height = fh + 'px';
    if (asset && asset.tagName === 'IFRAME') {
      asset.style.width     = NATIVE_W + 'px';
      asset.style.height    = NATIVE_H + 'px';
      asset.style.transform = 'translate(-50%,-50%) scale(' + scale + ')';
    }
  }
  // Size the frame immediately so the iframe has a container before it loads
  fitFrame();
  window.addEventListener('resize', fitFrame);

  // Hide shimmer once asset loads
  function onLoad() {
    shimmer.style.opacity = '0';
    setTimeout(() => shimmer.remove(), 400);
    fitFrame();
  }
  if (asset) {
    asset.addEventListener('load', onLoad);
    asset.addEventListener('error', onLoad);
    if (asset.complete || asset.readyState === 4) onLoad();
  }

  const LABELS = {
    approved: {
      icon: '✓', cls: 'verdict__icon--ok',
      h: 'Approved.',
      sub: 'The creator will see your decision in the platter app. Thanks for the green light.'
    },
    rejected: {
      icon: '✕', cls: 'verdict__icon--warn',
      h: 'Rejected.',
      sub: 'Noted. Click Iterate instead to send specific feedback on what to change.'
    },
    iterated: {
      icon: '↻', cls: 'verdict__icon--gold',
      h: 'Iteration requested.',
      sub: 'Your note is on its way. The creator can read it and decide what to adjust.'
    },
  };

  async function submit(decision) {
    buttons.forEach(b => b.disabled = true);
    const body = {
      decision,
      reviewer_name: nameInput.value.trim() || undefined,
      note: noteInput.value.trim() || undefined,
    };
    try {
      const r = await fetch('/api/share/' + SHARE_ID + '/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert('Submit failed: ' + (j.error || r.statusText));
        buttons.forEach(b => b.disabled = false);
        return;
      }
      const lbl = LABELS[decision] || LABELS.approved;
      verdictIcon.textContent = lbl.icon;
      verdictIcon.className   = 'verdict__icon ' + lbl.cls;
      verdictH.textContent    = lbl.h;
      verdictSub.textContent  = lbl.sub;
      hud.hidden = true;
      verdict.hidden = false;
    } catch(e) {
      alert('Submit failed: ' + e.message);
      buttons.forEach(b => b.disabled = false);
    }
  }

  // Approve + Reject submit directly; Revise is handled above
  document.querySelectorAll('.act--reject, .act--approve').forEach(b => {
    b.addEventListener('click', () => submit(b.dataset.d));
  });
  undoBtn.addEventListener('click', () => {
    verdict.hidden = true;
    hud.hidden = false;
    buttons.forEach(b => b.disabled = false);
  });

  // Asset buttons
  const ASSET_URL  = ${JSON.stringify(`/api/share/${id}?raw=1`)};
  const ASSET_NAME = ${JSON.stringify(filename)};

  const dlBtn       = document.getElementById('dlBtn');
  const copyCodeBtn = document.getElementById('copyCodeBtn'); // null for non-HTML

  // Download — always
  dlBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = ASSET_URL; a.download = ASSET_NAME; a.click();
  });

  // Copy code — HTML only
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', async () => {
      copyCodeBtn.disabled = true;
      try {
        const resp = await fetch(ASSET_URL);
        const text = await resp.text();
        await navigator.clipboard.writeText(text);
        const orig = copyCodeBtn.innerHTML;
        copyCodeBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Copied!';
        copyCodeBtn.classList.add('stage__dl--ok');
        setTimeout(() => { copyCodeBtn.innerHTML = orig; copyCodeBtn.classList.remove('stage__dl--ok'); }, 2000);
      } catch(e) { alert('Failed: ' + e.message); }
      finally { copyCodeBtn.disabled = false; }
    });
  }

  // Copy link button
  const copyBtn   = document.getElementById('copyBtn');
  const copyLabel = copyBtn.querySelector('.hd__copy-label');
  function copyLink() {
    navigator.clipboard.writeText(location.href).then(() => {
      copyBtn.classList.add('hd__copy--ok');
      copyLabel.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.classList.remove('hd__copy--ok');
        copyLabel.textContent = 'Copy link';
      }, 2000);
    });
  }
  copyBtn.addEventListener('click', copyLink);
  window.addEventListener('keydown', e => {
    if (e.target === nameInput || e.target === noteInput) return;
    if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) copyLink();
  });
})();
</script>
</body>
</html>`;
}

const BASE_STYLES = /* html */`
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
:root {
  --void:#14110D; --void-2:#1C1710; --void-3:#252019;
  --void-ink:#E8DFCD; --void-ink-2:rgba(232,223,205,0.65); --void-ink-3:rgba(232,223,205,0.38);
  --void-line:rgba(232,223,205,0.10); --void-line-2:rgba(232,223,205,0.18);
  --vermilion:#C9472A; --vermilion-soft:rgba(201,71,42,0.18);
  --sage:#6E7F58; --sage-soft:rgba(110,127,88,0.18);
  --brick:#A04428; --brick-soft:rgba(160,68,40,0.18);
  --gold:#B58A3D; --gold-soft:rgba(181,138,61,0.18);
  --r:10px; --r-lg:14px; --r-xl:20px;
  --ease:cubic-bezier(0.22,1,0.36,1);
}
*,*::before,*::after{box-sizing:border-box;}
[hidden]{display:none !important;}
html,body{margin:0;padding:0;height:100%;background:var(--void);color:var(--void-ink);}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;
  font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased;}
body.body--center{display:flex;align-items:center;justify-content:center;min-height:100vh;}
a{color:var(--vermilion);text-decoration:none;}
a:hover{text-decoration:underline;}
button{font-family:inherit;cursor:pointer;}
.err{text-align:center;max-width:520px;padding:40px 24px;}
.err__code{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.2em;
  text-transform:uppercase;color:var(--vermilion);margin-bottom:16px;}
.err__h{font-family:ui-serif,"New York",Georgia,serif;font-style:italic;font-weight:400;
  font-size:36px;line-height:1.05;letter-spacing:-.02em;margin:0 0 14px;}
.err__msg{color:var(--void-ink-2);margin:0 0 24px;}
.err__home{font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.06em;color:var(--void-ink-3);}
</style>`;

const PAGE_STYLES = /* html */`
<style>
/* ── Layout: header + prompt stack, stage fills rest, hud floats over bottom ── */
html, body { height: 100%; overflow: hidden; }
body {
  display: grid;
  grid-template-rows: auto auto 1fr;
  grid-template-areas: "hd" "prompt" "stage";
  min-height: 0;
}

/* ── Header ── */
.hd {
  grid-area: hd;
  display: flex; align-items: center; gap: 12px;
  padding: 16px 24px 12px;
  z-index: 20;
}
.brand { display:flex;align-items:center;gap:9px;text-decoration:none; }
.brand__logo { width:22px;height:22px;flex-shrink:0;border-radius:5px; }
.brand__name {
  font-family:ui-serif,"New York",Georgia,serif;font-style:italic;
  font-size:17px;color:var(--void-ink);letter-spacing:-.01em;
}
.hd__file {
  margin-left:auto;
  font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.05em;
  color:var(--void-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  max-width:40%;
}
.hd__copy {
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 5px;
  background: rgba(232,223,205,0.06);
  border: 1px solid var(--void-line-2);
  border-radius: 999px;
  padding: 5px 11px 5px 9px;
  color: var(--void-ink-3);
  font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: .04em;
  cursor: pointer;
  transition: all .15s var(--ease);
  white-space: nowrap;
}
.hd__copy:hover { background: rgba(232,223,205,0.1); color: var(--void-ink); border-color: rgba(232,223,205,.3); }
.hd__copy--ok   { background: rgba(110,127,88,.18); border-color: rgba(110,127,88,.5); color: #B9C8A4; }

/* ── Prompt ── */
.prompt {
  grid-area: prompt;
  text-align:center;padding:8px 40px 14px;
}
.prompt__eyebrow {
  font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.22em;
  text-transform:uppercase;color:var(--vermilion);margin-bottom:8px;
}
.prompt__h {
  font-family:ui-serif,"New York",Georgia,serif;font-style:italic;font-weight:400;
  font-size:clamp(20px,3vw,30px);line-height:1.15;letter-spacing:-.025em;
  margin:0;color:var(--void-ink);
  overflow-wrap:break-word;word-break:break-word;
}

/* ── Stage ── */
.stage {
  grid-area: stage;
  display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
  padding: 20px 28px 0; /* bottom set dynamically by fitFrame() */
  background: #2C2620;
}
.stage__shimmer {
  position: absolute; inset: 0;
  background: linear-gradient(135deg, #2e2620 25%, #3a2e24 50%, #2e2620 75%);
  background-size: 200% 200%;
  animation: shimmer 1.8s ease infinite;
  transition: opacity .4s;
  pointer-events: none;
}
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

/* Frame container — sized by JS, matches app's asset-frame */
.asset-wrap {
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 10px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.45);
  background: #FFFCF4;
  animation: assetIn .25s var(--ease);
}
@keyframes assetIn { from{opacity:0;transform:scale(.975)} to{opacity:1;transform:scale(1)} }

/* HTML iframe — absolutely centered, scaled by JS transform (matches app's ScaledModalIframe) */
.asset--frame {
  position: absolute; top: 50%; left: 50%;
  border: none; background: #FFFCF4; display: block;
  transform-origin: center center;
}
/* Images fill the wrap container */
.asset--img {
  width: 100%; height: 100%;
  object-fit: contain; display: block; border: none;
}
/* PDF embed fills the wrap */
.asset--pdf { width: 100%; height: 100%; border: none; display: block; }
/* Fallback link */
.asset--fallback {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%;
  font-family: 'JetBrains Mono', monospace; font-size: 13px;
  color: var(--void-ink-2); text-decoration: none;
}
.asset--fallback:hover { color: var(--void-ink); }

/* Asset action buttons — overlay on stage hover */
.stage__actions {
  position: absolute; bottom: 14px; right: 40px;
  display: flex; gap: 6px; align-items: center;
  opacity: 0; transition: opacity .18s var(--ease); z-index: 4;
}
.stage:hover .stage__actions,
.stage__actions:focus-within { opacity: 1; }
.stage__dl {
  display:inline-flex;align-items:center;gap:5px;
  background:rgba(20,17,13,0.75);
  border:1px solid var(--void-line-2);
  border-radius:999px;
  padding:5px 12px 5px 10px;
  color:var(--void-ink-2);
  font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.04em;
  cursor:pointer;white-space:nowrap;
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  transition:background .15s var(--ease),color .15s var(--ease),border-color .15s var(--ease);
}
.stage__dl:hover { background:rgba(232,223,205,0.12);color:var(--void-ink); }
.stage__dl--ok   { background:rgba(110,127,88,.2);border-color:rgba(110,127,88,.5);color:#B9C8A4; }
.stage__dl:disabled { cursor:wait;opacity:.5; }

/* ── Bottom HUD — fixed overlay over stage bottom ── */
.hud {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  padding: 0 16px max(20px, env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--void) 55%, transparent 100%);
  display: flex; justify-content: center;
  pointer-events: none;
  z-index: 20;
}
/* The actual visible card */
.hud__card {
  pointer-events: all;
  width: 100%; max-width: 520px;
  background: rgba(26,21,15,0.95);
  border: 1px solid var(--void-line-2);
  border-radius: 18px;
  padding: 12px 14px 14px;
  -webkit-backdrop-filter: blur(32px);
  backdrop-filter: blur(32px);
  box-shadow: 0 8px 40px rgba(0,0,0,0.55), 0 1px 0 rgba(232,223,205,0.06) inset;
  display: flex; flex-direction: column; gap: 10px;
}
/* Note area — collapsed by default, revealed via JS */
.hud__note-wrap {
  overflow: hidden;
  max-height: 0;
  transition: max-height .25s var(--ease), opacity .2s var(--ease);
  opacity: 0;
}
.hud__note-wrap.open {
  max-height: 140px;
  opacity: 1;
}
.hud__note {
  width: 100%;
  font-family: inherit; font-size: 13px; resize: none;
  background: rgba(232,223,205,0.05);
  border: 1px solid var(--void-line-2);
  border-radius: 10px; padding: 10px 12px;
  color: var(--void-ink); outline: none;
  line-height: 1.5;
  min-height: 72px; max-height: 120px;
  transition: border-color .15s var(--ease), background .15s var(--ease);
}
.hud__note::placeholder { color: var(--void-ink-3); font-style: italic; }
.hud__note:focus { background: rgba(232,223,205,0.07); border-color: rgba(232,223,205,.28); }

/* Action row: name + buttons side by side */
.hud__row {
  display: flex; align-items: center; gap: 8px;
}
.hud__name {
  flex: 0 0 auto; width: 130px;
  font-family: inherit; font-size: 12px;
  background: transparent;
  border: none; border-bottom: 1px solid var(--void-line-2);
  border-radius: 0;
  padding: 5px 2px;
  color: var(--void-ink); outline: none;
  transition: border-color .15s var(--ease);
}
.hud__name::placeholder { color: var(--void-ink-3); font-style: italic; }
.hud__name:focus { border-bottom-color: rgba(232,223,205,.35); }

.hud__actions { display: flex; gap: 6px; flex: 1; }

.act {
  flex: 1;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 10px; font-size: 13px; font-weight: 500;
  border-radius: 10px; border: 1px solid;
  transition: all .16s var(--ease); letter-spacing: -.01em;
  background: transparent; white-space: nowrap;
}
.act svg { flex-shrink: 0; }
.act:disabled { opacity: .35; cursor: progress; }

.act--reject  { color: #E0987F; border-color: rgba(160,68,40,.4);  background: rgba(160,68,40,.08); }
.act--revise  { color: #D4B87A; border-color: rgba(181,138,61,.4); background: rgba(181,138,61,.08); }
.act--approve { color: #B9C8A4; border-color: rgba(110,127,88,.4); background: rgba(110,127,88,.08); }

.act--reject:hover:not(:disabled)          { background: #A04428; border-color: #A04428; color: #F8F4E8; }
.act--revise:hover:not(:disabled),
.act--revise.act--open                     { background: rgba(181,138,61,.18); border-color: rgba(181,138,61,.7); color: #D4B87A; }
.act--approve:hover:not(:disabled)         { background: #6E7F58; border-color: #6E7F58; color: #F8F4E8; }
.act:active:not(:disabled) { transform: scale(.96); }

/* ── Verdict overlay ── */
.verdict {
  grid-column:1/-1; grid-row:1/-1;
  position: fixed; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: rgba(20,17,13,.93);
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
  z-index: 100; padding: 40px 24px; text-align: center;
  animation: fadeIn .3s var(--ease);
}
@keyframes fadeIn { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
.verdict__icon {
  width: 80px; height: 80px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 36px; margin-bottom: 24px;
  animation: iconPop .4s var(--ease);
}
@keyframes iconPop { from{transform:scale(.5);opacity:0} to{transform:scale(1);opacity:1} }
.verdict__icon--ok   { background:rgba(110,127,88,.2); color:#B9C8A4; border:1.5px solid rgba(110,127,88,.4); }
.verdict__icon--warn { background:rgba(160,68,40,.2);  color:#E0987F; border:1.5px solid rgba(160,68,40,.4); }
.verdict__icon--gold { background:rgba(181,138,61,.2); color:#D4B87A; border:1.5px solid rgba(181,138,61,.4); }
.verdict__h {
  font-family: ui-serif,"New York",Georgia,serif; font-style: italic; font-weight: 400;
  font-size: clamp(28px,4vw,42px); line-height: 1.05; letter-spacing: -.025em;
  margin: 0 0 12px;
}
.verdict__sub {
  color: var(--void-ink-2); font-size: 15px; max-width: 480px;
  margin: 0 0 32px; line-height: 1.55;
}
.verdict__undo {
  background: transparent; color: var(--void-ink-3);
  border: 1px solid var(--void-line-2);
  padding: 9px 22px; border-radius: 999px; font-size: 13px;
  transition: all .15s var(--ease);
}
.verdict__undo:hover { color: var(--void-ink); border-color: rgba(232,223,205,.3); }

/* ── Mobile ── */
@media (max-width: 600px) {
  .hd  { padding: 10px 12px 8px; }
  .hd__copy-label { display: none; }
  .hd__copy { padding: 6px 8px; }
  .prompt { padding: 4px 16px 8px; }
  .prompt__h { font-size: clamp(17px,5vw,24px); }
  .stage { padding: 8px 10px; }
  .hud { padding: 0 10px max(16px, env(safe-area-inset-bottom)); }
  .hud__card { border-radius: 14px; padding: 10px 12px 12px; }
  .hud__name { width: 100px; font-size: 12px; }
  .act { font-size: 12px; padding: 9px 8px; gap: 5px; border-radius: 8px; }
  .act span { display: none; } /* icon-only on very small screens */
  .act { flex: 0 0 44px; justify-content: center; }
  .hud__actions { gap: 8px; }
}
</style>`;
