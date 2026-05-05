import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FileRow } from "../types";
import { basename, formatSize, relativeTime } from "../lib/api";
import { getBlobUrl } from "../lib/blobs";

import "../styles/slideshow.css";

type Props = {
  files: FileRow[];
  startIndex?: number;
  onClose: () => void;
};

export function Slideshow({ files, startIndex = 0, onClose }: Props) {
  const [idx, setIdx] = useState(Math.max(0, Math.min(startIndex, files.length - 1)));
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoSeconds, setAutoSeconds] = useState(4);

  const total = files.length;
  const file = files[idx];

  function go(delta: number) {
    setIdx((i) => {
      const next = i + delta;
      if (next < 0) return 0;
      if (next >= total) {
        // Reached the end — stop auto-play but stay on the last frame
        setAutoPlay(false);
        return total - 1;
      }
      return next;
    });
  }

  // Keyboard nav. ESC closes. ← / → step. Space or Enter advances. P toggles
  // play/pause. Number keys 1–9 jump.
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
        return;
      }
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        go(1);
        return;
      }
      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setAutoPlay((v) => !v);
        return;
      }
      if (e.key.toLowerCase() === "f") {
        // F → fast-cycle: stop on current and bump speed down
        e.preventDefault();
        setAutoSeconds((s) => (s <= 1 ? 4 : Math.max(1, s - 1)));
        return;
      }
      const n = parseInt(e.key, 10);
      if (!isNaN(n) && n >= 1 && n <= Math.min(9, total)) {
        e.preventDefault();
        setIdx(n - 1);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // Auto-advance timer
  useEffect(() => {
    if (!autoPlay) return;
    const id = window.setTimeout(() => {
      setIdx((i) => {
        if (i + 1 >= total) {
          setAutoPlay(false);
          return i;
        }
        return i + 1;
      });
    }, autoSeconds * 1000);
    return () => clearTimeout(id);
  }, [autoPlay, autoSeconds, idx, total]);

  if (!file) return null;

  const node = (
    <div className="slideshow" role="dialog" aria-label="slideshow">
      <SlideshowFrame file={file} />

      <header className="slideshow__head">
        <div className="slideshow__eyebrow">
          ★ slideshow · {idx + 1} of {total}
        </div>
        <button className="slideshow__close" onClick={onClose} title="Close (Esc)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="slideshow__caption">
        <h2 className="slideshow__name">{basename(file.path)}</h2>
        <div className="slideshow__meta">
          <span>{file.kind}</span>
          <span className="slideshow__dot">·</span>
          <span>{formatSize(file.size)}</span>
          <span className="slideshow__dot">·</span>
          <span>{relativeTime(file.mtime)}</span>
          {file.decision && (
            <>
              <span className="slideshow__dot">·</span>
              <span
                className={`slideshow__verdict slideshow__verdict--${file.decision}`}
              >
                {file.decision}
              </span>
            </>
          )}
        </div>
      </div>

      {idx > 0 && (
        <button className="slideshow__nav slideshow__nav--prev" onClick={() => go(-1)} title="Previous (←)">
          <svg width="20" height="20" viewBox="0 0 14 14" fill="none">
            <path d="M9 2.5L4.5 7L9 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {idx < total - 1 && (
        <button className="slideshow__nav slideshow__nav--next" onClick={() => go(1)} title="Next (→ or Space)">
          <svg width="20" height="20" viewBox="0 0 14 14" fill="none">
            <path d="M5 2.5L9.5 7L5 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <ProgressTrack files={files} idx={idx} onJump={(i) => setIdx(i)} />

      <footer className="slideshow__foot">
        <button
          className={`slideshow__playbtn ${autoPlay ? "slideshow__playbtn--on" : ""}`}
          onClick={() => setAutoPlay((v) => !v)}
          title={autoPlay ? "Pause (P)" : `Auto-advance every ${autoSeconds}s (P)`}
        >
          {autoPlay ? (
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <rect x="3" y="2.5" width="2.5" height="9" fill="currentColor" />
              <rect x="8.5" y="2.5" width="2.5" height="9" fill="currentColor" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M4 2v10l8-5z" fill="currentColor" />
            </svg>
          )}
          {autoPlay ? "Pause" : "Play"}
        </button>
        <div className="slideshow__speed">
          <span className="slideshow__speedlabel">speed</span>
          {[2, 4, 8].map((s) => (
            <button
              key={s}
              className={`slideshow__speedbtn ${autoSeconds === s ? "slideshow__speedbtn--active" : ""}`}
              onClick={() => setAutoSeconds(s)}
            >
              {s}s
            </button>
          ))}
        </div>
        <div className="slideshow__shortcuts">
          <kbd>←</kbd> <kbd>→</kbd> step  <kbd>space</kbd> next  <kbd>p</kbd> play  <kbd>esc</kbd> close
        </div>
      </footer>
    </div>
  );

  // Portal to body so it escapes any overflow:hidden in main
  return createPortal(node, document.body);
}

function SlideshowFrame({ file }: { file: FileRow }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    getBlobUrl(file.path)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [file.path]);

  const isHtml = file.kind === "html" || file.kind === "htm";
  const isImage = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(file.kind);
  const isPdf = file.kind === "pdf";

  return (
    <div className="slideshow__stage">
      {!url && <div className="slideshow__loading">Loading…</div>}
      {url && isImage && <img src={url} alt={basename(file.path)} className="slideshow__img" />}
      {url && isHtml && <iframe src={url} className="slideshow__iframe" title={basename(file.path)} />}
      {url && isPdf && (
        <iframe src={url} className="slideshow__iframe" title={basename(file.path)} />
      )}
      {url && !isImage && !isHtml && !isPdf && (
        <div className="slideshow__placeholder">{file.kind}</div>
      )}
    </div>
  );
}

// ─── progress track ──────────────────────────────────────────────
// Tiny clickable strip below the caption — one tick per slide, lets
// the user jump directly. Doubles as a visual progress indicator
// when auto-play is running.
function ProgressTrack({
  files,
  idx,
  onJump,
}: {
  files: FileRow[];
  idx: number;
  onJump: (i: number) => void;
}) {
  const total = files.length;
  // Don't show for tiny sets (1 or 2) — the nav arrows are enough.
  if (total <= 2) return null;

  // For very large sets we'd render hundreds of dots; cap with a digest.
  // For now fixed-tick design — works for any folder of mockups (typical 5–30).
  const trackRef = useRef<HTMLDivElement>(null);

  return (
    <div className="slideshow__track" ref={trackRef}>
      {files.map((f, i) => {
        const tone = f.decision === "approved"
          ? "ok"
          : f.decision === "rejected"
          ? "warn"
          : "neutral";
        return (
          <button
            key={f.id}
            className={
              `slideshow__tick slideshow__tick--${tone} ` +
              (i === idx ? "slideshow__tick--active " : "") +
              (i < idx ? "slideshow__tick--past " : "")
            }
            onClick={() => onJump(i)}
            title={`${i + 1}. ${basename(f.path)}`}
            aria-label={`Slide ${i + 1}: ${basename(f.path)}`}
          />
        );
      })}
    </div>
  );
}
