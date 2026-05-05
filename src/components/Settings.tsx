import { useEffect, useRef, useState } from "react";
import type { RootInfo } from "../types";
import type { GitHubUser } from "../lib/github";
import { api } from "../lib/api";
import * as telemetry from "../lib/telemetry";
import { Popover, PopoverMenu } from "./Popover";

import "../styles/settings.css";

type Props = {
  onClose: () => void;
  onChanged: () => void;
  githubUser?: GitHubUser | null;
  onGitHubSignIn?: () => void;
  onGitHubSignOut?: () => void;
};

export function Settings({ onClose, onChanged, githubUser, onGitHubSignIn, onGitHubSignOut }: Props) {
  const [section, setSection] = useState<
    "account" | "roots" | "claude" | "privacy" | "about"
  >("account");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    telemetry.track("feature_used", { feature: "settings_opened" });
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="settings-shell">
      <aside className="settings-nav">
        <div className="settings-nav__drag" />
        <button className="settings-nav__close" onClick={onClose} title="Close (Esc)">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>

        <div className="settings-nav__section">account</div>
        <button
          className={`settings-nav__row ${section === "account" ? "settings-nav__row--active" : ""}`}
          onClick={() => setSection("account")}
        >
          <GitHubNavIcon />
          <span style={{ flex: 1 }}>GitHub</span>
          {!githubUser && (
            <span className="settings-nav__badge">Sign in</span>
          )}
          {githubUser && (
            <img src={githubUser.avatar_url} alt="" style={{ width: 16, height: 16, borderRadius: "50%" }} />
          )}
        </button>

        <div className="settings-nav__section" style={{ marginTop: 14 }}>settings</div>
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
        <button
          className={`settings-nav__row ${section === "privacy" ? "settings-nav__row--active" : ""}`}
          onClick={() => setSection("privacy")}
        >
          <PrivacyIcon /> Privacy
        </button>

        <div className="settings-nav__section" style={{ marginTop: 14 }}>about</div>
        <button
          className={`settings-nav__row ${section === "about" ? "settings-nav__row--active" : ""}`}
          onClick={() => setSection("about")}
        >
          <InfoIcon /> About platter
        </button>
      </aside>

      <main className="settings-pane">
        <div className="settings-pane__drag" />
        {section === "account" && (
          <AccountSection
            githubUser={githubUser ?? null}
            onSignIn={onGitHubSignIn ?? (() => {})}
            onSignOut={onGitHubSignOut ?? (() => {})}
          />
        )}
        {section === "roots" && <WatchRoots onChanged={onChanged} />}
        {section === "claude" && <ClaudeSection />}
        {section === "privacy" && <PrivacySection />}
        {section === "about" && <AboutSection />}
      </main>
    </div>
  );
}

// ─── Account (GitHub) ─────────────────────────────────

