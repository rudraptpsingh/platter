import type { FileRow } from "../types";
import { api } from "./api";

export type Window = "today" | "week" | "month" | "all";

const WINDOW_SECONDS: Record<Window, number | null> = {
  today: 24 * 60 * 60,
  week: 7 * 24 * 60 * 60,
  month: 30 * 24 * 60 * 60,
  all: null,
};

const WINDOW_LABEL: Record<Window, string> = {
  today: "today",
  week: "this week",
  month: "this month",
  all: "all-time",
};

/**
 * Render a list of decisions as paste-ready markdown for Linear / Notion / a
 * PR description. Grouped by parent folder, chronological within each group.
 */
export function decisionsToMarkdown(rows: FileRow[], windowKey: Window): string {
  if (rows.length === 0) {
    return `# Decisions · ${WINDOW_LABEL[windowKey]}\n\n_no decisions yet_\n`;
  }

  // Group by parent folder
  const groups = new Map<string, FileRow[]>();
  for (const r of rows) {
    const folder = parentFolder(r.path);
    const arr = groups.get(folder) ?? [];
    arr.push(r);
    groups.set(folder, arr);
  }

  const parts: string[] = [];
  parts.push(`# Decisions · ${WINDOW_LABEL[windowKey]}`);
  parts.push("");

  const approved = rows.filter((r) => r.decision === "approved").length;
  const rejected = rows.filter((r) => r.decision === "rejected").length;
  parts.push(`> ${rows.length} total · **${approved} approved** · ${rejected} rejected`);
  parts.push("");

  for (const [folder, items] of groups) {
    parts.push(`## ${friendlyFolder(folder)}`);
    parts.push("");
    for (const r of items) {
      const verdict = r.decision === "approved" ? "✓" : "✕";
      const when = r.decided_at ? formatDate(r.decided_at) : "—";
      const file = filename(r.path);
      const note = r.decision_note ? `  \n  > _${escapeMd(r.decision_note)}_` : "";
      parts.push(`- ${verdict} **${escapeMd(file)}** · ${when}${note}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

export async function copyDecisionsMarkdown(windowKey: Window): Promise<{ count: number; window: Window }> {
  const since = WINDOW_SECONDS[windowKey] ?? undefined;
  const rows = await api.listDecided(undefined, since, 1000);
  const md = decisionsToMarkdown(rows, windowKey);
  await navigator.clipboard.writeText(md);
  return { count: rows.length, window: windowKey };
}

// ─── helpers ──────────────────────────────────────────────────────

function parentFolder(p: string): string {
  const i = p.lastIndexOf("/");
  return i > 0 ? p.slice(0, i) : p;
}

function filename(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}

function friendlyFolder(p: string): string {
  // /Users/me/github/Penova/mockups/mac → ~/github/Penova/mockups/mac
  const trimmed = p.replace(/\/Users\/[^/]+/, "~");
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length <= 4) return trimmed;
  return parts.slice(-4).join("/");
}

function formatDate(unix: number): string {
  const d = new Date(unix * 1000);
  const sec = (Date.now() / 1000) - unix;
  if (sec < 60 * 60) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 24 * 60 * 60) return `${Math.floor(sec / 3600)} hr ago`;
  if (sec < 7 * 24 * 60 * 60) return `${Math.floor(sec / 86400)} d ago`;
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function escapeMd(s: string): string {
  return s.replace(/([\\`*_{}\[\]()#+\-.!|])/g, "\\$1");
}
