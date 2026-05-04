import { useEffect, useMemo, useState } from "react";
import type { ReviewDecision, ReviewRequest } from "../types";
import { api, basename } from "../lib/api";
import { getBlobUrl } from "../lib/blobs";

import "../styles/review.css";

type Props = {
  request: ReviewRequest;
  onClose: () => void;
};

export function ReviewModal({ request, onClose }: Props) {
  const { mode } = request;

  function resolve(decision: Omit<ReviewDecision, "id" | "decided_at">) {
    const full: ReviewDecision = {
      id: request.id,
      decided_at: new Date().toISOString(),
      ...decision,
    };
    api.resolveReview(full).then(onClose).catch((e) => {
      console.error("resolveReview failed:", e);
      onClose();
    });
  }

  const ctx = (request.context ?? {}) as { task?: string; repo?: string };

  return (
    <div className="review-scrim">
      <div className={`review-card ${mode === "pick_one" || mode === "rank" ? "review-card--wide" : ""}`}>
        <header className="review-card__head">
          <span className="claude-tag">
            <span className="dot" /> claude
          </span>
          <span className="context">
            {ctx.task && <strong>{ctx.task}</strong>}
            {ctx.task && ctx.repo && <span className="context__sep">·</span>}
            {ctx.repo && <span>{ctx.repo}</span>}
            {!ctx.task && !ctx.repo && <span style={{ fontStyle: "italic" }}>request from claude</span>}
          </span>
          <button
            className="review-card__close"
            onClick={() =>
              resolve({
                decision: "dismissed",
                note: "user dismissed",
              })
            }
            title="Dismiss (Esc)"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="prompt-block">
          <div className="prompt-eyebrow">
            ★{" "}
            {mode === "approve_reject"
              ? "a decision is needed"
              : mode === "rank"
              ? "rank these — best first"
              : "pick the one that wins"}
          </div>
          <h1 className="prompt">
            {request.prompt ?? "Take a look at these and let me know."}
          </h1>
        </section>

        {mode === "approve_reject" && (
          <ApproveRejectMode request={request} onResolve={resolve} />
        )}
        {mode === "pick_one" && <PickOneMode request={request} onResolve={resolve} />}
        {mode === "rank" && <RankMode request={request} onResolve={resolve} />}
      </div>
    </div>
  );
}

// ─── Approve / Reject (single asset, optional per-item if multiple) ───

