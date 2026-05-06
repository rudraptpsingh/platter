import { useEffect, useState } from "react";
import type { FileRow } from "../types";
import {
  createShare,
  createShareCollection,
  rememberShare,
  shareKindFor,
  type CreateShareResult,
} from "../lib/share";
import { useToast } from "./Toast";
import { basename } from "../lib/api";

import "../styles/share-dialog.css";

type Props = {
  file: FileRow;
  /** Siblings or slideshow files — enables the slideshow-mode toggle when > 1 shareable item. */
  files?: FileRow[];
  onClose: () => void;
};

const EXPIRY_OPTIONS: Array<{ label: string; seconds: number }> = [
  { label: "24 hours", seconds: 24 * 60 * 60 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { label: "30 days", seconds: 30 * 24 * 60 * 60 },
];

export function ShareDialog({ file, files, onClose }: Props) {
  // Files that can actually be shared (filter out unsupported kinds)
  const shareableFiles = (files ?? []).filter((f) => shareKindFor(f.path) !== null);
  const canSlideshow = shareableFiles.length > 1;

  const [mode, setMode] = useState<"single" | "slideshow">(canSlideshow ? "slideshow" : "single");
  const [prompt, setPrompt] = useState(`What do you think about ${file.path.split("/").pop()}?`);
  const [expiry, setExpiry] = useState(EXPIRY_OPTIONS[1]); // default 7 days
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<CreateShareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    setWorking(true);
    setError(null);
    try {
      if (mode === "slideshow") {
        const r = await createShareCollection({
          paths: shareableFiles.map((f) => f.path),
          prompt,
          expires_seconds: expiry.seconds,
        });
        // Map each item's share_id back to its local path so decisions carry over.
        r.item_ids.forEach((itemId, i) => {
          if (shareableFiles[i]) rememberShare(itemId, shareableFiles[i].path);
        });
        setResult(r);
      } else {
        const r = await createShare({
          path: file.path,
          prompt,
          expires_seconds: expiry.seconds,
        });
        rememberShare(r.id, file.path);
        setResult(r);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  }

  function copyUrl() {
    if (!result) return;
    navigator.clipboard.writeText(result.url).then(() => {
      toast.show({ message: `Link copied · ${result.url}`, tone: "ok" });
    });
  }

  return (
    <div className="share-scrim" onClick={onClose}>
      <div className="share-card" onClick={(e) => e.stopPropagation()}>
        <header className="share-card__head">
          <div>
            <div className="share-card__eyebrow">★ public review link</div>
            <h2 className="share-card__title">
              {mode === "slideshow"
                ? <>Share <em>{shareableFiles.length} files</em></>
                : <>Share <em>{basename(file.path)}</em></>
              }
            </h2>
          </div>
          <button className="share-card__close" onClick={onClose} title="Close (Esc)">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {!result && (
          <>
            {canSlideshow && (
              <div className="share-mode-toggle">
                <button
                  className={`share-mode-btn ${mode === "single" ? "share-mode-btn--active" : ""}`}
                  onClick={() => setMode("single")}
                >
                  This file
                </button>
                <button
                  className={`share-mode-btn ${mode === "slideshow" ? "share-mode-btn--active" : ""}`}
                  onClick={() => setMode("slideshow")}
                >
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                    <rect x="1.5" y="3" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M5.5 6L8.5 7.5L5.5 9V6Z" fill="currentColor"/>
                  </svg>
                  Slideshow · {shareableFiles.length}
                </button>
              </div>
            )}

            <div className="share-card__lede">
              {mode === "slideshow"
                ? <>Creates one link showing all {shareableFiles.length} files as a slideshow. Reviewers can approve or reject each slide — decisions sync back here.</>
                : <>Generates a link anyone can open — no platter required. Approve / Reject / Iterate decisions land in your <em>Shared links</em> pane in Settings.</>
              }
            </div>

            <div className="share-field">
              <label htmlFor="share-prompt">What should the reviewer decide on?</label>
              <textarea
                id="share-prompt"
                className="share-field__ta"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. 'Does this hero variant feel right for the spring launch?'"
                rows={3}
                maxLength={1024}
                autoFocus
              />
            </div>

            <div className="share-field">
              <label>Expiry</label>
              <div className="share-radio-row">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    className={`share-radio ${expiry.label === opt.label ? "share-radio--active" : ""}`}
                    onClick={() => setExpiry(opt)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="share-error">{error}</div>}

            <div className="share-actions">
              <button className="share-btn share-btn--ghost" onClick={onClose} disabled={working}>
                Cancel
              </button>
              <button className="share-btn share-btn--primary" onClick={submit} disabled={working}>
                {working
                  ? "Creating link…"
                  : mode === "slideshow" ? "Create slideshow link" : "Create link"
                }
                {!working && (
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </div>
          </>
        )}

        {result && (
          <>
            <div className="share-card__success">
              <div className="share-card__success-mark">✓</div>
              <h3 className="share-card__success-h">Link is ready.</h3>
              <p className="share-card__success-sub">
                {mode === "slideshow"
                  ? `Send this to share all ${shareableFiles.length} files as a slideshow. Per-slide decisions sync back here.`
                  : "Send this to your reviewer. Decisions show up in Settings → Shared links."
                }
              </p>
            </div>

            <div className="share-url" onClick={copyUrl} title="Click to copy">
              <span className="share-url__text">{result.url}</span>
              <span className="share-url__copy">Copy</span>
            </div>

            <div className="share-actions">
              <button
                className="share-btn share-btn--ghost"
                onClick={() => {
                  setResult(null);
                  setError(null);
                }}
              >
                Share another
              </button>
              <button className="share-btn share-btn--primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
