// GET /r/c/:id  — public collection viewer
//
// Shows all mockups in a set together: slideshow navigation, per-item
// approve/reject/iterate, progress track, reviewer name applies to all.

import { ShareEnv, jsonError, nowUnix } from "../../_share-lib";

interface CollectionRow {
  id: string;
  device_id: string;
  prompt: string | null;
  created_at: number;
  expires_at: number | null;
}

interface ItemRow {
  share_id: string;
  idx: number;
  filename: string;
  kind: string;
}

export const onRequest: PagesFunction<ShareEnv, "id"> = async (ctx) => {
  if (ctx.request.method !== "GET") return jsonError(405, "method not allowed");

  const id = ctx.params.id as string;
  if (!id || id.length > 32 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return jsonError(400, "invalid collection id");
  }

  const col = await ctx.env.DB.prepare(
    `SELECT id, device_id, prompt, created_at, expires_at FROM share_collections WHERE id = ?`,
  ).bind(id).first<CollectionRow>();

  if (!col) return errorPage(404, "This collection doesn't exist.");
  if (col.expires_at && col.expires_at < nowUnix()) return errorPage(410, "This collection has expired.");

  const items = await ctx.env.DB.prepare(
    `SELECT ci.idx, ci.share_id, sl.filename, sl.kind
       FROM share_collection_items ci
       JOIN share_links sl ON sl.id = ci.share_id
      WHERE ci.collection_id = ?
      ORDER BY ci.idx ASC`,
  ).bind(id).all<ItemRow>();

  if (!items.results || items.results.length === 0) {
    return errorPage(404, "This collection is empty.");
  }

  const html = renderCollection(id, col, items.results);
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

function errorPage(status: number, msg: string): Response {
  const headline = status === 404 ? "This collection doesn't exist."
    : status === 410 ? "This collection has expired."
    : "Something went wrong.";
  return new Response(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>platter — ${esc(headline)}</title>${BASE_STYLES}</head>
<body class="body--center">
<div class="err">
  <div class="err__code">★ ${status}</div>
  <h1 class="err__h">${esc(headline)}</h1>
  <a class="err__home" href="https://platter.pages.dev">platter.pages.dev →</a>
</div></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function esc(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function renderCollection(colId: string, col: CollectionRow, items: ItemRow[]): string {
  const promptText = col.prompt ? esc(col.prompt) : "Which of these do you prefer?";
  const total = items.length;

  const itemsJson = JSON.stringify(items.map(it => ({
    id: it.share_id,
    filename: it.filename,
    kind: it.kind,
  })));

  const BASE   = "https://platter.pages.dev";
  const ogImage = `${BASE}/screenshot.png`;

  return /* html */`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(col.prompt ?? "Review collection")} — platter</title>
<meta property="og:title" content="${esc(col.prompt ?? "Review collection")} · collection review">
<meta property="og:description" content="${total} mockup${total !== 1 ? "s" : ""} waiting for your feedback.">
<meta property="og:image" content="${ogImage}">
<meta property="og:type" content="website">
<meta property="og:url" content="${BASE}/r/c/${colId}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(col.prompt ?? "Review collection")} · collection review">
<meta name="twitter:description" content="${total} mockup${total !== 1 ? "s" : ""} waiting for your feedback.">
<meta name="twitter:image" content="${ogImage}">
<meta name="theme-color" content="#14110D">
${BASE_STYLES}
${PAGE_STYLES}
</head>
<body>

  <!-- Header -->
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
    <div class="hd__prompt">${promptText}</div>
    <div class="hd__right">
      <div class="hd__counter">
        <span id="idxLabel">1</span><span class="hd__sep">/</span>${total}
      </div>
      <button class="hd__copy" id="copyBtn" title="Copy link (C)">
        <svg class="hd__copy-icon" width="15" height="15" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="9" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
          <path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="1.4"/>
        </svg>
        <span class="hd__copy-label">Copy link</span>
      </button>
    </div>
  </header>

  <!-- Stage -->
  <div class="stage" id="stage">
    <div class="stage__shimmer" id="shimmer"></div>

    <iframe class="asset asset--frame" id="iframe" src="" title=""
            sandbox="allow-same-origin allow-scripts" hidden></iframe>
    <img    class="asset asset--img"   id="img"    src="" alt=""  hidden>
    <div    class="asset asset--fallback"           id="fallback"  hidden>
      <a id="fallbackLink" href="#" target="_blank" rel="noopener">Open file ↗</a>
    </div>

    <!-- Asset action buttons — bottom-right of stage -->
    <div class="stage__actions" id="stageActions">
      <button class="stage__dl" id="copyCodeBtn" hidden title="Copy HTML source">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M5 4L1 8l4 4M11 4l4 4-4 4M9 2l-2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Copy code
      </button>
      <button class="stage__dl" id="dlBtn" title="Download file">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2M8 2v8M5 7l3 3 3-3"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Download
      </button>
    </div>

    <!-- Nav arrows -->
    <button class="nav nav--prev" id="prevBtn" title="Previous (←)" hidden>
      <svg width="20" height="20" viewBox="0 0 14 14" fill="none">
        <path d="M9 2.5L4.5 7 9 11.5" stroke="currentColor" stroke-width="1.5"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <button class="nav nav--next" id="nextBtn" title="Next (→)" hidden>
      <svg width="20" height="20" viewBox="0 0 14 14" fill="none">
        <path d="M5 2.5L9.5 7 5 11.5" stroke="currentColor" stroke-width="1.5"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>

  <!-- Caption + progress -->
  <div class="meta" id="meta">
    <div class="meta__name" id="capName"></div>
    <div class="meta__badge" id="capBadge" hidden></div>
  </div>

  <!-- Progress track -->
  <div class="track" id="track"></div>

  <!-- Bottom HUD -->
  <div class="hud" id="hud">
    <div class="hud__card">
      <!-- Per-item note — collapses between items, opens when Revise is clicked -->
      <div class="hud__note-wrap" id="noteWrap">
        <textarea class="hud__note" id="noteInput"
                  placeholder="Leave a note for this item…" rows="3" maxlength="4000"></textarea>
      </div>
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
          <button class="act act--revise" data-d="iterated" id="reviseBtn" type="button" title="Request changes with a note">
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

  <!-- All-done overlay -->
  <div class="done" id="done" hidden>
    <div class="done__icon">✓</div>
    <h2 class="done__h">All done.</h2>
    <p class="done__sub">Your decisions are on their way to the creator. Thanks for the feedback.</p>
    <div class="done__summary" id="doneSummary"></div>
    <button class="done__back" id="doneBack" type="button">Review again</button>
  </div>

<script>
(function() {
  const ITEMS    = ${itemsJson};
  const total    = ITEMS.length;

  // Per-item decision state
  const decisions = new Array(total).fill(null);

  let cur = 0;
  let deciding = false; // prevent double-submit / race
  let kbReady  = false; // keyboard shortcuts disabled until first user interaction

  // DOM
  const idxLabel   = document.getElementById('idxLabel');
  const shimmer    = document.getElementById('shimmer');
  const iframe     = document.getElementById('iframe');
  const img        = document.getElementById('img');
  const fallback   = document.getElementById('fallback');
  const fallbackLink = document.getElementById('fallbackLink');
  const prevBtn    = document.getElementById('prevBtn');
  const nextBtn    = document.getElementById('nextBtn');
  const capName    = document.getElementById('capName');
  const capBadge   = document.getElementById('capBadge');
  const track      = document.getElementById('track');
  const nameInput  = document.getElementById('nameInput');
  const noteInput  = document.getElementById('noteInput');
  const noteWrap   = document.getElementById('noteWrap');
  const reviseBtn  = document.getElementById('reviseBtn');
  const dlBtn       = document.getElementById('dlBtn');
  const copyCodeBtn = document.getElementById('copyCodeBtn');
  const buttons    = document.querySelectorAll('.act');
  const hud        = document.getElementById('hud');
  const done       = document.getElementById('done');
  const doneSummary= document.getElementById('doneSummary');
  const doneBack   = document.getElementById('doneBack');

  // Note panel helpers
  function openNote()  { noteWrap.classList.add('open');    reviseBtn.classList.add('act--open'); requestAnimationFrame(() => noteInput.focus()); }
  function closeNote() { noteWrap.classList.remove('open'); reviseBtn.classList.remove('act--open'); noteInput.value = ''; }

  // Build progress track ticks
  for (let i = 0; i < total; i++) {
    const t = document.createElement('button');
    t.className = 'tick';
    t.setAttribute('aria-label', 'Item ' + (i + 1));
    t.addEventListener('click', () => goTo(i));
    track.appendChild(t);
  }

  function assetUrl(item) {
    return '/api/share/' + item.id + '?raw=1';
  }

  const IMAGE_KINDS = new Set(['png','jpg','jpeg','gif','svg','webp']);
  const HTML_KINDS  = new Set(['html','htm']);

  let currentLoad = 0;

  function showShimmer() {
    shimmer.style.opacity = '1';
    shimmer.style.display = '';
  }
  function hideShimmer() {
    shimmer.style.opacity = '0';
    setTimeout(() => { shimmer.style.display = 'none'; }, 400);
  }

  // Scale the iframe down so the full design fits the stage without clipping.
  // Reads the content's actual dimensions from the document so any size works.
  function fitFrame() {
    const stage = document.getElementById('stage');
    const aw = stage.clientWidth  - 130; // leave room for nav arrows
    const ah = stage.clientHeight - 24;  // vertical breathing room
    // Read content size (works because sandbox includes allow-same-origin)
    let nw = 1080, nh = 1080;
    try {
      const doc = iframe.contentDocument;
      if (doc && doc.documentElement) {
        nw = doc.documentElement.scrollWidth  || nw;
        nh = doc.documentElement.scrollHeight || nh;
      }
    } catch(e) {}
    const scale = Math.min(aw / nw, ah / nh, 1);
    // zoom affects layout (unlike transform) so the element collapses properly
    iframe.style.width  = nw + 'px';
    iframe.style.height = nh + 'px';
    iframe.style.zoom   = String(scale);
    // Firefox / older browsers: transform fallback
    iframe.style.transform = 'none'; // reset any prior transform
    if (typeof iframe.style.zoom === 'undefined' || iframe.style.zoom === '') {
      iframe.style.transform       = 'scale(' + scale + ')';
      iframe.style.transformOrigin = 'top center';
      iframe.style.marginBottom    = '-' + (nh * (1 - scale)) + 'px';
    }
  }

  window.addEventListener('resize', () => { if (!iframe.hidden) fitFrame(); });

  function goTo(idx) {
    if (idx < 0 || idx >= total) return;
    cur = idx;
    render();
  }

  const HTML_KINDS_DL = new Set(['html','htm']);

  function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
  }

  // Download button — always present
  dlBtn.addEventListener('click', () => {
    const item = ITEMS[cur];
    triggerDownload(assetUrl(item), item.filename);
  });

  // Copy code button — HTML only
  copyCodeBtn.addEventListener('click', async () => {
    const item = ITEMS[cur];
    copyCodeBtn.disabled = true;
    try {
      const resp = await fetch(assetUrl(item));
      const text = await resp.text();
      await navigator.clipboard.writeText(text);
      const orig = copyCodeBtn.innerHTML;
      copyCodeBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Copied!';
      copyCodeBtn.classList.add('stage__dl--ok');
      setTimeout(() => { copyCodeBtn.innerHTML = orig; copyCodeBtn.classList.remove('stage__dl--ok'); }, 2000);
    } catch(e) { alert('Failed: ' + e.message); }
    finally { copyCodeBtn.disabled = false; }
  });

  function render() {
    const item = ITEMS[cur];
    const url  = assetUrl(item);
    const kind = item.kind;
    const d    = decisions[cur];

    // Show copy-code button only for HTML items
    copyCodeBtn.hidden = !HTML_KINDS_DL.has(kind);
    copyCodeBtn.classList.remove('stage__dl--ok');
    dlBtn.classList.remove('stage__dl--ok');

    idxLabel.textContent = String(cur + 1);
    capName.textContent  = item.filename;

    // Badge
    if (d) {
      capBadge.textContent = d;
      capBadge.className   = 'meta__badge badge--' + d;
      capBadge.hidden = false;
    } else {
      capBadge.hidden = true;
    }

    // Nav
    prevBtn.hidden = cur === 0;
    nextBtn.hidden = cur === total - 1;

    // Track
    Array.from(track.children).forEach((t, i) => {
      const td = decisions[i];
      t.className = 'tick'
        + (i === cur           ? ' tick--active'   : '')
        + (i < cur             ? ' tick--past'     : '')
        + (td === 'approved'   ? ' tick--ok'       : '')
        + (td === 'rejected'   ? ' tick--warn'     : '')
        + (td === 'iterated'   ? ' tick--gold'     : '');
    });

    // Buttons reflect current item state
    buttons.forEach(b => {
      b.classList.toggle('act--selected', b.dataset.d === d);
      b.disabled = false;
    });

    // Load asset
    const loadId = ++currentLoad;
    showShimmer();
    // Reset any prior iframe scaling before loading new content
    iframe.style.width = iframe.style.height = iframe.style.zoom = '';
    iframe.hidden   = true;
    img.hidden      = true;
    fallback.hidden = true;

    if (HTML_KINDS.has(kind)) {
      iframe.hidden = false;
      iframe.title  = item.filename;
      iframe.onload = () => {
        if (currentLoad !== loadId) return;
        fitFrame();
        hideShimmer();
      };
      iframe.src = url;
    } else if (IMAGE_KINDS.has(kind)) {
      img.hidden = false;
      img.alt    = item.filename;
      img.onload  = () => { if (currentLoad === loadId) hideShimmer(); };
      img.onerror = () => { if (currentLoad === loadId) hideShimmer(); };
      img.src = url;
    } else {
      fallback.hidden = false;
      fallbackLink.href        = url;
      fallbackLink.textContent = 'Open ' + item.filename + ' ↗';
      hideShimmer();
    }
  }

  async function decide(decision) {
    if (deciding) return; // prevent double-submit
    deciding = true;
    kbReady  = true; // user has deliberately interacted

    const item = ITEMS[cur];
    const name = nameInput.value.trim() || undefined;
    const note = noteInput.value.trim() || undefined;
    buttons.forEach(b => b.disabled = true);

    try {
      const r = await fetch('/api/share/' + item.id + '/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reviewer_name: name, note }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert('Submit failed: ' + (j.error || r.statusText));
        return;
      }
      decisions[cur] = decision;
      closeNote(); // reset note for next item

      // Check if all decided (guard: must have at least 1 real decision)
      const decided = decisions.filter(d => d !== null).length;
      if (decided > 0 && decisions.every(d => d !== null)) {
        showDone();
        return;
      }

      // Auto-advance to next undecided
      let next = decisions.findIndex((d, i) => d === null && i > cur);
      if (next === -1) next = decisions.findIndex(d => d === null);
      if (next !== -1) setTimeout(() => goTo(next), 500);
      else render();
    } catch(e) {
      alert('Submit failed: ' + e.message);
    } finally {
      deciding = false;
      buttons.forEach(b => b.disabled = false);
    }
  }

  function showDone() {
    const counts = { approved: 0, rejected: 0, iterated: 0 };
    decisions.forEach(d => { if (d) counts[d]++; });
    const parts = [];
    if (counts.approved) parts.push('<span class="sum sum--ok">' + counts.approved + ' approved</span>');
    if (counts.rejected) parts.push('<span class="sum sum--warn">' + counts.rejected + ' rejected</span>');
    if (counts.iterated) parts.push('<span class="sum sum--gold">' + counts.iterated + ' iterate</span>');
    doneSummary.innerHTML = parts.join('<span class="sum__sep">·</span>');
    hud.hidden  = true;
    done.hidden = false;
  }

  doneBack.addEventListener('click', () => {
    done.hidden = true;
    hud.hidden  = false;
    goTo(0);
  });

  // Keyboard — decision shortcuts require prior user interaction (kbReady)
  window.addEventListener('keydown', e => {
    if (e.target === nameInput || e.target === noteInput) return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); goTo(cur - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(cur + 1); }
    if (e.key === ' ')          { e.preventDefault(); goTo(cur + 1); }
    if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) { copyLink(); return; }
    if (!kbReady) return;
    if (e.key.toLowerCase() === 'a') decide('approved');
    if (e.key.toLowerCase() === 'r') decide('rejected');
    if (e.key.toLowerCase() === 'i') decide('iterated');
  });

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

  // Any click on the page marks kbReady (so A/R/I shortcuts work)
  document.addEventListener('click', () => { kbReady = true; }, { once: true });

  // Revise button: first click opens note, second click (or with note) submits
  reviseBtn.addEventListener('click', (e) => {
    kbReady = true;
    if (!noteWrap.classList.contains('open')) { openNote(); return; }
    decide('iterated');
  });
  // Approve + Reject submit directly
  document.querySelectorAll('.act--reject, .act--approve').forEach(b => {
    b.addEventListener('click', () => decide(b.dataset.d));
  });
  prevBtn.addEventListener('click', () => goTo(cur - 1));
  nextBtn.addEventListener('click', () => goTo(cur + 1));

  render();
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
  --r:10px; --r-lg:14px;
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
.err__home{font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.06em;color:var(--void-ink-3);}
</style>`;

const PAGE_STYLES = /* html */`
<style>
/* ── Layout ── */
html, body { height: 100%; overflow: hidden; }
body {
  display: grid;
  grid-template-rows: auto 1fr auto auto auto;
  grid-template-areas: "hd" "stage" "meta" "track" "hud";
}

/* ── Header ── */
.hd {
  grid-area: hd;
  display: flex; align-items: center; gap: 14px;
  padding: 14px 24px 12px;
  border-bottom: 1px solid var(--void-line);
  z-index: 10;
}
.brand { display:flex;align-items:center;gap:9px;text-decoration:none; }
.brand__logo { width:22px;height:22px;flex-shrink:0;border-radius:5px; }
.brand__name {
  font-family:ui-serif,"New York",Georgia,serif;font-style:italic;
  font-size:17px;color:var(--void-ink);letter-spacing:-.01em;
}
.hd__prompt {
  flex: 1;
  font-family:ui-serif,"New York",Georgia,serif;font-style:italic;
  font-size:clamp(14px,2vw,19px);color:var(--void-ink);letter-spacing:-.01em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  text-align:center;
}
.hd__right { display:flex;align-items:center;gap:10px;flex-shrink:0; }
.hd__counter {
  font-family:'JetBrains Mono',monospace;font-size:11px;
  color:var(--void-ink-3);letter-spacing:.08em;white-space:nowrap;
}
.hd__sep { margin: 0 2px; opacity:.5; }
.hd__copy {
  display:inline-flex;align-items:center;gap:5px;
  background:rgba(232,223,205,0.06);
  border:1px solid var(--void-line-2);
  border-radius:999px;
  padding:5px 11px 5px 9px;
  color:var(--void-ink-3);
  font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.04em;
  cursor:pointer;white-space:nowrap;
  transition:all .15s var(--ease);
}
.hd__copy:hover { background:rgba(232,223,205,0.1);color:var(--void-ink);border-color:rgba(232,223,205,.3); }
.hd__copy--ok   { background:rgba(110,127,88,.18);border-color:rgba(110,127,88,.5);color:#B9C8A4; }

/* ── Stage ── */
.stage {
  grid-area: stage;
  display:flex;align-items:center;justify-content:center;
  position:relative;overflow:hidden;
  padding: 0 65px;
  min-height: 0; /* prevent grid blowout */
}
.stage__shimmer {
  position:absolute;inset:0;
  background:linear-gradient(135deg,var(--void-3) 25%,var(--void-2) 50%,var(--void-3) 75%);
  background-size:200% 200%;
  animation:shimmer 1.6s ease infinite;
  transition:opacity .4s;
  pointer-events:none;border-radius:var(--r-lg);
  margin: 0 65px;
  z-index: 1;
}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}

.asset {
  border-radius:var(--r-lg);
  box-shadow:0 32px 80px rgba(0,0,0,0.6),0 0 0 1px var(--void-line-2);
  animation:assetIn .25s var(--ease);
  flex-shrink: 0;
}
@keyframes assetIn{from{opacity:0;transform:scale(.975)}to{opacity:1;transform:scale(1)}}
/* iframe: width/height/zoom set by JS fitFrame() */
.asset--frame{border:none;background:#fff;display:block;}
/* images always fit the available space */
.asset--img{max-width:100%;max-height:100%;object-fit:contain;}
.asset--fallback{
  display:flex;align-items:center;justify-content:center;
  width:100%;height:100%;
  font-family:'JetBrains Mono',monospace;font-size:13px;
  color:var(--void-ink-2);
}

/* Asset action buttons — bottom-right corner of stage */
.stage__actions {
  position:absolute;bottom:14px;right:70px;
  display:flex;gap:6px;align-items:center;
  opacity:0;
  transition:opacity .18s var(--ease);
  z-index:4;
}
.stage:hover .stage__actions,
.stage__actions:focus-within { opacity:1; }
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

/* ── Nav arrows ── */
.nav {
  position:absolute;top:50%;transform:translateY(-50%);
  width:48px;height:48px;border-radius:50%;
  border:1px solid var(--void-line-2);
  background:rgba(20,17,13,0.6);
  color:var(--void-ink);cursor:pointer;
  display:inline-flex;align-items:center;justify-content:center;
  z-index:5;
  transition:background .15s var(--ease),transform .15s var(--ease);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
}
.nav:hover{background:rgba(232,223,205,0.12);transform:translateY(-50%) scale(1.06);}
.nav--prev{left:10px;}
.nav--next{right:10px;}

/* ── Meta (caption + badge) ── */
.meta {
  grid-area: meta;
  display:flex;align-items:center;justify-content:center;gap:8px;
  padding:10px 80px 2px;
  min-height:32px;
}
.meta__name {
  font-family:'JetBrains Mono',monospace;font-size:11px;
  letter-spacing:.06em;color:var(--void-ink-3);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  max-width:60%;
}
.meta__badge {
  font-size:10px;padding:2px 9px;border-radius:999px;
  font-family:'JetBrains Mono',monospace;letter-spacing:.06em;
  text-transform:uppercase;
}
.badge--approved{background:rgba(110,127,88,0.2);color:#B9C8A4;border:1px solid rgba(110,127,88,0.3);}
.badge--rejected{background:rgba(160,68,40,0.2);color:#E0987F;border:1px solid rgba(160,68,40,0.3);}
.badge--iterated{background:rgba(181,138,61,0.2);color:#D4B87A;border:1px solid rgba(181,138,61,0.3);}

/* ── Progress track ── */
.track {
  grid-area: track;
  display:flex;gap:4px;justify-content:center;align-items:center;
  padding:8px 24px 6px;
}
.tick {
  width:18px;height:4px;border-radius:2px;border:none;padding:0;cursor:pointer;
  background:rgba(232,223,205,0.12);
  transition:background .12s var(--ease),width .12s var(--ease);
}
.tick:hover{background:rgba(232,223,205,0.3);}
.tick--active{width:32px;background:var(--vermilion);}
.tick--past{background:rgba(232,223,205,0.3);}
.tick--ok{background:rgba(110,127,88,0.55);}
.tick--ok.tick--active{background:#6E7F58;}
.tick--warn{background:rgba(160,68,40,0.55);}
.tick--warn.tick--active{background:#A04428;}
.tick--gold{background:rgba(181,138,61,0.55);}
.tick--gold.tick--active{background:#B58A3D;}

/* ── Bottom HUD — floating card ── */
.hud {
  grid-area: hud;
  padding: 0 16px max(16px, env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--void) 50%, transparent 100%);
  display: flex; justify-content: center;
  pointer-events: none;
  z-index: 20;
}
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
/* Note — collapsed by default */
.hud__note-wrap {
  overflow: hidden;
  max-height: 0;
  transition: max-height .25s var(--ease), opacity .2s var(--ease);
  opacity: 0;
}
.hud__note-wrap.open { max-height: 140px; opacity: 1; }
.hud__note {
  width: 100%;
  font-family: inherit; font-size: 13px; resize: none;
  background: rgba(232,223,205,0.05);
  border: 1px solid var(--void-line-2);
  border-radius: 10px; padding: 10px 12px;
  color: var(--void-ink); outline: none; line-height: 1.5;
  min-height: 72px; max-height: 120px;
  transition: border-color .15s var(--ease), background .15s var(--ease);
}
.hud__note::placeholder { color: var(--void-ink-3); font-style: italic; }
.hud__note:focus { background: rgba(232,223,205,0.07); border-color: rgba(232,223,205,.28); }
/* Action row */
.hud__row { display: flex; align-items: center; gap: 8px; }
.hud__name {
  flex: 0 0 auto; width: 120px;
  font-family: inherit; font-size: 12px;
  background: transparent; border: none;
  border-bottom: 1px solid var(--void-line-2);
  padding: 5px 2px; color: var(--void-ink); outline: none;
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
.act--reject  { color:#E0987F; border-color:rgba(160,68,40,.4);  background:rgba(160,68,40,.08); }
.act--revise  { color:#D4B87A; border-color:rgba(181,138,61,.4); background:rgba(181,138,61,.08); }
.act--approve { color:#B9C8A4; border-color:rgba(110,127,88,.4); background:rgba(110,127,88,.08); }
.act--reject:hover:not(:disabled)            { background:#A04428; border-color:#A04428; color:#F8F4E8; }
.act--revise:hover:not(:disabled),
.act--revise.act--open,.act--revise.act--selected { background:rgba(181,138,61,.18); border-color:rgba(181,138,61,.7); color:#D4B87A; }
.act--approve:hover:not(:disabled),.act--approve.act--selected { background:#6E7F58; border-color:#6E7F58; color:#F8F4E8; }
.act:active:not(:disabled) { transform: scale(.96); }

/* ── All-done overlay ── */
.done {
  grid-column:1/-1;grid-row:1/-1;
  position:fixed;inset:0;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:rgba(20,17,13,.92);
  -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);
  z-index:100;padding:40px 24px;text-align:center;
  animation:fadeIn .3s var(--ease);
}
@keyframes fadeIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
.done__icon {
  width:80px;height:80px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:38px;margin-bottom:24px;
  background:rgba(110,127,88,0.2);color:#B9C8A4;
  border:1.5px solid rgba(110,127,88,0.4);
  animation:iconPop .4s var(--ease);
}
@keyframes iconPop{from{transform:scale(.5);opacity:0}to{transform:scale(1);opacity:1}}
.done__h {
  font-family:ui-serif,"New York",Georgia,serif;font-style:italic;font-weight:400;
  font-size:clamp(28px,4vw,42px);line-height:1.05;letter-spacing:-.025em;
  margin:0 0 12px;
}
.done__sub {
  color:var(--void-ink-2);font-size:15px;max-width:440px;
  margin:0 0 20px;line-height:1.55;
}
.done__summary {
  display:flex;gap:6px;align-items:center;justify-content:center;
  flex-wrap:wrap;margin-bottom:28px;
}
.sum {
  font-family:'JetBrains Mono',monospace;font-size:11px;
  letter-spacing:.06em;padding:3px 10px;border-radius:999px;
}
.sum--ok   {background:rgba(110,127,88,0.2);color:#B9C8A4;}
.sum--warn {background:rgba(160,68,40,0.2);color:#E0987F;}
.sum--gold {background:rgba(181,138,61,0.2);color:#D4B87A;}
.sum__sep  {color:var(--void-ink-3);font-size:12px;}
.done__back {
  background:transparent;color:var(--void-ink-3);
  border:1px solid var(--void-line-2);
  padding:9px 22px;border-radius:999px;font-size:13px;
  transition:all .15s var(--ease);
}
.done__back:hover{color:var(--void-ink);border-color:rgba(232,223,205,.3);}

/* ── Mobile ── */
@media (max-width: 600px) {
  .hd { padding: 10px 12px 8px; gap: 8px; }
  .hd__prompt { font-size: 13px; }
  .hd__counter { font-size: 10px; }
  .hd__copy-label { display: none; }
  .hd__copy { padding: 6px 8px; }
  .stage { padding: 0 8px; min-height: 0; }
  .nav { width: 40px; height: 40px; }
  .nav--prev { left: 2px; }
  .nav--next { right: 2px; }
  .meta { padding: 6px 10px 0; }
  .track { padding: 6px 16px 4px; }
  .hud { padding: 0 10px max(14px, env(safe-area-inset-bottom)); }
  .hud__card { border-radius: 14px; padding: 10px 12px 12px; }
  .hud__name { width: 90px; font-size: 11px; }
  .act { font-size: 12px; padding: 9px 6px; gap: 4px; border-radius: 8px; }
  .act span { display: none; }
  .act { flex: 0 0 48px; }
  .hud__actions { justify-content: flex-end; }
}
</style>`;
