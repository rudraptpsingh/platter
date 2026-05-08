import { invoke } from "@tauri-apps/api/core";

const INGEST_URL = "https://platter.pages.dev/api/ingest";
const STORAGE_KEY = "platter:telemetry";
const FLUSH_INTERVAL_MS = 30_000;
const APP_VERSION = "0.7.0";

type Consent = "pending" | "granted" | "denied";

type Settings = {
  device_id: string;
  consent: Consent;
};

type EventName =
  | "app_launched"
  | "review_started"
  | "review_resolved"
  | "feature_used"
  | "mcp_tool_invoked"
  | "update_checked"
  | "update_available"
  | "update_install_started"
  | "update_installed"
  | "update_install_failed"
  | "update_dismissed"
  | "update_changelog_opened"
  | "error";

type Event = {
  type: EventName;
  ts: number;
  payload?: Record<string, unknown>;
};

let queue: Event[] = [];
let settings: Settings | null = null;
let flushTimer: number | null = null;

function uuidv4(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // RFC4122 v4 fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Settings;
      if (parsed.device_id && parsed.consent) return parsed;
    }
  } catch {
    /* fall through */
  }
  const fresh: Settings = { device_id: uuidv4(), consent: "pending" };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

function persist(s: Settings) {
  settings = s;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function init(): Settings {
  if (!settings) settings = loadSettings();
  if (settings.consent === "granted" && flushTimer === null) {
    flushTimer = window.setInterval(flush, FLUSH_INTERVAL_MS);
  }
  return settings;
}

export function getConsent(): Consent {
  return init().consent;
}

export function setConsent(consent: Consent) {
  const s = init();
  persist({ ...s, consent });
  if (consent === "granted" && flushTimer === null) {
    flushTimer = window.setInterval(flush, FLUSH_INTERVAL_MS);
  } else if (consent !== "granted" && flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
    queue = [];
  }
  if (consent === "granted") {
    track("app_launched", { source: "consent_granted" });
    flush();
  }
}

export function track(type: EventName, payload?: Record<string, unknown>) {
  const s = init();
  if (s.consent !== "granted") return;
  queue.push({ type, ts: Math.floor(Date.now() / 1000), payload });
  // Flush opportunistically if the queue gets large
  if (queue.length >= 20) {
    flush();
  }
}

async function flush() {
  if (queue.length === 0 || !settings || settings.consent !== "granted") return;
  const batch = queue.splice(0, 50);

  try {
    const response = await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id: settings.device_id,
        app_version: APP_VERSION,
        events: batch,
      }),
      // Failures are silent — we don't want telemetry breakage to surface as user-visible errors
      keepalive: true,
    });
    if (!response.ok) {
      // Drop on server error rather than infinite retry
      console.debug("[telemetry] ingest returned", response.status);
    }
  } catch (e) {
    console.debug("[telemetry] flush failed:", e);
  }
}

export async function purgeRemoteData(): Promise<void> {
  // Reserved for future deletion-request endpoint. For now: clear local state.
  if (settings) {
    persist({ device_id: uuidv4(), consent: "denied" });
  }
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  queue = [];
}

// Tiny helper for the consent dialog: detect Tauri so we don't emit
// telemetry from the dev browser preview at localhost:1420.
export async function isTauri(): Promise<boolean> {
  try {
    await invoke("list_roots");
    return true;
  } catch {
    return false;
  }
}
