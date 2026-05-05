import { useEffect, useMemo, useRef, useState } from "react";
import type { ReviewDecision, ReviewRequest } from "../types";
import { api, basename, formatSize, relativeTime } from "../lib/api";
import { getBlobUrl } from "../lib/blobs";

import "../styles/review.css";

type Props = {
  request: ReviewRequest;
  onClose: () => void;
};

const NATIVE_W = 1280;
const NATIVE_H = 800;

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
      <div className="review-card">
        <Header
          ctx={ctx}
          mode={mode}
          prompt={request.prompt}
          onDismiss={() => resolve({ decision: "dismissed" })}
        />

        {mode === "approve_reject" && (
          <ApproveRejectMode request={request} onResolve={resolve} />
        )}
        {mode === "pick_one" && <PickOneMode request={request} onResolve={resolve} />}
        {mode === "rank" && <RankMode request={request} onResolve={resolve} />}
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────

function Header({
  ctx,
  mode,
  prompt,
  onDismiss,
}: {
  ctx: { task?: string; repo?: string };
  mode: string;
  prompt: string | null;
  onDismiss: () => void;
}) {
  const eyebrow =
    mode === "approve_reject"
      ? "a decision is needed"
      : mode === "rank"
      ? "rank these — best first"
      : "pick the one that wins";

  return (
    <header className="review-head">
      <div className="review-head__left">
        <span className="claude-tag">
          <span className="dot" /> claude
        </span>
        {(ctx.task || ctx.repo) && (
          <span className="context">
            {ctx.task && <strong>{ctx.task}</strong>}
            {ctx.task && ctx.repo && <span style={{ opacity: 0.4, margin: "0 6px" }}>·</span>}
            {ctx.repo && <span>{ctx.repo}</span>}
          </span>
        )}
      </div>

      <div className="review-head__prompt">
        <div className="review-head__eyebrow">★ {eyebrow}</div>
        <h1 className="review-head__h">{prompt ?? "Take a look at these and let me know."}</h1>
      </div>

      <div className="review-head__right">
        <button className="review-head__close" onClick={onDismiss} title="Dismiss (Esc)">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </header>
  );
}

