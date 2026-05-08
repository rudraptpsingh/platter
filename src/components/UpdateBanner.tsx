import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-opener";
import { checkForUpdate, downloadAndInstall, restartApp, type UpdateState } from "../lib/updater";
import * as telemetry from "../lib/telemetry";

import "../styles/update-banner.css";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Parse `latest.json` notes (markdown-ish) into a headline + up to 3 bullets. */
function parseNotes(raw: string | null): { headline: string; bullets: string[] } {
  if (!raw?.trim()) return { headline: "", bullets: [] };
  const parts = raw
    .split(/\s+-\s+/)
    .map((s) => s.trim().replace(/\*\*/g, "").replace(/`/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return { headline: "", bullets: [] };
  if (parts.length === 1) return { headline: parts[0].slice(0, 120), bullets: [] };
  return {
    headline: parts[0].slice(0, 120),
    bullets: parts.slice(1, 4).map((s) => s.slice(0, 90)),
  };
}

export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });
  const errorCountRef = useRef(0);
  const trackedAvailableRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function runCheck() {
      if (cancelled) return;
      setState((prev) =>
        prev.kind === "downloading" || prev.kind === "ready" ? prev : { kind: "checking" }
      );
      const next = await checkForUpdate();
      if (cancelled) return;

      if (next.kind === "error") {
        errorCountRef.current += 1;
        console.debug(`[updater] check failed (${errorCountRef.current}):`, next.message);
        setState((prev) => {
          if (prev.kind === "downloading" || prev.kind === "ready") return prev;
          return errorCountRef.current >= 3 ? next : { kind: "idle" };
        });
        return;
      }

      errorCountRef.current = 0;
      if (
        next.kind === "available" &&
        trackedAvailableRef.current !== next.version
      ) {
        trackedAvailableRef.current = next.version;
        telemetry.track("update_available", { version: next.version });
      }
      setState((prev) =>
        prev.kind === "downloading" || prev.kind === "ready" ? prev : next
      );
    }

    const firstCheck = setTimeout(runCheck, 30_000);
    const intervalId = window.setInterval(runCheck, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(firstCheck);
      clearInterval(intervalId);
    };
  }, []);

  async function install() {
    if (state.kind !== "available") return;
    const version = state.version;
    telemetry.track("update_install_started", { version });
    setState({ kind: "downloading", received: 0, total: null });
    try {
      await downloadAndInstall(state.update, (received, total) => {
        setState({ kind: "downloading", received, total });
      });
      telemetry.track("update_installed", { version });
      setState({ kind: "ready", version });
    } catch (e) {
      telemetry.track("update_install_failed", { version, error: String(e) });
      setState({ kind: "error", message: String(e) });
    }
  }

  function dismiss() {
    if (state.kind === "available") {
      telemetry.track("update_dismissed", { version: state.version });
    }
    setState({ kind: "idle" });
  }

  function openChangelog(version: string) {
    open(`https://github.com/rudraptpsingh/platter/releases/tag/v${version}`).catch(() => {});
    telemetry.track("update_changelog_opened", { version });
  }

  if (state.kind === "idle" || state.kind === "checking" || state.kind === "uptodate") {
    return null;
  }

  if (state.kind === "error") {
    return (
      <div className="update-banner update-banner--error">
        <span className="update-banner__dot" />
        <span className="update-banner__copy">
          <span className="update-banner__title">Update check failed</span>
          <span className="update-banner__sub">{state.message}</span>
        </span>
        <button className="update-banner__btn update-banner__btn--ghost" onClick={dismiss}>
          Dismiss
        </button>
      </div>
    );
  }

  if (state.kind === "downloading") {
    const pct = state.total ? Math.round((state.received / state.total) * 100) : null;
    const receivedMB = (state.received / 1024 / 1024).toFixed(1);
    const totalMB = state.total ? (state.total / 1024 / 1024).toFixed(1) : null;
    return (
      <div className="update-banner update-banner--progress">
        <span className="update-banner__dot update-banner__dot--spin" />
        <span className="update-banner__copy">
          <span className="update-banner__title">Downloading update…</span>
          <span className="update-banner__sub">
            {totalMB ? `${receivedMB} MB of ${totalMB} MB` : `${receivedMB} MB`}
          </span>
        </span>
        <div className="update-banner__progress">
          <div
            className="update-banner__progress-bar"
            style={{ width: pct !== null ? `${pct}%` : "100%", opacity: pct !== null ? 1 : 0.4 }}
          />
        </div>
      </div>
    );
  }

  if (state.kind === "ready") {
    return (
      <div className="update-banner update-banner--ready">
        <span className="update-banner__dot" />
        <span className="update-banner__copy">
          <span className="update-banner__title">platter {state.version} installed</span>
          <span className="update-banner__sub">Quit and reopen to finish</span>
        </span>
        <button className="update-banner__btn update-banner__btn--primary" onClick={restartApp}>
          Restart now
        </button>
        <button className="update-banner__btn update-banner__btn--ghost" onClick={dismiss}>
          Later
        </button>
      </div>
    );
  }

  // available
  const { headline, bullets } = parseNotes(state.notes);
  const version = state.version;

  return (
    <div className="update-banner update-banner--available">
      <span className="update-banner__dot" />
      <span className="update-banner__copy">
        <span className="update-banner__title">
          platter {version} is available
        </span>
        {headline && <span className="update-banner__headline">{headline}</span>}
        {bullets.length > 0 && (
          <ul className="update-banner__notes">
            {bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}
        <button
          className="update-banner__link"
          onClick={() => openChangelog(version)}
        >
          What's new →
        </button>
      </span>
      <div className="update-banner__actions">
        <button className="update-banner__btn update-banner__btn--primary" onClick={install}>
          Update now
        </button>
        <button className="update-banner__btn update-banner__btn--ghost" onClick={dismiss}>
          Later
        </button>
      </div>
    </div>
  );
}
