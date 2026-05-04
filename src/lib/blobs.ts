import { invoke } from "@tauri-apps/api/core";

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  pdf: "application/pdf",
  html: "text/html;charset=utf-8",
  htm: "text/html;charset=utf-8",
  md: "text/markdown;charset=utf-8",
};

function extOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

export async function getBlobUrl(path: string): Promise<string> {
  const cached = cache.get(path);
  if (cached) return cached;
  const pending = inflight.get(path);
  if (pending) return pending;

  const promise = (async () => {
    const bytes = await invoke<number[]>("read_file_bytes", { path });
    const buf = new Uint8Array(bytes);
    const mime = MIME[extOf(path)] ?? "application/octet-stream";
    const blob = new Blob([buf], { type: mime });
    const url = URL.createObjectURL(blob);
    cache.set(path, url);
    inflight.delete(path);
    return url;
  })();

  inflight.set(path, promise);
  return promise;
}

export function revokeBlobUrl(path: string) {
  const url = cache.get(path);
  if (url) {
    URL.revokeObjectURL(url);
    cache.delete(path);
  }
}
