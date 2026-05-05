import { useEffect, useState } from "react";
import type { RootInfo } from "../types";
import { api } from "../lib/api";

import "../styles/settings.css";

type Props = {
  onClose: () => void;
  onChanged: () => void;
};

export function Settings({ onClose, onChanged }: Props) {
  const [section, setSection] = useState<"roots" | "claude" | "about">("roots");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="settings-shell">
      <aside className="settings-nav">
        <button className="settings-nav__close" onClick={onClose} title="Close (Esc)">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>

        <div className="settings-nav__section">settings</div>
        <button
          className={`settings-nav__row ${section === "roots" ? "settings-nav__row--active" : ""}`}
          onClick={() => setSection("roots")}
        >
          <FolderIcon /> Watch roots
        </button>
        <button
          className={`settings-nav__row ${section === "claude" ? "settings-nav__row--active" : ""}`}
          onClick={() => setSection("claude")}
        >
          <ClaudeIcon /> Claude integration
        </button>

        <div className="settings-nav__section" style={{ marginTop: 18 }}>about</div>
        <button
          className={`settings-nav__row ${section === "about" ? "settings-nav__row--active" : ""}`}
          onClick={() => setSection("about")}
        >
          <InfoIcon /> About platter
        </button>
      </aside>

      <main className="settings-pane">
        {section === "roots" && <WatchRoots onChanged={onChanged} />}
        {section === "claude" && <ClaudeSection />}
        {section === "about" && <AboutSection />}
      </main>
    </div>
  );
}

// ─── Watch roots ──────────────────────────────────────

