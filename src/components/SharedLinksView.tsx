import { useEffect, useState } from "react";
import { listShares, type ShareLink, type ShareDecision, lookupSharePath } from "../lib/share";
import { relativeTime } from "../lib/api";
import { fileUrl } from "../lib/api";
import { useToast } from "./Toast";
import "../styles/shared-links.css";

const BASE = "https://platter.pages.dev";

export function SharedLinksView() {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function refresh() {
    try {
      const r = await listShares();
      setLinks(r.sort((a, b) => b.created_at - a.created_at));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  const total = links?.length ?? 0;
  const pending = links?.filter(l => l.decisions.length === 0).length ?? 0;
  const totalDecisions = links?.reduce((a, l) => a + l.decisions.length, 0) ?? 0;

  function copyLink(id: string) {
    const url = `${BASE}/r/${id}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.show({ message: "Link copied", tone: "ok" });
    });
  }

  async function openLink(id: string) {
    const url = `${BASE}/r/${id}`;
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  }

  return (
    <div className="shv">
      {/* Header */}
      <div className="shv__head">
        <div className="shv__title-row">
          <h2 className="shv__title">Shared links</h2>
          <button className="shv__refresh" onClick={refresh} title="Refresh">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M2 7a5 5 0 0 1 9-3M12 7a5 5 0 0 1-9 3M11 1v3h-3M3 13v-3h3"
                stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        {links !== null && (
          <div className="shv__stats">
            <span className="shv__stat">{total} link{total !== 1 ? "s" : ""}</span>
            {pending > 0 && (
              <span className="shv__stat shv__stat--warn">{pending} awaiting review</span>
            )}
            {totalDecisions > 0 && (
              <span className="shv__stat shv__stat--ok">{totalDecisions} decision{totalDecisions !== 1 ? "s" : ""}</span>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="shv__error">{error}</div>
      )}

      {/* Loading */}
      {links === null && !error && (
        <div className="shv__empty">
          <div className="shv__empty-h">Loading…</div>
        </div>
      )}

      {/* Empty */}
      {links?.length === 0 && (
        <div className="shv__empty">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" opacity="0.25">
            <path d="M8 18a6 6 0 0 1 6-6h8a6 6 0 0 1 0 12H14a6 6 0 0 1-6-6z" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M14 18h8M20 14l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div className="shv__empty-h">No links yet</div>
          <div className="shv__empty-p">
            Open any file in preview and press <kbd>S</kbd> to create a public review link.
          </div>
        </div>
      )}

      {/* Links list */}
      {links && links.length > 0 && (
        <div className="shv__list">
          {links.map(link => (
            <SharedLinkRow
              key={link.id}
              link={link}
              onCopy={() => copyLink(link.id)}
              onOpen={() => openLink(link.id)}
            />
          ))}
        </div>
      )}

      <div className="shv__footer">
        Auto-refreshes every 30 seconds · decisions sync to local files
      </div>
    </div>
  );
}

function SharedLinkRow({
  link,
  onCopy,
  onOpen,
}: {
  link: ShareLink;
  onCopy: () => void;
  onOpen: () => void;
}) {
  const localPath = lookupSharePath(link.id);
  const expired = link.expires_at !== null && link.expires_at < Date.now() / 1000;
  const revoked = link.revoked_at !== null;

  const approved = link.decisions.filter(d => d.decision === "approved");
  const rejected = link.decisions.filter(d => d.decision === "rejected");
  const iterated = link.decisions.filter(d => d.decision === "iterated");

  return (
    <div className={`slr ${expired || revoked ? "slr--expired" : ""}`}>
      {/* Thumb */}
      <div className="slr__thumb">
        <LinkThumb link={link} localPath={localPath} />
        <span className="slr__kind">{link.kind}</span>
      </div>

      {/* Body */}
      <div className="slr__body">
        <div className="slr__name">{link.filename}</div>
        {link.prompt && (
          <div className="slr__prompt">"{link.prompt}"</div>
        )}

        {/* Meta row */}
        <div className="slr__meta">
          <span>{relativeTime(link.created_at)}</span>
          <span className="slr__dot">·</span>
          <span>{link.view_count} view{link.view_count !== 1 ? "s" : ""}</span>
          <span className="slr__dot">·</span>
          {expired ? (
            <span className="slr__tag slr__tag--expired">expired</span>
          ) : revoked ? (
            <span className="slr__tag slr__tag--expired">revoked</span>
          ) : link.expires_at ? (
            <span>expires {relativeTimeFromNow(link.expires_at)}</span>
          ) : (
            <span>no expiry</span>
          )}
        </div>

        {/* Decisions */}
        {link.decisions.length === 0 ? (
          <div className="slr__no-decisions">Awaiting review</div>
        ) : (
          <div className="slr__decisions">
            {approved.map(d => <DecisionChip key={d.id} d={d} type="approved" />)}
            {rejected.map(d => <DecisionChip key={d.id} d={d} type="rejected" />)}
            {iterated.map(d => <DecisionChip key={d.id} d={d} type="iterated" />)}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="slr__actions">
        <button className="slr__btn" onClick={onCopy} title="Copy link">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M5 3V2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          Copy
        </button>
        <button className="slr__btn" onClick={onOpen} title="Open in browser">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M6 2H2v10h10V8M9 2h3v3M12 2l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Open
        </button>
      </div>
    </div>
  );
}

function DecisionChip({ d, type }: { d: ShareDecision; type: "approved" | "rejected" | "iterated" }) {
  const colors = {
    approved: { bg: "var(--sage-soft)", color: "var(--sage-2)", icon: "✓" },
    rejected: { bg: "var(--brick-soft)", color: "var(--brick)", icon: "✕" },
    iterated: { bg: "rgba(181,138,61,0.12)", color: "var(--gold)", icon: "↻" },
  };
  const c = colors[type];
  const name = d.reviewer_name ?? "anonymous";

  return (
    <div
      className="slr__chip"
      style={{ background: c.bg }}
      title={d.note ? `${name}: ${d.note}` : name}
    >
      <span className="slr__chip-icon" style={{ color: c.color }}>{c.icon}</span>
      <span className="slr__chip-name" style={{ color: c.color }}>{name}</span>
      {d.note && <span className="slr__chip-note">· {d.note}</span>}
      <span className="slr__chip-time">{relativeTime(d.decided_at)}</span>
    </div>
  );
}

function LinkThumb({ link, localPath }: { link: ShareLink; localPath: string | null }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!localPath) return;
    try {
      setUrl(fileUrl(localPath));
    } catch { /* ignore */ }
  }, [localPath]);

  if (url && ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(link.kind)) {
    return <img src={url} alt="" className="slr__thumb-img" />;
  }
  if (url && (link.kind === "html" || link.kind === "htm")) {
    return (
      <iframe
        src={url}
        className="slr__thumb-iframe"
        style={{ transform: "scale(0.18)", transformOrigin: "top left", pointerEvents: "none" }}
      />
    );
  }
  return (
    <div className="slr__thumb-placeholder">
      <span>{link.kind}</span>
    </div>
  );
}

function relativeTimeFromNow(unix: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = unix - now;
  if (diff <= 0) return "now";
  if (diff < 3600) return `in ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `in ${Math.floor(diff / 3600)}h`;
  return `in ${Math.floor(diff / 86400)}d`;
}
