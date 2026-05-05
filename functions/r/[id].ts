// GET /r/:id — public wrapper page for a shared review.
//
// Renders the editorial-gallery aesthetic: cream paper field, vermilion
// accent, big italic prompt, the asset itself (iframe for HTML, <img>
// for PNG/JPG/SVG), Approve / Reject / Iterate pills, optional name +
// note. Submits via fetch to /api/share/:id/decision.
//
// Server-rendered so it indexes fast, has no JS-bundling step, and
// works without React/etc on the client.

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
  try {
    const j = (await r.json()) as { error?: string };
    return j.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function errorPage(status: number, message: string): Response {
  const headline =
    status === 404
      ? "This review link doesn't exist."
      : status === 410
      ? "This review has expired."
      : "Something went wrong.";
  const body = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>platter — ${escapeHtml(headline)}</title>
${BASE_STYLES}
</head>
<body>
  <div class="frame frame--centered">
    <div class="empty">
      <div class="empty__eyebrow">★ ${status}</div>
      <h1 class="empty__h">${escapeHtml(headline)}</h1>
      <p class="empty__sub">${escapeHtml(message)}</p>
      <a class="empty__home" href="https://platter.pages.dev">platter.pages.dev →</a>
    </div>
  </div>
</body>
</html>`;
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderPage(
  id: string,
  filename: string,
  kind: string,
  prompt: string | null,
): string {
  const isHtml = kind === "html" || kind === "htm";
  const isImage = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(kind);
  const isPdf = kind === "pdf";

  const assetUrl = `/api/share/${id}?raw=1`;
  const promptText = prompt
    ? escapeHtml(prompt)
    : "Tell me what you think.";
  const safeFilename = escapeHtml(filename);

  // Asset HTML
  let assetEl = "";
  if (isHtml) {
    assetEl = `<iframe class="asset__iframe" src="${assetUrl}" sandbox="allow-same-origin allow-scripts" title="${safeFilename}"></iframe>`;
  } else if (isImage) {
    assetEl = `<img class="asset__img" src="${assetUrl}" alt="${safeFilename}">`;
  } else if (isPdf) {
    assetEl = `<embed class="asset__pdf" src="${assetUrl}" type="application/pdf">`;
  } else {
    assetEl = `<div class="asset__fallback"><a href="${assetUrl}">Download ${safeFilename}</a></div>`;
  }

  return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${safeFilename} — platter review</title>
<meta property="og:title" content="${safeFilename} — review request">
<meta property="og:description" content="${promptText}">
<meta name="theme-color" content="#C9472A">
${BASE_STYLES}
${WRAPPER_STYLES}
</head>
<body>
  <div class="frame">
    <header class="head">
      <a class="brand" href="https://platter.pages.dev">
        <span class="brand__mark"></span>
        <span class="brand__name">platter</span>
      </a>
      <span class="head__filename">${safeFilename}</span>
    </header>

    <section class="prompt">
      <div class="prompt__eyebrow">★ a review is requested</div>
      <h1 class="prompt__h">${promptText}</h1>
    </section>

    <section class="asset">
      ${assetEl}
    </section>

    <section class="form" id="form">
      <div class="form__row">
        <input class="form__name" id="name" type="text" placeholder="your name (optional)" maxlength="80">
      </div>
      <div class="form__row">
        <textarea class="form__note" id="note" placeholder="leave a note (optional)" rows="3" maxlength="4000"></textarea>
      </div>
      <div class="form__buttons">
        <button class="btn btn--reject" data-decision="rejected" type="button">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M3 11l8-8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          Reject
        </button>
        <button class="btn btn--iterate" data-decision="iterated" type="button">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2 7a5 5 0 0 1 9-3M12 7a5 5 0 0 1-9 3M11 1v3h-3M3 13v-3h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Iterate
        </button>
        <button class="btn btn--approve" data-decision="approved" type="button">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
          Approve
        </button>
      </div>
    </section>

    <section class="success" id="success" hidden>
      <div class="success__mark" id="successMark">✓</div>
      <h2 class="success__h" id="successH">Thanks — your decision was recorded.</h2>
      <p class="success__sub" id="successSub">The reviewer can change their mind by clicking a different button — the latest choice wins.</p>
      <button class="success__again" id="changeMind" type="button">Change my mind</button>
    </section>

    <footer class="foot">
      Reviewed via <a href="https://platter.pages.dev">platter</a> · the human-in-the-loop step Claude Code is missing.
    </footer>
  </div>

<script>
(function() {
  const id = ${JSON.stringify(id)};
  const buttons = document.querySelectorAll('.btn');
  const form = document.getElementById('form');
  const success = document.getElementById('success');
  const successMark = document.getElementById('successMark');
  const successH = document.getElementById('successH');
  const successSub = document.getElementById('successSub');
  const changeMind = document.getElementById('changeMind');
  const noteEl = document.getElementById('note');
  const nameEl = document.getElementById('name');

  async function submit(decision) {
    buttons.forEach(b => b.disabled = true);
    const body = {
      decision,
      note: noteEl.value || undefined,
      reviewer_name: nameEl.value || undefined,
    };
    try {
      const r = await fetch('/api/share/' + id + '/decision', {
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
      const labels = {
        approved: ['✓', 'Approved.', 'Thanks for the green light. The creator will see your decision in the platter app.'],
        rejected: ['✕', 'Rejected.', 'Noted. You can leave more detail by clicking Iterate instead — that signals "fix and re-share."'],
        iterated: ['↻', 'Asked for an iteration.', 'The creator can read your note and decide what to change.'],
      };
      const [mark, h, sub] = labels[decision] || labels.approved;
      successMark.textContent = mark;
      successH.textContent = h;
      successSub.textContent = sub;
      successMark.className = 'success__mark success__mark--' + decision;
      form.hidden = true;
      success.hidden = false;
    } catch (e) {
      alert('Submit failed: ' + e.message);
      buttons.forEach(b => b.disabled = false);
    }
  }

  buttons.forEach(b => b.addEventListener('click', () => submit(b.dataset.decision)));
  changeMind.addEventListener('click', () => {
    form.hidden = false;
    success.hidden = true;
    buttons.forEach(b => b.disabled = false);
  });
})();
</script>
</body>
</html>`;
}

const BASE_STYLES = /* html */ `
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
  :root {
    --paper: #F4EFE5;
    --paper-2: #ECE5D7;
    --ink: #1B1714;
    --ink-2: #4A4138;
    --ink-3: #847866;
    --line: rgba(27,23,20,0.10);
    --line-strong: rgba(27,23,20,0.20);
    --vermilion: #C9472A;
    --vermilion-soft: rgba(201,71,42,0.10);
    --sage: #6E7F58;
    --sage-soft: rgba(110,127,88,0.14);
    --brick: #A04428;
    --brick-soft: rgba(160,68,40,0.10);
    --gold: #B58A3D;
    --gold-soft: rgba(181,138,61,0.14);
    --r: 10px;
    --r-lg: 14px;
  }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; min-height: 100%; background: var(--paper); color: var(--ink); }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
    font-size: 15px; line-height: 1.55;
    letter-spacing: -0.005em;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  body::before {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/></svg>");
    opacity: 0.05; mix-blend-mode: multiply;
  }
  a { color: var(--vermilion); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .frame {
    max-width: 920px; margin: 0 auto; padding: 32px 28px 64px;
    position: relative; z-index: 1;
  }
  .frame--centered {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
  }
  /* Error page */
  .empty { text-align: center; max-width: 520px; }
  .empty__eyebrow {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--vermilion); margin-bottom: 14px;
  }
  .empty__h {
    font-family: ui-serif, "New York", Charter, Georgia, serif;
    font-style: italic; font-weight: 400;
    font-size: 36px; line-height: 1.05; letter-spacing: -0.02em;
    margin: 0 0 14px;
  }
  .empty__sub { color: var(--ink-2); font-size: 15px; margin: 0 0 24px; }
  .empty__home {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px; letter-spacing: 0.05em;
  }
</style>`;

const WRAPPER_STYLES = /* html */ `
<style>
  .head {
    display: flex; align-items: center; gap: 14px;
    padding-bottom: 18px;
    border-bottom: 0.5px solid var(--line);
    margin-bottom: 28px;
  }
  .brand { display: flex; align-items: center; gap: 9px; }
  .brand__mark {
    width: 22px; height: 22px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, var(--vermilion) 0%, #5A2E20 100%);
    border: 1px solid var(--ink); flex-shrink: 0;
  }
  .brand__name {
    font-family: ui-serif, "New York", Charter, Georgia, serif;
    font-style: italic; font-size: 18px; color: var(--ink);
    letter-spacing: -0.01em;
  }
  .head__filename {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px; color: var(--ink-3);
    margin-left: auto;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 50%;
  }

  .prompt { text-align: center; margin: 24px 0 28px; }
  .prompt__eyebrow {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--vermilion); margin-bottom: 10px;
  }
  .prompt__h {
    font-family: ui-serif, "New York", Charter, Georgia, serif;
    font-style: italic; font-weight: 400;
    font-size: 32px; line-height: 1.15; letter-spacing: -0.02em;
    margin: 0; color: var(--ink);
    max-width: 720px; margin-inline: auto;
  }

  .asset {
    background: #FFFCF4;
    border-radius: var(--r-lg);
    box-shadow: 0 18px 40px rgba(27,23,20,0.10), 0 0 0 0.5px var(--line-strong);
    overflow: hidden;
    margin-bottom: 24px;
  }
  .asset__iframe { width: 100%; height: 600px; border: 0; display: block; background: #FFFCF4; }
  .asset__pdf    { width: 100%; height: 720px; border: 0; display: block; }
  .asset__img    { width: 100%; height: auto; display: block; }
  .asset__fallback { padding: 40px; text-align: center; font-family: 'JetBrains Mono', monospace; }
  @media (min-width: 720px) {
    .asset__iframe { height: 720px; }
  }

  .form {
    background: rgba(255,253,248,0.6);
    border: 0.5px solid var(--line);
    border-radius: var(--r-lg);
    padding: 18px;
  }
  .form__row { margin-bottom: 12px; }
  .form__name, .form__note {
    width: 100%;
    font-family: inherit; font-size: 14px;
    background: rgba(27,23,20,0.04);
    border: 0.5px solid transparent;
    border-radius: var(--r);
    padding: 10px 12px;
    color: var(--ink); outline: none;
    transition: all 0.15s cubic-bezier(0.22, 1, 0.36, 1);
    letter-spacing: -0.005em;
  }
  .form__note { resize: vertical; min-height: 70px; max-height: 200px; }
  .form__name::placeholder, .form__note::placeholder { color: var(--ink-3); font-style: italic; }
  .form__name:focus, .form__note:focus {
    background: rgba(255,253,248,0.95);
    border-color: var(--vermilion);
    box-shadow: 0 0 0 3px var(--vermilion-soft);
  }

  .form__buttons {
    display: flex; gap: 8px; flex-wrap: wrap;
    margin-top: 4px;
  }
  .btn {
    flex: 1; min-width: 110px;
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    padding: 11px 16px;
    font-family: inherit;
    font-size: 14px; font-weight: 500; letter-spacing: -0.005em;
    border-radius: 100px;
    border: 0.5px solid;
    cursor: pointer;
    transition: all 0.18s cubic-bezier(0.22, 1, 0.36, 1);
    background: transparent;
  }
  .btn:disabled { opacity: 0.5; cursor: progress; }
  .btn--reject {
    color: var(--brick); border-color: var(--brick);
    background: var(--brick-soft);
  }
  .btn--reject:hover:not(:disabled) { background: var(--brick); color: #F8F4E8; }
  .btn--iterate {
    color: #6E541F; border-color: var(--gold);
    background: var(--gold-soft);
  }
  .btn--iterate:hover:not(:disabled) { background: var(--gold); color: var(--ink); }
  .btn--approve {
    color: var(--sage); border-color: var(--sage);
    background: var(--sage-soft);
  }
  .btn--approve:hover:not(:disabled) { background: var(--sage); color: #F8F4E8; }

  .success { text-align: center; padding: 32px 16px; }
  .success__mark {
    width: 64px; height: 64px; border-radius: 50%;
    margin: 0 auto 20px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 32px; color: #F8F4E8;
    background: var(--sage);
  }
  .success__mark--rejected { background: var(--brick); }
  .success__mark--iterated { background: var(--gold); color: var(--ink); }
  .success__h {
    font-family: ui-serif, "New York", Charter, Georgia, serif;
    font-style: italic; font-weight: 400;
    font-size: 28px; line-height: 1.1; letter-spacing: -0.02em;
    margin: 0 0 10px;
  }
  .success__sub { color: var(--ink-2); font-size: 14px; margin: 0 0 20px; max-width: 460px; margin-inline: auto; }
  .success__again {
    background: transparent; color: var(--ink-3);
    border: 0.5px solid var(--line-strong);
    padding: 7px 14px; border-radius: 100px;
    font-family: inherit; font-size: 12.5px; cursor: pointer;
  }
  .success__again:hover { color: var(--ink); border-color: var(--ink-3); }

  .foot {
    margin-top: 40px;
    padding-top: 18px;
    border-top: 0.5px solid var(--line);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px; color: var(--ink-3);
    letter-spacing: 0.02em; text-align: center;
  }
</style>`;