// ─── Approve / Reject ────────────────────────────────

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
  const [fileMeta, setFileMeta] = useState<{ size: number; mtime: number } | null>(null);

  const path = request.paths[idx];
  const total = request.paths.length;
  const isMulti = total > 1;

  // Load file size / mtime for the active path (best-effort)
  useEffect(() => {
    setFileMeta(null);
    api
      .listFiles(path.replace(/\/[^/]+$/, ""))
      .then((files) => {
        const found = files.find((f) => f.path === path);
        if (found) setFileMeta({ size: found.size, mtime: found.mtime });
      })
      .catch(() => {});
  }, [path]);

  function record(verdict: "yes" | "no") {
    setPerItem((prev) => ({ ...prev, [path]: verdict }));
    if (idx < total - 1) {
      setIdx(idx + 1);
    }
  }

  function finalize() {
    // Allow finalizing even if some items weren't reviewed yet
    const decisions = request.paths.map((p) => ({
      path: p,
      verdict: perItem[p] ?? "no",
    }));
    const allYes = decisions.every((d) => d.verdict === "yes");
    onResolve({
      decision: allYes ? "approved" : "rejected",
      note: note || undefined,
      per_item: decisions,
    });
  }

  const allReviewed = request.paths.every((p) => perItem[p]);
  const reviewedCount = Object.keys(perItem).length;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;

      if (e.key === "Escape") {
        e.preventDefault();
        onResolve({ decision: "dismissed" });
        return;
      }
      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        record("yes");
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        record("no");
      } else if (e.key === "ArrowLeft" && idx > 0) {
        e.preventDefault();
        setIdx(idx - 1);
      } else if (e.key === "ArrowRight" && idx < total - 1) {
        e.preventDefault();
        setIdx(idx + 1);
      } else if (e.key === "Enter" && allReviewed) {
        e.preventDefault();
        finalize();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, idx, total, perItem, note, allReviewed]);

  return (
    <>
      <main className="asset-stage">
        <div className="asset-frame">
          <AssetPreview path={path} mode="modal" />
        </div>

        {isMulti && idx > 0 && (
          <button
            className="asset-nav asset-nav--prev"
            onClick={() => setIdx(idx - 1)}
            title="Previous (←)"
          >
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <path d="M9 2.5L4.5 7L9 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {isMulti && idx < total - 1 && (
          <button
            className="asset-nav asset-nav--next"
            onClick={() => setIdx(idx + 1)}
            title="Next (→)"
          >
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <path d="M5 2.5L9.5 7L5 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {isMulti && (
          <div className="asset-counter">
            {idx + 1} / {total}
          </div>
        )}
      </main>

      {isMulti && (
        <nav className="sibling-strip">
          <div className="sibling-thumbs">
            {request.paths.map((p, i) => {
              const v = perItem[p];
              const current = i === idx;
              return (
                <div
                  key={p}
                  className={`sibling-thumb ${current ? "sibling-thumb--current" : ""}`}
                  onClick={() => setIdx(i)}
                  title={basename(p)}
                >
                  <span className="sibling-thumb__num">{i + 1}</span>
                  {v && (
                    <span
                      className={`sibling-thumb__verdict sibling-thumb__verdict--${v}`}
                      title={v === "yes" ? "approved" : "rejected"}
                    >
                      {v === "yes" ? (
                        <svg width="8" height="8" viewBox="0 0 14 14" fill="none">
                          <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg width="8" height="8" viewBox="0 0 14 14" fill="none">
                          <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      )}
                    </span>
                  )}
                  <AssetPreview path={p} mode="thumb" />
                </div>
              );
            })}
          </div>
          <div className="sibling-meta">
            <div className="sibling-meta__name">{basename(path)}</div>
            <div>
              {fileMeta ? (
                <>
                  {formatSize(fileMeta.size)} · {relativeTime(fileMeta.mtime)}
                </>
              ) : (
                <>file metadata…</>
              )}
            </div>
          </div>
        </nav>
      )}

      <footer className="action-bar">
        {!isMulti && (
          <span className="context" style={{ marginRight: 6 }}>
            <strong>{basename(path)}</strong>
            {fileMeta && (
              <>
                <span style={{ opacity: 0.4, margin: "0 6px" }}>·</span>
                {formatSize(fileMeta.size)}
                <span style={{ opacity: 0.4, margin: "0 6px" }}>·</span>
                {relativeTime(fileMeta.mtime)}
              </>
            )}
          </span>
        )}
        <input
          className="action-bar__note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            isMulti
              ? `note about ${basename(path)} (optional)`
              : "leave a thought (optional)"
          }
        />
        <button
          className="btn-decision btn-decision--reject"
          onClick={() => record("no")}
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Reject
          <span className="btn-decision__hint">R</span>
        </button>
        <button
          className="btn-decision btn-decision--approve"
          onClick={() => record("yes")}
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          Approve
          <span className="btn-decision__hint">A</span>
        </button>
        {isMulti && (
          <button
            className="submit-bar__btn"
            disabled={reviewedCount === 0}
            onClick={finalize}
            style={{ marginLeft: 4 }}
            title={
              allReviewed
                ? "Finish (⏎)"
                : `${reviewedCount}/${total} reviewed — submits with the rest as 'no'`
            }
          >
            {allReviewed ? "Finish" : `Finish (${reviewedCount}/${total})`}
            <span className="submit-bar__hint">⏎</span>
          </button>
        )}
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
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>
            <div className="pick-card__thumb">
              <AssetPreview path={p} mode="thumb" />
            </div>
            <div className="pick-card__meta">
              <div className="pick-card__name">{basename(p)}</div>
            </div>
          </article>
        ))}
      </div>

      <div className="submit-bar">
        <span className="submit-bar__summary">
          {picked ? (
            <>
              Picking <strong>{basename(picked)}</strong>
            </>
          ) : (
            <span style={{ color: "var(--ink-3)" }}>
              Click a card or press 1–{Math.min(9, request.paths.length)}
            </span>
          )}
        </span>
        <button className="submit-bar__btn" onClick={confirm} disabled={!picked}>
          Confirm pick
          <span className="submit-bar__hint">⏎</span>
        </button>
      </div>
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
              <AssetPreview path={p} mode="thumb" />
            </div>
            <div className="rank-item__body">
              <div className="rank-item__name">{basename(p)}</div>
            </div>
            <div className="rank-item__action">
              <button className="rank-item__btn" onClick={() => moveUp(i)} title="Move up">↑</button>
              <button className="rank-item__btn" onClick={() => moveDown(i)} title="Move down">↓</button>
              <button className="rank-item__btn" onClick={() => moveToUnranked(p)} title="Unrank">×</button>
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
                  <AssetPreview path={p} mode="thumb" />
                </div>
                <div className="rank-item__body">
                  <div className="rank-item__name">{basename(p)}</div>
                </div>
                <div className="rank-item__action">
                  <button className="rank-item__btn" onClick={() => moveToRanked(p)} title="Add to ranking">+</button>
                </div>
              </article>
            ))}
          </>
        )}
      </div>

      <div className="submit-bar">
        <span className="submit-bar__summary">
          <strong>{ranked.length}</strong> ranked
          {unranked.length > 0 && (
            <span style={{ color: "var(--ink-4)" }}> · {unranked.length} unranked</span>
          )}
        </span>
        <button className="submit-bar__btn" onClick={submit}>
          Submit ranking
          <span className="submit-bar__hint">⏎</span>
        </button>
      </div>
    </>
  );
}

// ─── Asset preview ────────────────────────────────────

function AssetPreview({
  path,
  mode,
}: {
  path: string;
  mode: "modal" | "thumb";
}) {
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
          fontSize: 11,
        }}
      >
        loading…
      </div>
    );
  }

  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const isHtml = ["html", "htm"].includes(ext);
  const isImg = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext);

  if (isImg) {
    return <img src={url} alt={basename(path)} />;
  }
  if (isHtml && mode === "thumb") {
    return <iframe src={url} scrolling="no" />;
  }
  if (isHtml && mode === "modal") {
    return <ScaledModalIframe url={url} />;
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
        fontSize: 14,
      }}
    >
      {ext} preview
    </div>
  );
}

function ScaledModalIframe({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      setScale(Math.min(w / NATIVE_W, h / NATIVE_H));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <iframe
        src={url}
        scrolling="no"
        className="iframe-fit"
        style={{
          width: `${NATIVE_W}px`,
          height: `${NATIVE_H}px`,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      />
    </div>
  );
}
