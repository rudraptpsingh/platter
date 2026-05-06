import { useEffect, useState } from "react";
import type { FileRow } from "../types";
import { api, basename, dirname, fileUrl, formatSize, relativeTime } from "../lib/api";
import { getBlobUrl } from "../lib/blobs";
import { copySourceToClipboard, copySourceAsMarkdown, isTextCopyable } from "../lib/copy-source";
import { shareKindFor } from "../lib/share";
import { ShareDialog } from "./ShareDialog";
import { useToast } from "./Toast";

type Props = {
  file: FileRow;
  siblings: FileRow[];
  onClose: () => void;
  onDecided: (path: string, decision: "approved" | "rejected") => void;
  onNavigate: (file: FileRow) => void;
};

export function PreviewModal({ file, siblings, onClose, onDecided, onNavigate }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const toast = useToast();
  const copyable = isTextCopyable(file.path);
  const shareable = shareKindFor(file.path) !== null;

  async function copyCode(asMarkdown: boolean) {
    try {
      const { lines } = asMarkdown
        ? await copySourceAsMarkdown(file.path)
        : await copySourceToClipboard(file.path);
      toast.show({
        message: asMarkdown
          ? `Copied ${basename(file.path)} as markdown · ${lines} lines`
          : `Copied ${basename(file.path)} · ${lines} lines`,
        tone: "ok",
      });
    } catch (e) {
      toast.show({
        message: `Copy failed: ${e instanceof Error ? e.message : String(e)}`,
        tone: "warn",
      });
    }
  }
  useEffect(() => {
    let cancelled = false;
    setBlobUrl(null);
    getBlobUrl(file.path)
      .then((u) => {
        if (!cancelled) setBlobUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [file.path]);

  const idx = siblings.findIndex((s) => s.path === file.path);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowLeft" && prev) {
        e.preventDefault();
        onNavigate(prev);
        return;
      }
      if (e.key === "ArrowRight" && next) {
        e.preventDefault();
        onNavigate(next);
        return;
      }
      // Don't intercept when typing in inputs
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      // ⌘C copies file source · ⌘⇧C copies as a markdown fenced block.
      // Skip if there's a real text selection — let the OS handle copy normally.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        const sel = window.getSelection?.();
        const hasSelection = sel && sel.toString().length > 0;
        if (!hasSelection && copyable) {
          e.preventDefault();
          copyCode(e.shiftKey);
          return;
        }
      }

      if (e.key.toLowerCase() === "a") {
        api.decide(file.path, "approved").then(() => onDecided(file.path, "approved"));
      }
      if (e.key.toLowerCase() === "r") {
        api.decide(file.path, "rejected").then(() => onDecided(file.path, "rejected"));
      }
      // S → open Share dialog (only if the file kind is shareable)
      if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey && shareable) {
        e.preventDefault();
        setShowShare(true);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.path, prev, next, copyable, onClose, onDecided, onNavigate]);

  function decide(d: "approved" | "rejected") {
    api.decide(file.path, d).then(() => onDecided(file.path, d));
  }

  function reveal() {
    // Use opener plugin via shell — open the parent dir in Finder
    // The simplest approach: copy path. For now, use Finder reveal via `open -R`.
    // Tauri has tauri-plugin-shell or opener; we'll use the opener.
    import("@tauri-apps/plugin-opener").then(({ revealItemInDir }) => {
      revealItemInDir(file.path).catch(console.error);
    });
  }

  function openInBrowser() {
    import("@tauri-apps/plugin-opener").then(({ openUrl }) => {
      openUrl(fileUrl(file.path)).catch(console.error);
    });
  }

  const isVisualHtml = file.kind === "html" || file.kind === "htm";
  const isImage = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(file.kind);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview">
          <div className="preview__head">
            <div className="preview__url">file://{file.path}</div>
          </div>
          <div className="preview__frame">
            {isVisualHtml && blobUrl && <iframe src={blobUrl} />}
            {isImage && blobUrl && <img src={blobUrl} alt={basename(file.path)} />}
            {!blobUrl && (isVisualHtml || isImage) && (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)" }}>
                Loading…
              </div>
            )}

            {prev && (
              <button
                className="nav-btn nav-btn--left"
                onClick={() => onNavigate(prev)}
                title={`${basename(prev.path)} (←)`}
              >
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                  <path d="M9 2.5L4.5 7L9 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {next && (
              <button
                className="nav-btn nav-btn--right"
                onClick={() => onNavigate(next)}
                title={`${basename(next.path)} (→)`}
              >
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                  <path d="M5 2.5L9.5 7L5 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {siblings.length > 1 && idx >= 0 && (
              <div className="nav-counter">
                {idx + 1} <span style={{ opacity: 0.5 }}>/ {siblings.length}</span>
              </div>
            )}
            {!isVisualHtml && !isImage && (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                  fontSize: 28,
                  color: "var(--ink-3)",
                }}
              >
                {file.kind} preview
              </div>
            )}
          </div>
        </div>

        <aside className="meta-panel">
          <button className="meta-panel__close" onClick={onClose} title="Close (Esc)">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>

          <div className="meta-panel__scroll">
            <div className="meta-panel__head">
              <h2 className="meta-panel__title">{basename(file.path)}</h2>
              <div className="meta-panel__path">{dirname(file.path)}</div>
            </div>

            <div className="meta-panel__section">
              <span className="eyebrow">file</span>
              <div className="meta-row">
                <span className="meta-row__label">kind</span>
                <span className="meta-row__value">{file.kind}</span>
              </div>
              <div className="meta-row">
                <span className="meta-row__label">size</span>
                <span className="meta-row__value">{formatSize(file.size)}</span>
              </div>
              <div className="meta-row">
                <span className="meta-row__label">modified</span>
                <span className="meta-row__value">{relativeTime(file.mtime)}</span>
              </div>
            </div>

            <div className="meta-panel__section">
              <span className="eyebrow">decision</span>
              {file.decision ? (
                <div style={{ fontSize: 13, color: "var(--ink)" }}>
                  <strong>{file.decision}</strong>
                  {file.decided_at && (
                    <span style={{ color: "var(--ink-3)", marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      {relativeTime(file.decided_at)}
                    </span>
                  )}
                  {file.decision_note && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "var(--ink-2)",
                        fontStyle: "italic",
                      }}
                    >
                      "{file.decision_note}"
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic" }}>
                  No decision yet — press A to approve, R to reject.
                </div>
              )}
            </div>

            <div className="meta-panel__section">
              <span className="eyebrow">keyboard</span>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)", lineHeight: 1.9 }}>
                <div><kbd style={kbd}>←</kbd> <kbd style={kbd}>→</kbd> previous / next</div>
                <div><kbd style={kbd}>A</kbd> approve · <kbd style={kbd}>R</kbd> reject</div>
                {copyable && (
                  <div>
                    <kbd style={kbd}>⌘</kbd><kbd style={kbd}>C</kbd> copy source ·{" "}
                    <kbd style={kbd}>⌘</kbd><kbd style={kbd}>⇧</kbd><kbd style={kbd}>C</kbd> as markdown
                  </div>
                )}
                <div><kbd style={kbd}>Esc</kbd> close</div>
              </div>
            </div>
          </div>

          <div className="meta-panel__actions">
            <button className="btn btn--reject" onClick={() => decide("rejected")}>
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Reject
            </button>
            <button className="btn btn--approve" onClick={() => decide("approved")}>
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Approve
            </button>
            {shareable && (
              <button
                className="btn"
                onClick={() => setShowShare(true)}
                title="Share a public review link"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <circle cx="3" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="11" cy="3" r="1.6" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="11" cy="11" r="1.6" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M4.5 6.5L9.5 4M4.5 7.5L9.5 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                Share
              </button>
            )}
            {copyable && (
              <button
                className="btn"
                onClick={() => copyCode(false)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  copyCode(true);
                }}
                title="Copy source (⌘C) · right-click for markdown"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <path
                    d="M5 3V2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
                Copy
              </button>
            )}
            <button className="btn btn--icon" onClick={reveal} title="Reveal in Finder">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M2 4l5 4 5-4M2 4v8h10V4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
            </button>
            <button className="btn btn--icon" onClick={openInBrowser} title="Open in browser">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </aside>
      </div>

      {showShare && <ShareDialog file={file} onClose={() => setShowShare(false)} />}
    </div>
  );
}

const kbd = {
  fontFamily: "var(--font-mono)",
  background: "rgba(255,253,248,0.7)",
  border: "0.5px solid var(--line-strong)",
  borderRadius: 3,
  padding: "1px 5px",
  fontSize: 9.5,
  color: "var(--ink-2)",
} as const;
