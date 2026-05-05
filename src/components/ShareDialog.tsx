import { useEffect, useState } from "react";
import type { FileRow } from "../types";
import { createShare, rememberShare, type CreateShareResult } from "../lib/share";
import { useToast } from "./Toast";

import "../styles/share-dialog.css";

type Props = {
  file: FileRow;
  onClose: () => void;
};

const EXPIRY_OPTIONS: Array<{ label: string; seconds: number }> = [
  { label: "24 hours", seconds: 24 * 60 * 60 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { label: "30 days", seconds: 30 * 24 * 60 * 60 },
];

export function ShareDialog({ file, onClose }: Props) {
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
      const r = await createShare({
        path: file.path,
        prompt,
        expires_seconds: expiry.seconds,
      });
      // Remember the local path for this share_id so reviewer decisions
      // can carry back to the local file via the background poll.
      rememberShare(r.id, file.path);
      setResult(r);
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
              Share <em>{file.path.split("/").pop()}</em>
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
            <div className="share-card__lede">
              Generates a link anyone can open — no platter required. Approve / Reject / Iterate
              decisions land in your <em>Shared links</em> pane in Settings.
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
                {working ? "Creating link…" : "Create link"}
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
                Send this to your reviewer. Decisions show up in Settings → Shared links.
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
