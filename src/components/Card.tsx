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
};

export function Card({
  file,
  onOpen,
  onCompareToggle,
  comparedSlot,
  onJumpToFolder,
  showLocation,
}: Props) {
  const isNew = (Date.now() / 1000 - file.mtime) < 600 && !file.decision;
  const folder = file.path.replace(/\/[^/]+$/, "");
  const folderLabel = niceFolderLabel(folder);

  return (
    <article
      className={`card ${comparedSlot != null ? "card--cmp-selected" : ""}`}
      onClick={(e) => {
        // ⌘/Ctrl-click → toggle compare selection. Otherwise normal preview.
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onCompareToggle?.(file);
          return;
        }
        onOpen();
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
    </article>
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
    <div className="card__thumb card__thumb--html" ref={ref}>
      {url && (
        <iframe
          src={url}
          loading="lazy"
          style={{ transform: "scale(0.234)" }}
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
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length <= 3) return trimmed;
  return parts.slice(-3).join("/");
}
