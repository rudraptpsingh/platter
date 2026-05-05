import { useEffect, useMemo, useState } from "react";
import type { FileRow } from "../types";
import { api, basename, formatSize } from "../lib/api";
import { Card } from "./Card";

import "../styles/recap.css";

type RecapWindow = "week" | "month" | "all";
type PrintFilter = "approved" | "all";

type Props = {
  onOpenFile: (f: FileRow) => void;
  onJumpToFolder: (folder: string) => void;
};

const WINDOW_LABELS: Record<RecapWindow, string> = {
  week: "This week",
  month: "This month",
  all: "All time",
};

const WINDOW_SECONDS: Record<RecapWindow, number | null> = {
  week: 7 * 24 * 60 * 60,
  month: 30 * 24 * 60 * 60,
  all: null,
};

export function RecapView({ onOpenFile, onJumpToFolder }: Props) {
  const [win, setWin] = useState<RecapWindow>("week");
  const [printFilter, setPrintFilter] = useState<PrintFilter>("approved");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Pull the file roster for the chosen window. listRecent already orders
    // by mtime DESC; for "all" we ask for a generous cap. For week/month we
    // also pull from listRecent and then filter — keeps it to one query and
    // respects the same ordering the rest of the app uses.
    const limit = win === "all" ? 1000 : win === "month" ? 500 : 250;
    api
      .listRecent(limit)
      .then((rows) => {
        if (cancelled) return;
        const cutoffSeconds = WINDOW_SECONDS[win];
        const now = Date.now() / 1000;
        const filtered = cutoffSeconds
          ? rows.filter((f) => now - f.mtime <= cutoffSeconds)
          : rows;
        setFiles(filtered);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [win]);

  // Group by local-day. Use the file's mtime as the timeline anchor — that's
  // when the file last changed on disk, which is the closest thing we have
  // to "when did this work happen."
  const days = useMemo(() => groupByDay(files), [files]);

  // Aggregate top-line stats — shown above the day list and as the cover line
  // on the printed contact sheet.
  const totals = useMemo(() => {
    const t = {
      made: files.length,
      approved: files.filter((f) => f.decision === "approved").length,
      rejected: files.filter((f) => f.decision === "rejected").length,
    };
    return t;
  }, [files]);

  function handlePrint() {
    // Stash the print-time filter on document.body so the @media print
    // stylesheet can hide rejected/undecided items when the user wants
    // an "approved-only" contact sheet without re-rendering the tree.
    document.body.setAttribute("data-print-filter", printFilter);
    requestAnimationFrame(() => {
      window.print();
    });
  }

  if (loading && files.length === 0) {
    return (
      <div className="center-state">
        <h2 className="center-state__h">Pulling the recap…</h2>
      </div>
    );
  }

  if (!loading && files.length === 0) {
    return (
      <div className="center-state">
        <h2 className="center-state__h">Nothing in this window.</h2>
        <p className="center-state__sub">
          Try a wider window — there's no work in {WINDOW_LABELS[win].toLowerCase()} yet.
        </p>
      </div>
    );
  }

  return (
    <div className="recap" data-window={win}>
      <header className="recap__head no-print">
        <div className="recap__head-left">
          <div className="recap__eyebrow">★ recap</div>
          <h1 className="recap__title">
            <em>{WINDOW_LABELS[win]}</em>
          </h1>
          <div className="recap__sub">
            {totals.made} {totals.made === 1 ? "asset" : "assets"} ·{" "}
            <span style={{ color: "var(--sage-2)" }}>{totals.approved} approved</span>
            {" · "}
            <span style={{ color: "var(--brick)" }}>{totals.rejected} rejected</span>
          </div>
        </div>

        <div className="recap__head-right">
          <div className="recap__windowpicker">
            {(["week", "month", "all"] as RecapWindow[]).map((w) => (
              <button
                key={w}
                type="button"
                className={`recap__windowbtn ${win === w ? "recap__windowbtn--active" : ""}`}
                onClick={() => setWin(w)}
              >
                {WINDOW_LABELS[w]}
              </button>
            ))}
          </div>

          <div className="recap__printbar">
            <select
              className="recap__printfilter"
              value={printFilter}
              onChange={(e) => setPrintFilter(e.target.value as PrintFilter)}
              title="What to include in the contact sheet"
            >
              <option value="approved">Approved only</option>
              <option value="all">Everything</option>
            </select>
            <button className="recap__printbtn" onClick={handlePrint} title="Print or save as PDF (⌘P)">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M3 5V2h8v3M3 10H2V6h10v4h-1M4 8h6v5H4z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Contact sheet
            </button>
          </div>
        </div>
      </header>

      {/* Print-only cover block — hidden on screen, page 1 of the PDF. */}
      <section className="recap__cover print-only">
        <div className="recap__cover-eyebrow">platter — review log</div>
        <h1 className="recap__cover-h">{WINDOW_LABELS[win]}</h1>
        <div className="recap__cover-stats">
          <div>
            <strong>{totals.made}</strong>
            <span>assets made</span>
          </div>
          <div>
            <strong style={{ color: "var(--sage-2)" }}>{totals.approved}</strong>
            <span>approved</span>
          </div>
          <div>
            <strong style={{ color: "var(--brick)" }}>{totals.rejected}</strong>
            <span>rejected</span>
          </div>
        </div>
        <div className="recap__cover-foot">
          {printFilter === "approved" ? "Approved only" : "All assets"} ·{" "}
          {new Date().toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </div>
      </section>

      <div className="recap__days">
        {days.map((day) => (
          <DaySection
            key={day.iso}
            day={day}
            onOpenFile={onOpenFile}
            onJumpToFolder={onJumpToFolder}
          />
        ))}
      </div>
    </div>
  );
}

function DaySection({
  day,
  onOpenFile,
  onJumpToFolder,
}: {
  day: Day;
  onOpenFile: (f: FileRow) => void;
  onJumpToFolder: (folder: string) => void;
}) {
  const approvedCount = day.files.filter((f) => f.decision === "approved").length;
  const rejectedCount = day.files.filter((f) => f.decision === "rejected").length;

  return (
    <section className="recap-day">
      <header className="recap-day__head">
        <h2 className="recap-day__title">
          <em>{day.displayTitle}</em>
        </h2>
        <div className="recap-day__stats">
          <span>
            {day.files.length} made
          </span>
          {approvedCount > 0 && (
            <span style={{ color: "var(--sage-2)" }}>· {approvedCount} approved</span>
          )}
          {rejectedCount > 0 && (
            <span style={{ color: "var(--brick)" }}>· {rejectedCount} rejected</span>
          )}
        </div>
      </header>

      <div className="recap-day__grid">
        {day.files.map((f) => (
          <div
            key={f.id}
            className="recap-day__item"
            data-decision={f.decision ?? "undecided"}
          >
            <Card
              file={f}
              onOpen={() => onOpenFile(f)}
              showLocation
              onJumpToFolder={onJumpToFolder}
            />
            {/* Print-only caption — picks up filename + folder + size + decision */}
            <div className="recap-day__print-caption print-only">
              <div className="recap-day__print-caption__name">{basename(f.path)}</div>
              <div className="recap-day__print-caption__meta">
                {prettyFolder(f.path)} · {formatSize(f.size)}
                {f.decision && (
                  <>
                    {" · "}
                    <span
                      style={{
                        color: f.decision === "approved" ? "var(--sage-2)" : "var(--brick)",
                      }}
                    >
                      {f.decision}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── grouping ─────────────────────────────────────────────────────

type Day = {
  iso: string; // YYYY-MM-DD anchor
  displayTitle: string; // "Tuesday — May 4" or "Today" / "Yesterday"
  files: FileRow[];
};

function groupByDay(files: FileRow[]): Day[] {
  const map = new Map<string, FileRow[]>();
  for (const f of files) {
    const date = new Date(f.mtime * 1000);
    const iso = isoDay(date);
    const arr = map.get(iso) ?? [];
    arr.push(f);
    map.set(iso, arr);
  }

  const today = isoDay(new Date());
  const yest = isoDay(new Date(Date.now() - 24 * 60 * 60 * 1000));

  const days: Day[] = [];
  // Sort ISO keys descending so newest day comes first
  const sortedKeys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : -1));
  for (const iso of sortedKeys) {
    const date = new Date(iso + "T12:00:00");
    let displayTitle: string;
    if (iso === today) displayTitle = "Today";
    else if (iso === yest) displayTitle = "Yesterday";
    else
      displayTitle = date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
    days.push({
      iso,
      displayTitle,
      files: map.get(iso)!.sort((a, b) => b.mtime - a.mtime),
    });
  }
  return days;
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyFolder(path: string): string {
  const folder = path.replace(/\/[^/]+$/, "").replace(/\/Users\/[^/]+/, "~");
  const parts = folder.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}
