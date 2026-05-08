import { useEffect, useRef, useState } from "react";
import type { FileRow } from "../types";
import { basename, formatSize, relativeTime, api } from "../lib/api";
import { getBlobUrl } from "../lib/blobs";

type Props = {
  file: FileRow;
  onOpen: () => void;
  onCompareToggle?: (file: FileRow) => void;
  comparedSlot?: 0 | 1 | null;
  onJumpToFolder?: (folder: string) => void;
  showLocation?: boolean;
  onTrash?: (path: string) => void;
  onRename?: (path: string) => void;
  onReveal?: (path: string) => void;
};

export function Card({
  file,
  onOpen,
  onCompareToggle,
  comparedSlot,
  onJumpToFolder,
  showLocation,
  onTrash,
  onRename,
  onReveal,
}: Props) {
  const isNew = (Date.now() / 1000 - file.mtime) < 600 && !file.decision;
  const folder = file.path.replace(/\/[^/]+$/, "");
  const folderLabel = niceFolderLabel(folder);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <article
      className={`card ${comparedSlot != null ? "card--cmp-selected" : ""}`}
      onClick={(e) => {
        if (ctxMenu) { setCtxMenu(null); return; }
        // ⌘/Ctrl-click → toggle compare selection. Otherwise normal preview.
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onCompareToggle?.(file);
          return;
        }
        onOpen();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        // Clamp so menu doesn't overflow viewport
        const x = Math.min(e.clientX, window.innerWidth - 180);
        const y = Math.min(e.clientY, window.innerHeight - 160);
        setCtxMenu({ x, y });
      }}
      title={file.path}
    >
      {comparedSlot != null && (
        <span className="card__cmp-badge">
          {comparedSlot === 0 ? "compare ·1" : "compare · 2"}
        </span>
      )}
      <Thumb file={file} />
      <span className="card__kind">{file.kind}</span>
      {isNew && <span className="card__new-dot" />}
      <div className="card__meta">
        <div className="card__name" title={basename(file.path)}>{basename(file.path)}</div>
        <div className="card__sub">
          <span>{relativeTime(file.mtime)}</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>{formatSize(file.size)}</span>
          {file.decision && (
            <span className={`card__decision card__decision--${file.decision}`}>
              {file.decision === "approved" ? (
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="9" height="9" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
              {file.decision}
            </span>
          )}
        </div>
        {showLocation && (
          <div
            className="card__where"
            onClick={(e) => {
              e.stopPropagation();
              onJumpToFolder?.(folder);
            }}
            title={folder}
          >
            <svg className="card__where__icon" width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 4h10v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4zM2 4l1.5-1.5h2L7 4"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
            </svg>
            {folderLabel}
          </div>
        )}
      </div>
      {ctxMenu && (
        <CardContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onOpen={() => { setCtxMenu(null); onOpen(); }}
          onReveal={onReveal ? () => { setCtxMenu(null); onReveal(file.path); } : undefined}
          onRename={onRename ? () => { setCtxMenu(null); onRename(file.path); } : undefined}
          onTrash={onTrash ? () => { setCtxMenu(null); onTrash(file.path); } : undefined}
        />
      )}
    </article>
  );
}

function CardContextMenu({ x, y, onClose, onOpen, onReveal, onRename, onTrash }: {
  x: number; y: number;
  onClose: () => void;
  onOpen: () => void;
  onReveal?: () => void;
  onRename?: () => void;
  onTrash?: () => void;
}) {
  useEffect(() => {
    const dismiss = () => onClose();
    window.addEventListener("click", dismiss);
    window.addEventListener("contextmenu", dismiss);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") dismiss(); });
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("contextmenu", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [onClose]);

  return (
    <div className="card-ctx" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      <button className="card-ctx__item" onClick={onOpen}>Open preview</button>
      {onReveal && <button className="card-ctx__item" onClick={onReveal}>Reveal in Finder</button>}
      {onRename && <button className="card-ctx__item" onClick={onRename}>Rename…</button>}
      {onTrash && <button className="card-ctx__item card-ctx__item--danger" onClick={onTrash}>Move to Trash</button>}
    </div>
  );
}

function Thumb({ file }: { file: FileRow }) {
  const kind = file.kind;
  if (kind === "html" || kind === "htm") {
    return <HtmlThumb path={file.path} />;
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(kind)) {
    return <ImageThumb path={file.path} />;
  }
  if (kind === "md") {
    return <MdThumb path={file.path} />;
  }
  if (kind === "pdf") {
    return (
      <div className="card__thumb card__thumb--placeholder">
        <span>pdf</span>
      </div>
    );
  }
  return (
    <div className="card__thumb card__thumb--placeholder">
      <span>{kind}</span>
    </div>
  );
}

function useLazyVisible<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current || visible) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin: "300px" }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visible]);
  return [ref, visible] as const;
}

function ImageThumb({ path }: { path: string }) {
  const [ref, visible] = useLazyVisible<HTMLDivElement>();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    getBlobUrl(path)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path, visible]);

  return (
    <div className="card__thumb card__thumb--img" ref={ref}>
      {url && <img src={url} alt="" loading="lazy" />}
    </div>
  );
}

function HtmlThumb({ path }: { path: string }) {
  const [ref, visible] = useLazyVisible<HTMLDivElement>();
  const [url, setUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => { const w = el.clientWidth; if (w > 0) setScale(w / 1280); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  // ref.current is stable after mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    getBlobUrl(path).then((u) => { if (!cancelled) setUrl(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, [path, visible]);

  return (
    <div className="card__thumb card__thumb--html" ref={ref}>
      {url && (
        <iframe
          src={url}
          loading="lazy"
          style={{ transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}

function MdThumb({ path }: { path: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    api.readTextFile(path).then((t) => setText(t.slice(0, 600))).catch(() => setText(""));
  }, [path]);

  const lines = (text ?? "").split("\n").filter((l) => l.trim());
  const heading = lines.find((l) => l.startsWith("#"))?.replace(/^#+\s*/, "") ?? basename(path);
  const body = lines.filter((l) => !l.startsWith("#")).slice(0, 4);

  return (
    <div className="card__thumb card__thumb--md">
      <div className="card__thumb--md__h">{heading}</div>
      {body.map((_, i) => (
        <div
          key={i}
          className="card__thumb--md__line"
          style={{ width: `${60 + ((i * 13) % 35)}%` }}
        />
      ))}
    </div>
  );
}

function niceFolderLabel(folder: string): string {
  const trimmed = folder.replace(/\/Users\/[^/]+/, "~");
  const cleaned = trimmed.replace(/\/.claude\/worktrees\/[^/]+/, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length <= 3) return cleaned;
  return parts.slice(-3).join("/");
}
