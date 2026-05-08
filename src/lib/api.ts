import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { FileRow, ReviewDecision, ReviewRequest, RootInfo, TreeNode } from "../types";

export const api = {
  listTree: () => invoke<TreeNode[]>("list_tree"),
  listFiles: (dir: string) => invoke<FileRow[]>("list_files", { dir }),
  listRecent: (limit = 60) => invoke<FileRow[]>("list_recent", { limit }),
  searchAll: (query: string, limit = 120) =>
    invoke<FileRow[]>("search_all", { query, limit }),
  decide: (path: string, decision: string, note?: string) =>
    invoke<void>("decide", { path, decision, note: note ?? null }),
  clearDecision: (path: string) => invoke<void>("clear_decision", { path }),
  listDecided: (decision?: "approved" | "rejected", sinceSeconds?: number, limit = 500) =>
    invoke<FileRow[]>("list_decided", {
      decision: decision ?? null,
      sinceSeconds: sinceSeconds ?? null,
      limit,
    }),
  countDecisions: () => invoke<[number, number]>("count_decisions"),
  rescan: () => invoke<void>("rescan"),
  readTextFile: (path: string) => invoke<string>("read_text_file", { path }),
  listPendingReviews: () => invoke<ReviewRequest[]>("list_pending_reviews"),
  resolveReview: (decision: ReviewDecision) =>
    invoke<void>("resolve_review", { decision }),
  forceForeground: () => invoke<void>("force_foreground"),
  listRootInfo: () => invoke<RootInfo[]>("list_root_info"),
  addRoot: (glob: string, label?: string) =>
    invoke<number>("add_root", { glob, label: label ?? null }),
  removeRoot: (id: number) => invoke<void>("remove_root", { id }),
  listFilesUnder: (base: string) => invoke<FileRow[]>("list_files_under", { base }),
  copyFilesTo: (paths: string[], destDir: string) =>
    invoke<string[]>("copy_files_to", { paths, destDir }),
  toggleRoot: (id: number, enabled: boolean) =>
    invoke<void>("toggle_root", { id, enabled }),
  removeFile: (path: string) => invoke<void>("remove_file", { path }),
  trashFile: (path: string) => invoke<void>("trash_file", { path }),
  renameFile: (oldPath: string, newPath: string) => invoke<void>("rename_file", { oldPath, newPath }),
  startGitHubOAuth: () => invoke<void>("start_github_oauth"),
  getGitHubToken: () => invoke<string | null>("get_github_token"),
  clearGitHubToken: () => invoke<void>("clear_github_token"),
};

export function fileUrl(absolutePath: string): string {
  return convertFileSrc(absolutePath);
}

export function basename(p: string): string {
  const parts = p.split("/");
  return parts[parts.length - 1] ?? p;
}

export function dirname(p: string): string {
  const parts = p.split("/");
  parts.pop();
  return parts.join("/");
}

export function relativeTime(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
