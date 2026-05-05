import { useEffect, useRef, useState } from "react";
import type { FileRow } from "../types";
import { ReviewSet } from "../lib/review-set";
import { api, basename, formatSize, relativeTime } from "../lib/api";
import { getBlobUrl } from "../lib/blobs";
import { Card } from "./Card";
import { Markdown } from "../lib/markdown";

import "../styles/review-set.css";

const NATIVE_W = 1280;
const NATIVE_H = 800;

type Props = {
  set: ReviewSet;
  onOpenFile: (f: FileRow) => void;
};

export function ReviewSetView({ set, onOpenFile }: Props) {
  return (
    <div className={`rs-wrap ${set.plan ? "" : "rs-wrap--no-plan"}`}>
      <div className="rs-stage">
        <HeroCard file={set.hero} onOpen={() => onOpenFile(set.hero)} />

        <section className="rs-strip">
          <div className="rs-strip__head">
            <span className="rs-strip__eyebrow">numbered children</span>
            <span className="rs-strip__count">
              {set.numbered.length} of {set.numbered.length}
            </span>
          </div>
          <div className="rs-strip__row">
            {set.numbered.map((f) => (
              <NumberedCard key={f.id} file={f} onOpen={() => onOpenFile(f)} />
            ))}
          </div>
        </section>

        {set.others.length > 0 && (
          <section className="rs-others">
            <div className="rs-others__head">also in this folder</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 14,
              }}
            >
              {set.others.map((f) => (
                <Card key={f.id} file={f} onOpen={() => onOpenFile(f)} />
              ))}
            </div>
          </section>
        )}
      </div>

      {set.plan && <PlanPanel file={set.plan} />}
    </div>
  );
}

function HeroCard({ file, onOpen }: { file: FileRow; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    let cancelled = false;
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

  return (
    <article className="rs-hero" onClick={onOpen}>
      <div className="rs-hero__head" onClick={(e) => e.stopPropagation()}>
        <div className="rs-hero__title-block">
          <div className="rs-hero__eyebrow">★ promoted hub · spans the set</div>
          <h2 className="rs-hero__title">{prettyHubTitle(file.path)}</h2>
        </div>
        <span className="rs-hero__filename">{basename(file.path)}</span>
        <button className="rs-hero__open" onClick={onOpen}>
          Open ↗
        </button>
      </div>
      <div className="rs-hero__preview" ref={containerRef}>
        {url && (
          <iframe
            src={url}
            scrolling="no"
            style={{
              width: `${NATIVE_W}px`,
              height: `${NATIVE_H}px`,
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
          />
        )}
      </div>
    </article>
  );
}

function prettyHubTitle(path: string): string {
  // Use the parent folder name as the hub title
  const parts = path.split("/").filter(Boolean);
  const parent = parts[parts.length - 2] ?? "Hub";
  return parent
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function NumberedCard({ file, onOpen }: { file: FileRow; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBlobUrl(file.path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [file.path]);

  const num = basename(file.path).match(/^(\d{1,3})/)?.[1] ?? "??";
  const prettyName = basename(file.path).replace(/^\d{1,3}[-_. ]/, "");

  return (
    <article className="rs-card" onClick={onOpen} title={file.path}>
      <div className="rs-card__thumb">
        {url && (
          <iframe
            src={url}
            scrolling="no"
            style={{ transform: "scale(0.140625)" }}
          />
        )}
      </div>
      {file.decision && (
        <span className={`rs-card__verdict rs-card__verdict--${file.decision}`}>
          {file.decision === "approved" ? (
            <svg width="9" height="9" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 7l3 3 5-6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="8" height="8" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 3l8 8M3 11l8-8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          )}
        </span>
      )}
      <div className="rs-card__meta">
        <div className="rs-card__num">{num}</div>
        <div className="rs-card__name">{prettyName}</div>
        <div className="rs-card__sub">
          {relativeTime(file.mtime)} · {formatSize(file.size)}
        </div>
      </div>
    </article>
  );
}

function PlanPanel({ file }: { file: FileRow }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .readTextFile(file.path)
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch(() => setText("(could not read plan)"));
    return () => {
      cancelled = true;
    };
  }, [file.path]);

  return (
    <aside className="rs-plan">
      <div className="rs-plan__head">
        <div className="rs-plan__eyebrow">★ sibling plan · auto-detected</div>
        <span className="rs-plan__filename">{basename(file.path)}</span>
        <span className="rs-plan__sub">
          {formatSize(file.size)} · markdown · synced {relativeTime(file.mtime)}
        </span>
      </div>
      {text === null ? (
        <div style={{ color: "var(--ink-3)", fontStyle: "italic" }}>loading…</div>
      ) : (
        <Markdown source={text} />
      )}
    </aside>
  );
}