function WatchRoots({ onChanged }: { onChanged: () => void }) {
  const [roots, setRoots] = useState<RootInfo[]>([]);
  const [newGlob, setNewGlob] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const refresh = () => api.listRootInfo().then(setRoots).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  async function addRoot() {
    if (!newGlob.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.addRoot(newGlob.trim());
      setNewGlob("");
      await refresh();
      api.rescan();
      onChanged();
    } catch (e) {
      setAddError(String(e));
    } finally {
      setAdding(false);
    }
  }

  async function toggle(id: number, enabled: boolean) {
    await api.toggleRoot(id, enabled);
    await refresh();
    api.rescan();
    onChanged();
  }

  async function remove(id: number) {
    await api.removeRoot(id);
    await refresh();
    onChanged();
  }

  const enabledCount = roots.filter((r) => r.enabled).length;
  const totalFiles = roots.reduce((acc, r) => acc + r.file_count, 0);

  return (
    <>
      <div className="settings-head">
        <div className="settings-eyebrow">★ folders to watch</div>
        <h1 className="settings-title">Where to look.</h1>
        <p className="settings-lede">
          Platter watches these folders for new mockups, screenshots, and documents. Each entry is a
          glob — it can match many actual folders. Toggle off the ones you don't need.
        </p>
      </div>

      <section className="settings-section">
        <div className="settings-section__head">
          <h2 className="settings-section__title">Active roots</h2>
          <span className="settings-section__count">
            {enabledCount} enabled · {roots.length - enabledCount} paused · {totalFiles} files indexed
          </span>
        </div>

        {roots.map((r) => (
          <div key={r.id} className={`root-row ${r.enabled ? "" : "root-row--off"}`}>
            <div className="root-row__path">
              <div className="root-row__glob">{r.glob}</div>
              <div className="root-row__sub">
                {r.is_default ? (
                  <span className="root-badge">default</span>
                ) : (
                  <span className="root-badge root-badge--gold">manual</span>
                )}
                <span>matches {r.resolved_count} folder{r.resolved_count === 1 ? "" : "s"}</span>
                <span className="root-row__sub-sep">·</span>
                <span>{r.label}</span>
              </div>
            </div>
            <div>
              <div className="root-row__count">{r.enabled ? r.file_count : "—"}</div>
              <div className="root-row__count-label">{r.enabled ? "files" : "paused"}</div>
            </div>
            <button
              className={`toggle ${r.enabled ? "" : "toggle--off"}`}
              onClick={() => toggle(r.id, !r.enabled)}
              title={r.enabled ? "Pause this root" : "Enable this root"}
            />
            {!r.is_default && (
              <button
                className="root-row__more"
                onClick={() => {
                  if (confirm(`Remove root "${r.glob}"?`)) remove(r.id);
                }}
                title="Remove this root"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        ))}

        <div className="add-root">
          <input
            className="add-root__input"
            type="text"
            value={newGlob}
            onChange={(e) => setNewGlob(e.target.value)}
            placeholder="~/Desktop/scratch-mockups   or   /Users/me/work/**/mockups"
            onKeyDown={(e) => {
              if (e.key === "Enter") addRoot();
            }}
            disabled={adding}
          />
          <button
            className="add-root__btn"
            onClick={addRoot}
            disabled={adding || !newGlob.trim()}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Add root
          </button>
        </div>
        {addError && (
          <div style={{ color: "var(--brick)", fontSize: 12, marginTop: 6 }}>{addError}</div>
        )}

        <div className="help-card">
          Globs use shell wildcards. <code>~/</code> expands to your home dir. <code>*</code> matches
          a single segment, <code>**</code> matches any depth. Examples:{" "}
          <code>~/github/*/mockups</code>, <code>~/Documents/work/**/screenshots</code>.
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__head">
          <h2 className="settings-section__title">Ignored by default</h2>
          <span className="settings-section__count">never indexed inside any folder</span>
        </div>
        <div className="help-card" style={{ borderLeft: "2px solid var(--ink-3)" }}>
          Build artifacts and dotfiles are skipped automatically: <code>node_modules</code>,{" "}
          <code>.next</code>, <code>dist</code>, <code>build</code>, <code>target</code>,{" "}
          <code>.venv</code>, <code>.git</code>, <code>.cache</code>. Surfaced kinds:{" "}
          <code>html · png · jpg · svg · pdf · gif · webp</code>. Markdown becomes a "plan" when it sits
          beside visual files.
        </div>
      </section>
    </>
  );
}

// ─── Claude integration (read-only for now) ──────────

function ClaudeSection() {
  const cmd = `claude mcp add platter -- /Applications/platter.app/Contents/MacOS/platter --mcp-stdio`;
  const devCmd = `claude mcp add platter -- ${getDevBinaryPath()} --mcp-stdio`;
  const [copied, setCopied] = useState<"" | "release" | "dev">("");

  function copy(text: string, which: "release" | "dev") {
    navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <>
      <div className="settings-head">
        <div className="settings-eyebrow">★ mcp · claude integration</div>
        <h1 className="settings-title">Wire claude up.</h1>
        <p className="settings-lede">
          Once registered, Claude can call <code style={codeStyle}>present_mockups()</code> from any
          session and the call will block until you decide.
        </p>
      </div>

      <section className="settings-section">
        <div className="settings-section__head">
          <h2 className="settings-section__title">Register the MCP server</h2>
          <span className="settings-section__count">run once · stdio transport</span>
        </div>

        <div style={cmdBlock}>
          <div style={cmdHeader}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(244,239,229,0.5)" }}>
              terminal · zsh
            </span>
            <button
              style={copyBtn}
              onClick={() => copy(devCmd, "dev")}
            >
              {copied === "dev" ? "copied!" : "copy"}
            </button>
          </div>
          <div style={cmdLine}>
            <span style={{ color: "var(--vermilion)" }}>$</span> {devCmd}
          </div>
          <div style={{ ...cmdSub, marginTop: 8 }}>
            ↑ Use the dev path while iterating. After we ship the notarized release, swap to:
          </div>
          <div style={{ ...cmdLine, marginTop: 6, opacity: 0.5 }}>
            <span style={{ color: "var(--vermilion)" }}>$</span> {cmd}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__head">
          <h2 className="settings-section__title">Status</h2>
          <span className="settings-section__count">stdio transport</span>
        </div>
        <div className="help-card">
          The MCP server listens on a Unix domain socket at{" "}
          <code>~/Library/Application Support/platter/mcp.sock</code>. When Claude spawns the stdio
          child, it proxies to this socket. Restart platter to reset the socket.
        </div>
      </section>
    </>
  );
}

// ─── About ────────────────────────────────────────────

function AboutSection() {
  return (
    <>
      <div className="settings-head">
        <div className="settings-eyebrow">★ about</div>
        <h1 className="settings-title">platter</h1>
        <p className="settings-lede">
          A Mac desktop app for reviewing assets generated by Claude Code agents. Watches the folders
          where mockups land. Exposes an MCP server so Claude can pause for your decision.
        </p>
      </div>

      <section className="settings-section">
        <div className="help-card">
          v0.1 · authored by{" "}
          <a
            href="https://github.com/rudraptpsingh"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--vermilion)" }}
          >
            rudraptpsingh
          </a>
          . Repo at{" "}
          <a
            href="https://github.com/rudraptpsingh/platter"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--vermilion)" }}
          >
            github.com/rudraptpsingh/platter
          </a>
          .
        </div>
      </section>
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────

function getDevBinaryPath(): string {
  return `${homePath()}/github/platter/src-tauri/target/debug/platter`;
}
function homePath(): string {
  // Rough best-effort — for display only
  return "/Users/" + (window.navigator.userAgent.includes("Mac") ? "$USER" : "$USER");
}

const codeStyle = {
  fontFamily: "var(--font-mono)",
  background: "rgba(27,23,20,0.06)",
  padding: "1px 6px",
  borderRadius: 3,
};

const cmdBlock: React.CSSProperties = {
  background: "var(--ink)",
  borderRadius: 14,
  padding: 18,
  color: "var(--void-ink)",
  fontFamily: "var(--font-mono)",
  position: "relative",
};
const cmdHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 12,
  paddingBottom: 10,
  borderBottom: "0.5px solid rgba(244,239,229,0.10)",
};
const cmdLine: React.CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.6,
  color: "rgba(244,239,229,0.95)",
  wordBreak: "break-all",
};
const cmdSub: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(244,239,229,0.6)",
  fontFamily: "var(--font-body)",
  fontStyle: "italic",
};
const copyBtn: React.CSSProperties = {
  marginLeft: "auto",
  background: "rgba(244,239,229,0.10)",
  color: "var(--void-ink)",
  border: "0.5px solid rgba(244,239,229,0.18)",
  borderRadius: 5,
  padding: "4px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  cursor: "pointer",
};

// ─── Icons ────────────────────────────────────────────

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M2 4h10v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4zM2 4l1.5-1.5h2L7 4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ClaudeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="4" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="10" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 7h2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 6v4M7 4v0.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
