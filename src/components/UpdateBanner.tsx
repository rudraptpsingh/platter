import { useEffect, useState } from "react";
import { checkForUpdate, downloadAndInstall, restartApp, type UpdateState } from "../lib/updater";

import "../styles/update-banner.css";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    async function runCheck() {
      if (cancelled) return;
      setState((prev) => (prev.kind === "downloading" || prev.kind === "ready" ? prev : { kind: "checking" }));
      const next = await checkForUpdate();
      if (cancelled) return;
      // Don't downgrade from "ready" or "downloading" if a check accidentally fires
      setState((prev) => (prev.kind === "downloading" || prev.kind === "ready" ? prev : next));
    }

    // First check after 30s of launch (so it doesn't pile on startup work)
    const firstCheck = setTimeout(runCheck, 30_000);

    // Subsequent checks every 6h
    intervalId = window.setInterval(runCheck, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(firstCheck);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  async function install() {
    if (state.kind !== "available") return;
    setState({ kind: "downloading", received: 0, total: null });
    try {
      await downloadAndInstall(state.update, (received, total) => {
        setState({ kind: "downloading", received, total });
      });
      setState({ kind: "ready", version: state.version });
    } catch (e) {
      setState({ kind: "error", message: String(e) });
    }
  }

  async function dismiss() {
    setState({ kind: "idle" });
  }

  // Don't render anything when there's no actionable state
  if (state.kind === "idle" || state.kind === "checking" || state.kind === "uptodate") {
    return null;
  }

  if (state.kind === "error") {
    return (
      <div className="update-banner update-banner--error">
        <span className="update-banner__icon">!</span>
        <span className="update-banner__copy">
          <span className="update-banner__title">Update check failed</span>
          <span className="update-banner__sub">{state.message}</span>
        </span>
        <button className="update-banner__btn update-banner__btn--ghost" onClick={dismiss}>Dismiss</button>
      </div>
    );
  }

  if (state.kind === "downloading") {
    const pct = state.total ? Math.round((state.received / state.total) * 100) : null;
    return (
      <div className="update-banner update-banner--progress">
        <span className="update-banner__icon update-banner__icon--spin">↻</span>
        <span className="update-banner__copy">
          <span className="update-banner__title">Downloading update…</span>
          <span className="update-banner__sub">
            {pct !== null ? `${pct}%` : `${(state.received / 1024 / 1024).toFixed(1)} MB`}
          </span>
        </span>
        {state.total !== null && (
          <div className="update-banner__progress">
            <div className="update-banner__progress-bar" style={{ width: `${pct ?? 0}%` }} />
          </div>
        )}
      </div>
    );
  }

  if (state.kind === "ready") {
    return (
      <div className="update-banner update-banner--ready">
        <span className="update-banner__icon">✓</span>
        <span className="update-banner__copy">
          <span className="update-banner__title">v{state.version} ready</span>
          <span className="update-banner__sub">Restart to finish installing</span>
        </span>
        <button className="update-banner__btn update-banner__btn--primary" onClick={restartApp}>
          Restart
        </button>
        <button className="update-banner__btn update-banner__btn--ghost" onClick={dismiss}>Later</button>
      </div>
    );
  }

  // available
  return (
    <div className="update-banner update-banner--available">
      <span className="update-banner__icon">↑</span>
      <span className="update-banner__copy">
        <span className="update-banner__title">v{state.version} available</span>
        <span className="update-banner__sub">
          {state.notes && state.notes.length > 0
            ? state.notes.split("\n")[0].slice(0, 80)
            : "A newer platter is ready to install."}
        </span>
      </span>
      <button className="update-banner__btn update-banner__btn--primary" onClick={install}>
        Install
      </button>
      <button className="update-banner__btn update-banner__btn--ghost" onClick={dismiss}>Later</button>
    </div>
  );
}
