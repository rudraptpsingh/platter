import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { FileRow, TreeNode } from "../types";

export const api = {
  listTree: () => invoke<TreeNode[]>("list_tree"),
  listFiles: (dir: string) => invoke<FileRow[]>("list_files", { dir }),
  listRecent: (limit = 60) => invoke<FileRow[]>("list_recent", { limit }),
  searchAll: (query: string, limit = 120) =>
    invoke<FileRow[]>("search_all", { query, limit }),
  decide: (path: string, decision: string, note?: string) =>
    invoke<void>("decide", { path, decision, note: note ?? null }),
  rescan: () => invoke<void>("rescan"),
  readTextFile: (path: string) => invoke<string>("read_text_file", { path }),
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
