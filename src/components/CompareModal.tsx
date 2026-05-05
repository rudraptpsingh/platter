import { useEffect, useRef, useState } from "react";
import type { FileRow } from "../types";
import { api, basename, formatSize, relativeTime } from "../lib/api";
import { getBlobUrl } from "../lib/blobs";

import "../styles/compare-modal.css";

const NATIVE_W = 1280;
const NATIVE_H = 800;

type Props = {
  left: FileRow;
  right: FileRow;
  onClose: () => void;
  onDecided: (path: string, decision: "approved" | "rejected") => void;
  onSwap: () => void;
};

export function CompareModal({ left, right, onClose, onDecided, onSwap }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        e.preventDefault();
        onSwap();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onSwap]);

  return (
    <div className="compare-scrim" onClick={onClose}>
      <div className="compare-card" onClick={(e) => e.stopPropagation()}>
        <header className="compare-head">
          <div className="compare-head__eyebrow">★ side by side</div>
          <div className="compare-head__title">
            <strong title={left.path}>{basename(left.path)}</strong>
            <span className="compare-head__vs">vs</span>
            <strong title={right.path}>{basename(right.path)}</strong>
          </div>
          <button className="compare-head__close" onClick={onClose} title="Close (Esc)">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="compare-grid">
          <Pane file={left} side="left" onDecide={onDecided} hotkeys={["A", "R"]} />
          <div className="compare-divider" />
          <Pane file={right} side="right" onDecide={onDecided} hotkeys={["←", "→"]} />
        </div>

        <footer className="compare-foot">
          <span className="key"><kbd>tab</kbd> swap</span>
          <span className="key">left: <kbd>A</kbd>/<kbd>R</kbd></span>
          <span className="key">right: <kbd>←</kbd>/<kbd>→</kbd></span>
          <span className="key" style={{ marginLeft: "auto" }}>
            <kbd>esc</kbd> close
          </span>
        </footer>
      </div>
    </div>
  );
}

function Pane({
  file,
  side,
  onDecide,
  hotkeys,
}: {
  file: FileRow;
  side: "left" | "right";
  onDecide: (path: string, decision: "approved" | "rejected") => void;
  hotkeys: [string, string];
}) {
  const [url, setUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    getBlobUrl(file.path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [file.path]);

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

  // Per-side keyboard mapping
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      const key = e.key.toLowerCase();
      if (side === "left" && key === "a") {
        api.decide(file.path, "approved").then(() => onDecide(file.path, "approved"));
      } else if (side === "left" && key === "r") {
        api.decide(file.path, "rejected").then(() => onDecide(file.path, "rejected"));
      } else if (side === "right" && e.key === "ArrowRight") {
        api.decide(file.path, "approved").then(() => onDecide(file.path, "approved"));
      } else if (side === "right" && e.key === "ArrowLeft") {
        api.decide(file.path, "rejected").then(() => onDecide(file.path, "rejected"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file.path, side, onDecide]);

  const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
  const isHtml = ext === "html" || ext === "htm";
  const isImg = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext);

  return (
    <div className="compare-pane">
      <div className="compare-pane__label">
        {hotkeys.map((k) => (
          <kbd key={k}>{k}</kbd>
        ))}
        <span className="compare-pane__sidetag">{side}</span>
      </div>

      <div className="compare-pane__frame" ref={containerRef}>
        {url && isImg && <img src={url} alt={basename(file.path)} />}
        {url && isHtml && (
          <iframe
            src={url}
            scrolling="no"
            className="compare-pane__iframe"
            style={{
              width: `${NATIVE_W}px`,
              height: `${NATIVE_H}px`,
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
          />
        )}
        {!url && (
          <div className="compare-pane__loading">loading…</div>
        )}
        {file.decision && (
          <span className={`compare-pane__verdict compare-pane__verdict--${file.decision}`}>
            {file.decision === "approved" ? "✓ approved" : "✕ rejected"}
          </span>
        )}
      </div>

      <div className="compare-pane__meta">
        <div className="compare-pane__name" title={file.path}>{basename(file.path)}</div>
        <div className="compare-pane__sub">
          {formatSize(file.size)} · {relativeTime(file.mtime)} ·{" "}
          <span title={file.path}>{shortPath(file.path)}</span>
        </div>
      </div>

      <div className="compare-pane__actions">
        <button
          className="btn-decision btn-decision--reject"
          onClick={() =>
            api.decide(file.path, "rejected").then(() => onDecide(file.path, "rejected"))
          }
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Reject
        </button>
        <button
          className="btn-decision btn-decision--approve"
          onClick={() =>
            api.decide(file.path, "approved").then(() => onDecide(file.path, "approved"))
          }
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          Approve
        </button>
      </div>
    </div>
  );
}

function shortPath(p: string): string {
  const trimmed = p.replace(/\/Users\/[^/]+/, "~");
  const parts = trimmed.split("/");
  parts.pop(); // drop filename
  if (parts.length <= 4) return parts.join("/");
  return parts.slice(-3).join("/");
}