function AccountSection({
  githubUser,
  onSignIn,
  onSignOut,
}: {
  githubUser: GitHubUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  return (
    <>
      <div className="settings-head">
        <div className="settings-eyebrow">★ account</div>
        <h1 className="settings-title">GitHub</h1>
        <p className="settings-lede">
          Sign in to attach your identity to shared review links and see who approved or rejected what.
        </p>
      </div>

      <section className="settings-section">
        {githubUser ? (
          <div className="account-card account-card--signed-in">
            <img src={githubUser.avatar_url} alt={githubUser.login} className="account-avatar" />
            <div className="account-info">
              <div className="account-name">{githubUser.name ?? githubUser.login}</div>
              <div className="account-login">@{githubUser.login} · github.com</div>
            </div>
            <button
              className="add-root__btn"
              style={{ background: "var(--brick)", marginLeft: "auto", flexShrink: 0 }}
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="account-card account-card--empty">
            <div className="account-github-icon">
              <svg width="28" height="28" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 .2C3.6.2 0 3.8 0 8.2c0 3.5 2.3 6.5 5.5 7.5.4.1.5-.2.5-.4v-1.4c-2.2.5-2.7-1.1-2.7-1.1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.4.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8.6-.2 1.3-.3 2-.3s1.4.1 2 .3c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.5.8 1.2.8 2.1 0 3-1.8 3.7-3.6 3.9.3.2.5.7.5 1.4v2.1c0 .2.1.5.6.4 3.2-1 5.5-4 5.5-7.5C16 3.8 12.4.2 8 .2z"/>
              </svg>
            </div>
            <div className="account-info">
              <div className="account-name">Not signed in</div>
              <div className="account-login">Sign in to identify yourself on shared review links</div>
            </div>
            <button
              className="add-root__btn"
              style={{ marginLeft: "auto", flexShrink: 0 }}
              onClick={onSignIn}
            >
              Sign in with GitHub
            </button>
          </div>
        )}
      </section>

      <section className="settings-section">
        <div className="settings-section__head">
          <h2 className="settings-section__title">Why sign in?</h2>
        </div>
        <div className="help-card">
          When you share a review link, the recipient sees your GitHub username and avatar next to their
          decision. Without sign-in, decisions show as "anonymous reviewer". Your token is stored locally
          and never leaves your machine.
        </div>
      </section>
    </>
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
          <RootRow
            key={r.id}
            root={r}
            onToggle={() => toggle(r.id, !r.enabled)}
            onRemove={() => remove(r.id)}
          />
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

// ─── Claude integration ───────────────────────────────

function ClaudeSection() {
  const releaseCmd = `claude mcp add platter -- /Applications/platter.app/Contents/MacOS/platter --mcp-stdio`;
  const devCmd = `claude mcp add platter -- ${getDevBinaryPath()} --mcp-stdio`;
  const testCmd = `claude -p "call present_mockups for the file ~/Desktop/test.png"`;
  const [copied, setCopied] = useState<"" | "release" | "dev" | "test">("");

  function copy(text: string, which: "release" | "dev" | "test") {
    navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <>
      <div className="settings-head">
        <div className="settings-eyebrow">★ mcp · claude integration</div>
        <h1 className="settings-title">Wire Claude up.</h1>
        <p className="settings-lede">
          Register platter as an MCP server once, then any Claude Code session can call{" "}
          <code style={codeStyle}>present_mockups()</code> — the call blocks until you decide.
        </p>
      </div>

      {/* Setup steps */}
      <section className="settings-section">
        <div className="settings-section__head">
          <h2 className="settings-section__title">Setup guide</h2>
          <span className="settings-section__count">3 steps · done once</span>
        </div>

        <div className="setup-guide">
          <div className="setup-guide__step">
            <div className="setup-guide__num">1</div>
            <div className="setup-guide__body">
              <div className="setup-guide__title">Register the MCP server</div>
              <div className="setup-guide__desc">
                Run this in your terminal. Uses the installed release binary.
              </div>
              <div style={cmdBlock}>
                <div style={cmdHeader}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(244,239,229,0.5)" }}>
                    terminal · release
                  </span>
                  <button style={copyBtn} onClick={() => copy(releaseCmd, "release")}>
                    {copied === "release" ? "copied!" : "copy"}
                  </button>
                </div>
                <div style={cmdLine}>
                  <span style={{ color: "var(--vermilion)", flexShrink: 0 }}>$</span> {releaseCmd}
                </div>
              </div>
              <div style={{ ...cmdBlock, marginTop: 8, opacity: 0.65 }}>
                <div style={cmdHeader}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(244,239,229,0.5)" }}>
                    terminal · dev build
                  </span>
                  <button style={copyBtn} onClick={() => copy(devCmd, "dev")}>
                    {copied === "dev" ? "copied!" : "copy"}
                  </button>
                </div>
                <div style={cmdLine}>
                  <span style={{ color: "var(--vermilion)", flexShrink: 0 }}>$</span> {devCmd}
                </div>
              </div>
            </div>
          </div>

          <div className="setup-guide__step">
            <div className="setup-guide__num">2</div>
            <div className="setup-guide__body">
              <div className="setup-guide__title">Add a watch folder</div>
              <div className="setup-guide__desc">
                Go to <strong>Watch roots</strong> and confirm at least one folder is enabled. The default{" "}
                <code style={codeStyle}>~/github/*/mockups</code> is active automatically. Drop any file
                there and it appears in the gallery within seconds.
              </div>
            </div>
          </div>

          <div className="setup-guide__step">
            <div className="setup-guide__num">3</div>
            <div className="setup-guide__body">
              <div className="setup-guide__title">Test the integration</div>
              <div className="setup-guide__desc">
                Start a Claude Code session and ask it to call{" "}
                <code style={codeStyle}>present_mockups()</code> with any file. Platter will jump to the
                front and ask you to decide.
              </div>
              <div style={{ ...cmdBlock, marginTop: 10 }}>
                <div style={cmdHeader}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(244,239,229,0.5)" }}>
                    quick test
                  </span>
                  <button style={copyBtn} onClick={() => copy(testCmd, "test")}>
                    {copied === "test" ? "copied!" : "copy"}
                  </button>
                </div>
                <div style={cmdLine}>
                  <span style={{ color: "var(--vermilion)", flexShrink: 0 }}>$</span> {testCmd}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Available tools */}
      <section className="settings-section">
        <div className="settings-section__head">
          <h2 className="settings-section__title">Available tools</h2>
          <span className="settings-section__count">5 tools · stdio transport</span>
        </div>

        <div className="mcp-tools">
          {[
            {
              name: "present_mockups",
              badge: "blocking",
              badgeColor: "var(--vermilion)",
              desc: "Show files and block until the user approves, rejects, ranks, or picks one. The core tool.",
            },
            {
              name: "request_iteration",
              badge: "blocking",
              badgeColor: "var(--vermilion)",
              desc: "Ask for a revision with an optional note. Blocks until the user responds.",
            },
            {
              name: "record_decision",
              badge: "fire & forget",
              badgeColor: "var(--sage)",
              desc: "Record a verdict without asking — use when the answer is obvious.",
            },
            {
              name: "get_decision_history",
              badge: "read",
              badgeColor: "var(--ink-3)",
              desc: "Look up past decisions by path or time range. Useful for context before generating the next version.",
            },
            {
              name: "list_recent",
              badge: "read",
              badgeColor: "var(--ink-3)",
              desc: "List recently indexed files. Ask this before generating more to avoid duplication.",
            },
          ].map((t) => (
            <div key={t.name} className="mcp-tool-row">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <code style={{ ...codeStyle, fontSize: 12 }}>{t.name}</code>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--paper)",
                  background: t.badgeColor,
                  padding: "1px 6px",
                  borderRadius: 100,
                  fontWeight: 600,
                }}>
                  {t.badge}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{t.desc}</div>
            </div>
          ))}
        </div>

        <div className="help-card" style={{ marginTop: 16 }}>
          The MCP server communicates over stdio. It auto-starts when Claude spawns the binary and shuts
          down cleanly when the session ends. Socket path:{" "}
          <code>~/Library/Application Support/platter/mcp.sock</code>.
        </div>
      </section>

      {/* Use cases */}
      <section className="settings-section">
        <div className="settings-section__head">
          <h2 className="settings-section__title">Usage patterns</h2>
          <span className="settings-section__count">prompt ideas for Claude</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { label: "Approve/reject mockups", prompt: `"Generate 3 UI variants for the login screen. Use present_mockups() so I can pick the best one."` },
            { label: "Compare before/after", prompt: `"Take a screenshot before and after the CSS change. Call present_mockups() in compare mode."` },
            { label: "Revision loop", prompt: `"Make a mockup. If I call request_iteration, read my note and try again until I approve."` },
            { label: "Batch asset approval", prompt: `"Generate icons for all 8 app sections. Bundle them in a present_mockups() call."` },
          ].map((uc) => (
            <div key={uc.label} className="root-row" style={{ padding: "12px 16px", gap: 12, flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ fontWeight: 500, fontSize: 12.5, color: "var(--ink)" }}>{uc.label}</div>
              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
                color: "var(--ink-2)",
                background: "rgba(27,23,20,0.04)",
                padding: "8px 10px",
                borderRadius: 6,
                lineHeight: 1.5,
              }}>{uc.prompt}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ─── A single watch-root row, with a kebab menu ─────────

