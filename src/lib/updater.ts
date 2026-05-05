import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; update: Update; version: string; notes: string | null }
  | { kind: "downloading"; received: number; total: number | null }
  | { kind: "ready"; version: string }
  | { kind: "error"; message: string }
  | { kind: "uptodate" };

export async function checkForUpdate(): Promise<UpdateState> {
  try {
    const update = await check();
    if (!update) return { kind: "uptodate" };
    return {
      kind: "available",
      update,
      version: update.version,
      notes: update.body ?? null,
    };
  } catch (e) {
    return { kind: "error", message: String(e) };
  }
}

export async function downloadAndInstall(
  update: Update,
  onProgress?: (received: number, total: number | null) => void,
): Promise<void> {
  let received = 0;
  let total: number | null = null;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? null;
      onProgress?.(0, total);
    } else if (event.event === "Progress") {
      received += event.data.chunkLength;
      onProgress?.(received, total);
    }
  });
}

export async function restartApp(): Promise<void> {
  await relaunch();
}
