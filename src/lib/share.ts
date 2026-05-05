import { invoke } from "@tauri-apps/api/core";
import { api } from "./api";

const BASE = "https://platter.pages.dev";
const LOCAL_MAP_KEY = "platter:shares:map";       // { [share_id]: { path, created_at } }
const LOCAL_SEEN_KEY = "platter:shares:lastSeen"; // { [share_id]: last_decided_at_unix }

export type ShareKind =
  | "html"
  | "htm"
  | "png"
  | "jpg"
  | "jpeg"
  | "gif"
  | "svg"
  | "webp"
  | "pdf"
  | "md";

export type ShareDecision = {
  id: string;
  share_id: string;
  decision: "approved" | "rejected" | "iterated";
  note: string | null;
  reviewer_name: string | null;
  decided_at: number;
};

export type ShareLink = {
  id: string;
  filename: string;
  kind: ShareKind;
  prompt: string | null;
  size_bytes: number;
  expires_at: number | null;
  created_at: number;
  view_count: number;
  last_viewed_at: number | null;
  revoked_at: number | null;
  decisions: ShareDecision[];
};

export type CreateShareResult = {
  id: string;
  url: string;
  expires_at: number | null;
  created_at: number;
};

const SHARE_KIND_BY_EXT = new Set<ShareKind>([
  "html", "htm", "png", "jpg", "jpeg", "gif", "svg", "webp", "pdf", "md",
]);

export function shareKindFor(path: string): ShareKind | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return SHARE_KIND_BY_EXT.has(ext as ShareKind) ? (ext as ShareKind) : null;
}

/**
 * Read the file via the Rust read_file_bytes command, base64 it, POST to
 * /api/share/create, return the result.
 */
export async function createShare(opts: {
  path: string;
  prompt?: string;
  expires_seconds?: number;
}): Promise<CreateShareResult> {
  const filename = opts.path.split("/").pop() ?? "asset";
  const kind = shareKindFor(opts.path);
  if (!kind) {
    throw new Error(`Unsupported file kind for sharing: .${opts.path.split(".").pop()}`);
  }

  const bytes = await invoke<number[]>("read_file_bytes", { path: opts.path });
  const u8 = Uint8Array.from(bytes);
  const content_b64 = uint8ToBase64(u8);

  const deviceId = readDeviceId();

  const r = await fetch(`${BASE}/api/share/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_id: deviceId,
      filename,
      kind,
      content_b64,
      prompt: opts.prompt?.trim() || undefined,
      expires_seconds: opts.expires_seconds,
    }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(`Share failed (${r.status}): ${j.error ?? r.statusText}`);
  }
  return (await r.json()) as CreateShareResult;
}

export async function listShares(): Promise<ShareLink[]> {
  const deviceId = readDeviceId();
  const r = await fetch(`${BASE}/api/share/list?device_id=${encodeURIComponent(deviceId)}`);
  if (!r.ok) throw new Error(`List failed (${r.status})`);
  const j = (await r.json()) as { links: ShareLink[] };
  return j.links;
}

// ─── Local share_id → path mapping ───────────────────────────────

type LocalMap = Record<string, { path: string; created_at: number }>;

function readLocalMap(): LocalMap {
  try {
    const raw = localStorage.getItem(LOCAL_MAP_KEY);
    return raw ? (JSON.parse(raw) as LocalMap) : {};
  } catch {
    return {};
  }
}
function writeLocalMap(m: LocalMap) {
  localStorage.setItem(LOCAL_MAP_KEY, JSON.stringify(m));
}

/** Remember which local file a share_id originated from. Called after createShare. */
export function rememberShare(share_id: string, path: string) {
  const m = readLocalMap();
  m[share_id] = { path, created_at: Math.floor(Date.now() / 1000) };
  writeLocalMap(m);
}

export function lookupSharePath(share_id: string): string | null {
  return readLocalMap()[share_id]?.path ?? null;
}

// ─── Carry-over: remote decisions → local file decisions ─────────

type SeenMap = Record<string, number>; // share_id → max decided_at unix

function readSeen(): SeenMap {
  try {
    const raw = localStorage.getItem(LOCAL_SEEN_KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}
function writeSeen(s: SeenMap) {
  localStorage.setItem(LOCAL_SEEN_KEY, JSON.stringify(s));
}

export type AppliedDecision = {
  share_id: string;
  path: string;
  decision: "approved" | "rejected" | "iterated";
  reviewer_name: string | null;
  note: string | null;
  decided_at: number;
};

/**
 * Pull the latest decisions from the share-list endpoint and apply any that
 * are newer than what we've seen. Approve/reject sync to the local file via
 * api.decide(); iteration is left untouched (it's a request for changes,
 * not a verdict) — surfaced via toast only.
 *
 * Returns the list of applied + iterated decisions for the caller to toast.
 */
export async function applyRemoteDecisions(): Promise<AppliedDecision[]> {
  let links: ShareLink[];
  try {
    links = await listShares();
  } catch {
    return []; // network blip; try again next tick
  }

  const seen = readSeen();
  const map = readLocalMap();
  const applied: AppliedDecision[] = [];

  for (const link of links) {
    if (link.decisions.length === 0) continue;
    const last = seen[link.id] ?? 0;
    const fresh = link.decisions.filter((d) => d.decided_at > last);
    if (fresh.length === 0) continue;

    const localPath = map[link.id]?.path;
    // Order chronologically so the latest wins on the local row
    fresh.sort((a, b) => a.decided_at - b.decided_at);

    for (const d of fresh) {
      // Build a note that preserves reviewer attribution
      const note =
        d.reviewer_name && d.note
          ? `${d.reviewer_name}: ${d.note}`
          : d.note ?? (d.reviewer_name ? `${d.reviewer_name} via share link` : null);

      if (localPath && (d.decision === "approved" || d.decision === "rejected")) {
        try {
          await api.decide(localPath, d.decision, note ?? undefined);
        } catch {
          // local file might be gone; we'll try again next tick or eventually skip
        }
      }
      applied.push({
        share_id: link.id,
        path: localPath ?? link.filename,
        decision: d.decision,
        reviewer_name: d.reviewer_name,
        note,
        decided_at: d.decided_at,
      });
    }

    // Bump the seen-watermark to the most recent decision we just processed
    const newest = fresh[fresh.length - 1].decided_at;
    seen[link.id] = newest;
  }

  writeSeen(seen);
  return applied;
}

// ─── helpers ──────────────────────────────────────────────────────

function uint8ToBase64(u8: Uint8Array): string {
  // Process in chunks to avoid call-stack issues on large files
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + CHUNK)));
  }
  return btoa(s);
}

/**
 * Pull the same device_id we use for telemetry so the share-list view is
 * keyed identically. If telemetry has never been initialized we still want
 * a stable id — generate + persist one transparently.
 */
function readDeviceId(): string {
  const raw = localStorage.getItem("platter:telemetry");
  if (raw) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj.device_id === "string") return obj.device_id;
    } catch {
      /* fall through */
    }
  }
  // Fallback — generate + persist (without forcing telemetry consent)
  const id = crypto.randomUUID();
  localStorage.setItem("platter:share-device", id);
  const existing = localStorage.getItem("platter:share-device");
  return existing ?? id;
}