function ApproveRejectMode({
  request,
  onResolve,
}: {
  request: ReviewRequest;
  onResolve: (d: Omit<ReviewDecision, "id" | "decided_at">) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [note, setNote] = useState("");
  const [perItem, setPerItem] = useState<Record<string, "yes" | "no">>({});

  const path = request.paths[idx];
  const total = request.paths.length;
  const isLast = idx >= total - 1;

  function recordAndAdvance(verdict: "yes" | "no") {
    const next = { ...perItem, [path]: verdict };
    setPerItem(next);
    if (isLast) {
      // Finalize
      const allYes = Object.values(next).every((v) => v === "yes");
      const allNo = Object.values(next).every((v) => v === "no");
      onResolve({
        decision: allYes ? "approved" : allNo ? "rejected" : "approved",
        note: note || undefined,
        per_item: Object.entries(next).map(([p, v]) => ({ path: p, verdict: v })),
      });
    } else {
      setIdx(idx + 1);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        recordAndAdvance("yes");
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        recordAndAdvance("no");
      } else if (e.key === "Escape") {
        e.preventDefault();
        onResolve({ decision: "dismissed", note: "user pressed esc" });
      } else if (e.key === "ArrowLeft" && idx > 0) {
        setIdx(idx - 1);
      } else if (e.key === "ArrowRight" && !isLast) {
        setIdx(idx + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, idx, isLast, note, perItem]);

  return (
    <>
      <div className="asset-stage">
        <div className="asset-frame">
          <AssetPreview path={path} />
        </div>
      </div>
      <div className="asset-meta">
        <strong>{basename(path)}</strong>
        {total > 1 && (
          <>
            <span className="asset-meta__sep">·</span>
            <span>
              {idx + 1} of {total}
            </span>
          </>
        )}
      </div>

      <div className="review-inputs">
        <div className="review-note">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="leave a thought (optional)"
          />
        </div>
      </div>

      <div className="decisions">
        <button
          className="btn-decision btn-decision--reject"
          onClick={() => recordAndAdvance("no")}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Reject
          <span className="btn-decision__hint">R</span>
        </button>
        <button
          className="btn-decision btn-decision--approve"
          onClick={() => recordAndAdvance("yes")}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          Approve
          <span className="btn-decision__hint">A</span>
        </button>
      </div>

      <footer className="keyhints">
        <span className="key">
          <kbd>A</kbd> approve
        </span>
        <span className="key">
          <kbd>R</kbd> reject
        </span>
        {total > 1 && (
          <span className="key">
            <kbd>←</kbd>
            <kbd>→</kbd> navigate
          </span>
        )}
        <span style={{ marginLeft: "auto" }} className="key">
          <kbd>esc</kbd> dismiss
        </span>
      </footer>
    </>
  );
}

// ─── Pick one ─────────────────────────────────────────

function PickOneMode({
  request,
  onResolve,
}: {
  request: ReviewRequest;
  onResolve: (d: Omit<ReviewDecision, "id" | "decided_at">) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  function confirm() {
    if (!picked) return;
    onResolve({ decision: "picked", picked });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT") return;

      if (e.key === "Escape") {
        e.preventDefault();
        onResolve({ decision: "dismissed" });
        return;
      }
      if (e.key === "Enter" && picked) {
        e.preventDefault();
        confirm();
        return;
      }
      const n = parseInt(e.key, 10);
      if (!isNaN(n) && n >= 1 && n <= request.paths.length) {
        e.preventDefault();
        setPicked(request.paths[n - 1]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, request.paths]);

  return (
    <>
      <div className="pick-row">
        {request.paths.map((p, i) => (
          <article
            key={p}
            className={`pick-card ${picked === p ? "pick-card--selected" : ""}`}
            onClick={() => setPicked(p)}
          >
            <span className="pick-card__num">{i + 1}</span>
            <span className="pick-card__check">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>
            <div className="pick-card__thumb">
              <AssetPreview path={p} fitForCard />
            </div>
            <div className="pick-card__meta">
              <div className="pick-card__name">{basename(p)}</div>
            </div>
          </article>
        ))}
      </div>

      <div className="pick-confirm">
        <span className="pick-confirm__summary">
          {picked ? (
            <>
              Picking <strong>{basename(picked)}</strong>.
            </>
          ) : (
            <span style={{ color: "var(--ink-3)" }}>Click a card or press 1–{request.paths.length}.</span>
          )}
        </span>
        <button className="pick-confirm__btn" onClick={confirm} disabled={!picked}>
          Confirm pick
          <span className="pick-confirm__hint">⏎</span>
        </button>
      </div>

      <footer className="keyhints">
        <span className="key">
          <kbd>1</kbd>–<kbd>{Math.min(9, request.paths.length)}</kbd> select
        </span>
        <span className="key">
          <kbd>⏎</kbd> confirm
        </span>
        <span style={{ marginLeft: "auto" }} className="key">
          <kbd>esc</kbd> dismiss
        </span>
      </footer>
    </>
  );
}

// ─── Rank ─────────────────────────────────────────────

function RankMode({
  request,
  onResolve,
}: {
  request: ReviewRequest;
  onResolve: (d: Omit<ReviewDecision, "id" | "decided_at">) => void;
}) {
  // Initial state: all unranked
  const [ranked, setRanked] = useState<string[]>([]);

  const unranked = useMemo(
    () => request.paths.filter((p) => !ranked.includes(p)),
    [ranked, request.paths]
  );

  function moveToRanked(p: string) {
    if (!ranked.includes(p)) setRanked([...ranked, p]);
  }
  function moveToUnranked(p: string) {
    setRanked(ranked.filter((x) => x !== p));
  }
  function moveUp(i: number) {
    if (i <= 0) return;
    const next = [...ranked];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setRanked(next);
  }
  function moveDown(i: number) {
    if (i >= ranked.length - 1) return;
    const next = [...ranked];
    [next[i + 1], next[i]] = [next[i], next[i + 1]];
    setRanked(next);
  }

  function submit() {
    onResolve({
      decision: "ranked",
      ranking: ranked.length > 0 ? ranked : null,
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onResolve({ decision: "dismissed" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked]);

  return (
    <>
      <div className="rank-list">
        {ranked.map((p, i) => (
          <article key={p} className="rank-item">
            <span className="rank-item__num">{i + 1}</span>
            <div className="rank-item__thumb">
              <AssetPreview path={p} fitForCard />
            </div>
            <div className="rank-item__body">
              <div className="rank-item__name">{basename(p)}</div>
            </div>
            <div className="rank-item__action">
              <button className="rank-item__btn" onClick={() => moveUp(i)} title="Move up">
                ↑
              </button>
              <button className="rank-item__btn" onClick={() => moveDown(i)} title="Move down">
                ↓
              </button>
              <button className="rank-item__btn" onClick={() => moveToUnranked(p)} title="Unrank">
                ×
              </button>
            </div>
          </article>
        ))}

        {unranked.length > 0 && (
          <>
            <div className="rank-divider">
              <span>{ranked.length === 0 ? "click + to start ranking" : "unranked"}</span>
            </div>
            {unranked.map((p) => (
              <article key={p} className="rank-item rank-item--unranked">
                <span className="rank-item__num">—</span>
                <div className="rank-item__thumb">
                  <AssetPreview path={p} fitForCard />
                </div>
                <div className="rank-item__body">
                  <div className="rank-item__name">{basename(p)}</div>
                </div>
                <div className="rank-item__action">
                  <button className="rank-item__btn" onClick={() => moveToRanked(p)} title="Add to ranking">
                    +
                  </button>
                </div>
              </article>
            ))}
          </>
        )}
      </div>

      <div className="pick-confirm">
        <span className="pick-confirm__summary">
          <strong>{ranked.length}</strong>{" "}
          ranked{" "}
          {unranked.length > 0 && (
            <span style={{ color: "var(--ink-4)" }}>· {unranked.length} unranked</span>
          )}
        </span>
        <button className="pick-confirm__btn" onClick={submit}>
          Submit ranking
          <span className="pick-confirm__hint">⏎</span>
        </button>
      </div>

      <footer className="keyhints">
        <span className="key">
          Click <kbd>+</kbd> / <kbd>×</kbd> to add/remove · <kbd>↑</kbd>/<kbd>↓</kbd> to reorder
        </span>
        <span className="key">
          <kbd>⏎</kbd> submit
        </span>
        <span style={{ marginLeft: "auto" }} className="key">
          <kbd>esc</kbd> dismiss
        </span>
      </footer>
    </>
  );
}

// ─── Asset preview helper ─────────────────────────────

function AssetPreview({ path, fitForCard }: { path: string; fitForCard?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    getBlobUrl(path)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!url) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ink-4)",
          fontFamily: "var(--font-display)",
          fontStyle: "italic",
          fontSize: 14,
        }}
      >
        loading…
      </div>
    );
  }

  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["html", "htm"].includes(ext)) {
    return (
      <iframe
        src={url}
        style={fitForCard ? { transform: "scale(0.234)" } : undefined}
      />
    );
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) {
    return <img src={url} alt={basename(path)} />;
  }
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--ink-3)",
        fontFamily: "var(--font-display)",
        fontStyle: "italic",
      }}
    >
      {ext}
    </div>
  );
}