function RootRow({
  root,
  onToggle,
  onRemove,
}: {
  root: RootInfo;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const kebabRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  function copyGlob() {
    navigator.clipboard.writeText(root.glob).catch(() => {});
    setMenuOpen(false);
  }

  return (
    <div className={`root-row ${root.enabled ? "" : "root-row--off"}`} title={root.glob}>
      <div className="root-row__path">
        <div className="root-row__glob">{root.glob}</div>
        <div className="root-row__sub">
          {root.is_default ? (
            <span className="root-badge">default</span>
          ) : (
            <span className="root-badge root-badge--gold">manual</span>
          )}
          <span>matches {root.resolved_count} folder{root.resolved_count === 1 ? "" : "s"}</span>
          <span className="root-row__sub-sep">·</span>
          <span>{root.label}</span>
        </div>
      </div>
      <div>
        <div className="root-row__count">{root.enabled ? root.file_count : "—"}</div>
        <div className="root-row__count-label">{root.enabled ? "files" : "paused"}</div>
      </div>
      <button
        className={`toggle ${root.enabled ? "" : "toggle--off"}`}
        onClick={onToggle}
        title={root.enabled ? "Pause this root" : "Enable this root"}
      />
      <button
        ref={kebabRef}
        className={`kebab-btn ${menuOpen ? "kebab-btn--open" : ""}`}
        onClick={() => setMenuOpen((v) => !v)}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="3" r="1.2" fill="currentColor" />
          <circle cx="7" cy="7" r="1.2" fill="currentColor" />
          <circle cx="7" cy="11" r="1.2" fill="currentColor" />
        </svg>
      </button>

      <Popover
        open={menuOpen}
        anchorRef={kebabRef}
        onClose={() => setMenuOpen(false)}
        anchor="bottom-end"
      >
        <PopoverMenu
          items={[
            {
              kind: "item",
              label: root.enabled ? "Pause this root" : "Enable this root",
              onClick: () => {
                onToggle();
                setMenuOpen(false);
              },
            },
            {
              kind: "item",
              label: "Copy glob",
              onClick: copyGlob,
              hint: "⌘C",
            },
            ...(root.is_default
              ? []
              : ([
                  { kind: "separator" as const },
                  {
                    kind: "item" as const,
                    label: "Remove root…",
                    danger: true,
                    onClick: () => {
                      setMenuOpen(false);
                      if (confirm(`Remove root "${root.glob}"?`)) onRemove();
                    },
                  },
                ] as const)),
          ]}
        />
      </Popover>
    </div>
  );
}

// ─── Privacy ──────────────────────────────────────────

function PrivacySection() {
  const [consent, setConsent] = useState<"granted" | "denied" | "pending">(
    () => telemetry.getConsent(),
  );

  function set(next: "granted" | "denied") {
    telemetry.setConsent(next);
    setConsent(next);
  }

  function purge() {
    if (!confirm("Reset your device ID and stop sending telemetry? Past events stay on the server until they age out — see PRIVACY.md for the deletion-request flow.")) return;
    telemetry.purgeRemoteData();
    setConsent("denied");
  }

  const granted = consent === "granted";

  return (
    <>
      <div className="settings-head">
        <div className="settings-eyebrow">★ privacy</div>
        <h1 className="settings-title">Anonymous, opt-in.</h1>
        <p className="settings-lede">
          Platter can send a small set of anonymous events so I can see what's working.
          No file paths, no contents, no third-party trackers. Stored in a Cloudflare D1
          database I own.
        </p>
      </div>

      <section className="settings-section">
        <div className="settings-section__head">
          <h2 className="settings-section__title">Anonymous usage stats</h2>
          <span className="settings-section__count">
            currently: <strong style={{ color: granted ? "var(--sage-2)" : "var(--ink-2)" }}>{granted ? "sharing" : "off"}</strong>
          </span>
        </div>

        <div className="root-row">
          <div className="root-row__path">
            <div className="root-row__glob">Share anonymous usage stats</div>
            <div className="root-row__sub">
              <span>random device UUID</span>
              <span className="root-row__sub-sep">·</span>
              <span>event names + small payloads</span>
              <span className="root-row__sub-sep">·</span>
              <span>flushed every 30s</span>
            </div>
          </div>
          <button
            className={`toggle ${granted ? "" : "toggle--off"}`}
            onClick={() => set(granted ? "denied" : "granted")}
            title={granted ? "Stop sharing" : "Start sharing"}
          />
        </div>

        <div className="help-card">
          What gets sent: event names like <code>review_started</code>, <code>review_resolved</code>,
          <code>feature_used</code>, <code>update_checked</code>, plus the structured payload
          described in <a href="https://github.com/rudraptpsingh/platter/blob/main/docs/PRIVACY.md" target="_blank" rel="noreferrer" style={{ color: "var(--vermilion)" }}>PRIVACY.md</a>.
          Every batched POST goes to <code>https://platter.pages.dev/api/ingest</code>.
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__head">
          <h2 className="settings-section__title">Reset device ID</h2>
          <span className="settings-section__count">cuts the link to past events</span>
        </div>
        <div className="help-card">
          Clears your local device ID and stops further sends. Events already on the server
          age out automatically; for an immediate purge, email{" "}
          <a href="mailto:rudra.ptp.singh@gmail.com" style={{ color: "var(--vermilion)" }}>
            rudra.ptp.singh@gmail.com
          </a>{" "}
          with your device ID.
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="add-root__btn" style={{ background: "var(--brick)" }} onClick={purge}>
            Reset & stop sharing
          </button>
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
function PrivacyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5l5 2v4c0 3-2 5-5 5s-5-2-5-5v-4l5-2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M5 7l1.5 1.5L9.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
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

function GitHubNavIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 .2C3.6.2 0 3.8 0 8.2c0 3.5 2.3 6.5 5.5 7.5.4.1.5-.2.5-.4v-1.4c-2.2.5-2.7-1.1-2.7-1.1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.4.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8.6-.2 1.3-.3 2-.3s1.4.1 2 .3c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.5.8 1.2.8 2.1 0 3-1.8 3.7-3.6 3.9.3.2.5.7.5 1.4v2.1c0 .2.1.5.6.4 3.2-1 5.5-4 5.5-7.5C16 3.8 12.4.2 8 .2z"/>
    </svg>
  );
}
