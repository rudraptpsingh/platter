import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { FileRow, FilterDecision, FilterKind, ReviewRequest, TreeNode } from "./types";
import { api, basename, relativeTime } from "./lib/api";
import { FolderTree } from "./components/FolderTree";
import { Card } from "./components/Card";
import { PreviewModal } from "./components/PreviewModal";
import { ReviewModal } from "./components/ReviewModal";
import { ReviewSetView } from "./components/ReviewSetView";
import { Settings } from "./components/Settings";
import { UpdateBanner } from "./components/UpdateBanner";
import { PrivacyConsent } from "./components/PrivacyConsent";
import { ToastProvider, useToast } from "./components/Toast";
import { Popover, PopoverMenu } from "./components/Popover";
import { CompareModal } from "./components/CompareModal";
import { RecapView } from "./components/RecapView";
import { detectReviewSet } from "./lib/review-set";
import * as telemetry from "./lib/telemetry";
import { copyDecisionsMarkdown, type Window as DecisionWindow } from "./lib/decisions";
import { applyRemoteDecisions } from "./lib/share";

import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/cards.css";
import "./styles/compare-modal.css";

type View = "home" | "folder" | "search" | "decisions" | "recap";
type DecisionsFilter = "all" | "approved" | "rejected";

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [recent, setRecent] = useState<FileRow[]>([]);
  const [searchHits, setSearchHits] = useState<FileRow[]>([]);
  const [decisionsList, setDecisionsList] = useState<FileRow[]>([]);
  const [decisionsFilter, setDecisionsFilter] = useState<DecisionsFilter>("all");
  const [decisionCounts, setDecisionCounts] = useState<{ approved: number; rejected: number }>({ approved: 0, rejected: 0 });
  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState<FilterKind>("all");
  const [filterDecision, setFilterDecision] = useState<FilterDecision>("all");
  const [previewFile, setPreviewFile] = useState<FileRow | null>(null);
  const [pendingReviews, setPendingReviews] = useState<ReviewRequest[]>([]);
  const [compareSelection, setCompareSelection] = useState<FileRow[]>([]);
  const [comparePair, setComparePair] = useState<[FileRow, FileRow] | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [showConsent, setShowConsent] = useState(false);
  const [lastScan, setLastScan] = useState(Date.now() / 1000);

  const refreshTree = useCallback(async () => {
    const t = await api.listTree();
    setTree(t);
  }, []);

  const refreshRecent = useCallback(async () => {
    const r = await api.listRecent(80);
    setRecent(r);
  }, []);

  const refreshDecisionCounts = useCallback(async () => {
    try {
      const [approved, rejected] = await api.countDecisions();
      setDecisionCounts({ approved, rejected });
    } catch {
      /* ignore */
    }
  }, []);

  const loadDecisions = useCallback(async (filter: DecisionsFilter) => {
    const decision = filter === "all" ? undefined : filter;
    const rows = await api.listDecided(decision, undefined, 500);
    setDecisionsList(rows);
  }, []);

  const refreshFiles = useCallback(async (dir: string | null) => {
    if (!dir) {
      setFiles([]);
      return;
    }
    const f = await api.listFiles(dir);
    setFiles(f);
  }, []);

  const toast = useToast();

  // Background poll for share-link decisions made by remote reviewers.
  // Approve/reject sync onto the local file (so the gallery card shows
  // the sage check / brick × just like a local decision); iteration is
  // surfaced via toast only since it's not a verdict.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      const applied = await applyRemoteDecisions().catch(() => []);
      if (cancelled) return;
      if (applied.length > 0) {
        const filename = (p: string) => p.split("/").pop() ?? p;
        for (const a of applied) {
          const who = a.reviewer_name ?? "anonymous";
          const verb =
            a.decision === "approved" ? "approved" :
            a.decision === "rejected" ? "rejected" :
            "asked to iterate on";
          toast.show({
            message: `${who} ${verb} ${filename(a.path)}`,
            tone: a.decision === "approved" ? "ok" :
                  a.decision === "rejected" ? "warn" :
                  "info",
            ttl: 8000,
          });
        }
        // Refresh the views so the new decisions show up in counts + grid
        refreshTree();
        refreshRecent();
        refreshDecisionCounts();
        refreshFiles(activePath);
      }
    }
    tick(); // immediate on mount
    const id = window.setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activePath, refreshTree, refreshRecent, refreshDecisionCounts, refreshFiles, toast]);

  // Initial load
  useEffect(() => {
    refreshTree().then(() => setLastScan(Date.now() / 1000));
    refreshRecent();
    refreshDecisionCounts();
    api.listPendingReviews().then(setPendingReviews).catch(() => {});

    // First-run consent prompt — only inside the actual Tauri app (not the browser dev preview).
    telemetry.init();
    if (telemetry.getConsent() === "pending") {
      telemetry.isTauri().then((ok) => {
        if (ok) setShowConsent(true);
      });
    } else if (telemetry.getConsent() === "granted") {
      telemetry.track("app_launched", { source: "startup" });
    }
  }, [refreshTree, refreshRecent]);

  // Dock badge tracks pending review count
  useEffect(() => {
    const win = getCurrentWindow();
    const count = pendingReviews.length;
    win.setBadgeCount(count > 0 ? count : undefined).catch(() => {});
  }, [pendingReviews.length]);

  // Global keyboard shortcuts: ⌘, opens settings, Space opens Quicklook for first card
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (e.metaKey && e.key === ",") {
        e.preventDefault();
        setShowSettings(true);
      } else if (
        e.key === "Escape" &&
        compareSelection.length > 0 &&
        !comparePair &&
        !previewFile &&
        pendingReviews.length === 0 &&
        !showSettings &&
        !showConsent
      ) {
        e.preventDefault();
        setCompareSelection([]);
      } else if (
        e.key === " " &&
        !inInput &&
        !previewFile &&
        pendingReviews.length === 0 &&
        !showSettings
      ) {
        // Quicklook: open the first visible card
        const candidate = filteredFilesRef.current[0];
        if (candidate) {
          e.preventDefault();
          setPreviewFile(candidate);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewFile, pendingReviews.length, showSettings, compareSelection.length, comparePair, showConsent]);

  // Request notification permission once on startup (no-op if already granted/denied)
  useEffect(() => {
    (async () => {
      try {
        const granted = await isPermissionGranted();
        if (!granted) await requestPermission();
      } catch {
        // ignore — non-fatal
      }
    })();
  }, []);

  // Listen for new MCP review requests
  useEffect(() => {
    const unlistenPending = listen<ReviewRequest>("platter:review-pending", async (event) => {
      console.debug(
        "[platter] review-pending:",
        event.payload.id,
        "mode:", event.payload.mode,
        "paths:", event.payload.paths.length,
      );
      setPendingReviews((prev) => {
        if (prev.some((p) => p.id === event.payload.id)) return prev;
        return [...prev, event.payload];
      });
      telemetry.track("review_started", {
        mode: event.payload.mode,
        asset_count: event.payload.paths.length,
      });

      // The review IS the user's job right now — bring the window forward.
      // Skip if there's already a review on screen (don't yank the user away
      // from the one they're already looking at).
      try {
        const alreadyOnScreen = pendingReviews.length > 0;

        if (!alreadyOnScreen) {
          // Use the Rust force_foreground command — it sets
          // NSWindowCollectionBehaviorMoveToActiveSpace + calls
          // activateIgnoringOtherApps:YES so the window comes to the
          // current Space, not the user being yanked to wherever the
          // window was before. JS-side win.setFocus() is unreliable for
          // cross-Space activation on macOS.
          await api.forceForeground().catch(() => {});
        }

        const win = getCurrentWindow();
        const focused = await win.isFocused().catch(() => true);
        if (!focused && !alreadyOnScreen) {
          // Belt-and-braces: dock bounce + notification banner if focus didn't take
          win.requestUserAttention(1).catch(() => {});
          const ctx = (event.payload.context ?? {}) as { task?: string };
          const taskLabel = ctx.task ? ` for ${ctx.task}` : "";
          const n = event.payload.paths.length;
          try {
            const granted = await isPermissionGranted();
            if (granted) {
              sendNotification({
                title: "Claude wants your review",
                body: `${n} mockup${n === 1 ? "" : "s"}${taskLabel}. Click to review.`,
              });
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore — non-fatal
      }
    });
    // Server-side resolution (timeout, shutdown, or user accepted from elsewhere)
    // — drop the matching modal so it doesn't stay stale.
    const unlistenResolved = listen<{ id: string; decision: { decision: string } }>(
      "platter:review-resolved",
      (event) => {
        setPendingReviews((prev) => prev.filter((p) => p.id !== event.payload.id));
        telemetry.track("review_resolved", {
          decision: event.payload.decision?.decision,
        });
      },
    );
    return () => {
      unlistenPending.then((u) => u());
      unlistenResolved.then((u) => u());
    };
  }, []);

  // Re-fetch folder files when active path changes
  useEffect(() => {
    refreshFiles(activePath);
  }, [activePath, refreshFiles]);

  // Live updates
  useEffect(() => {
    const unlistenChanged = listen("platter:files-changed", () => {
      refreshTree();
      refreshRecent();
      refreshDecisionCounts();
      refreshFiles(activePath);
      setLastScan(Date.now() / 1000);
    });
    const unlistenScan = listen("platter:scan-complete", () => {
      setScanning(false);
      refreshTree();
      refreshRecent();
      refreshDecisionCounts();
      refreshFiles(activePath);
      setLastScan(Date.now() / 1000);
    });
    return () => {
      unlistenChanged.then((u) => u());
      unlistenScan.then((u) => u());
    };
  }, [activePath, refreshFiles, refreshRecent, refreshTree]);

  // Global search (debounced)
  useEffect(() => {
    if (view !== "search" || search.trim() === "") {
      setSearchHits([]);
      return;
    }
    const handle = setTimeout(() => {
      api.searchAll(search.trim(), 200).then(setSearchHits);
    }, 200);
    return () => clearTimeout(handle);
  }, [search, view]);

  // Determine active source list
  const sourceFiles: FileRow[] =
    view === "home" ? recent
      : view === "search" ? searchHits
      : view === "decisions" ? decisionsList
      : files;

  const filteredFilesRef = useRef<FileRow[]>([]);

  const filteredFiles = useMemo(() => {
    return sourceFiles.filter((f) => {
      if (filterKind !== "all" && f.kind !== filterKind) return false;
      if (filterDecision === "approved" && f.decision !== "approved") return false;
      if (filterDecision === "rejected" && f.decision !== "rejected") return false;
      if (filterDecision === "undecided" && f.decision !== null) return false;
      // local search applies only inside a folder
      if (view === "folder" && search && !basename(f.path).toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [sourceFiles, filterKind, filterDecision, search, view]);

  useEffect(() => {
    filteredFilesRef.current = filteredFiles;
  }, [filteredFiles]);

  // Auto-promote a folder to "review set" view when it matches the pattern:
  // index.html + numbered HTML siblings + (optional) sibling .md plan.
  // Only kicks in for the folder view, with no active filters or search.
  const reviewSet = useMemo(() => {
    if (view !== "folder") return null;
    if (filterKind !== "all" || filterDecision !== "all" || search) return null;
    return detectReviewSet(files);
  }, [view, filterKind, filterDecision, search, files]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: sourceFiles.length };
    for (const f of sourceFiles) c[f.kind] = (c[f.kind] ?? 0) + 1;
    return {
      kind: c,
      decisions: {
        approved: sourceFiles.filter((f) => f.decision === "approved").length,
        rejected: sourceFiles.filter((f) => f.decision === "rejected").length,
        undecided: sourceFiles.filter((f) => f.decision === null).length,
      },
    };
  }, [sourceFiles]);

  const newCount = useMemo(
    () => sourceFiles.filter((f) => Date.now() / 1000 - f.mtime < 600 && !f.decision).length,
    [sourceFiles]
  );

  const handleSelectFolder = useCallback((path: string) => {
    setActivePath(path);
    setView("folder");
    setSearch("");
  }, []);

  const handleHome = useCallback(() => {
    setView("home");
    setActivePath(null);
    setSearch("");
  }, []);

  const handleCompareToggle = useCallback((f: FileRow) => {
    setCompareSelection((prev) => {
      // Toggle: if already selected, deselect
      if (prev.some((x) => x.path === f.path)) {
        return prev.filter((x) => x.path !== f.path);
      }
      // Add up to 2; auto-open modal at 2
      const next = [...prev, f];
      if (next.length >= 2) {
        setComparePair([next[0], next[1]]);
        return [];
      }
      return next;
    });
  }, []);

  const handleRecapView = useCallback(() => {
    setView("recap");
    setActivePath(null);
    setSearch("");
  }, []);

  const handleDecisionsView = useCallback(
    (filter: DecisionsFilter) => {
      setView("decisions");
      setActivePath(null);
      setSearch("");
      setDecisionsFilter(filter);
      loadDecisions(filter);
    },
    [loadDecisions],
  );

  const handleSearchChange = useCallback((s: string) => {
    setSearch(s);
    if (view !== "folder") {
      setView(s.trim() === "" ? "home" : "search");
    }
  }, [view]);

  const refreshAfterDecision = useCallback(async () => {
    if (view === "folder" && activePath) {
      const fs = await api.listFiles(activePath);
      setFiles(fs);
    }
    refreshRecent();
    refreshDecisionCounts();
    if (view === "search" && search.trim()) {
      const r = await api.searchAll(search.trim(), 200);
      setSearchHits(r);
    }
    if (view === "decisions") {
      loadDecisions(decisionsFilter);
    }
    setPreviewFile((prev) => {
      if (!prev) return prev;
      const all = view === "folder" ? files
        : view === "search" ? searchHits
        : view === "decisions" ? decisionsList
        : recent;
      const fresh = all.find((x) => x.path === prev.path);
      return fresh ?? prev;
    });
  }, [activePath, view, search, decisionsFilter, files, searchHits, recent, decisionsList, refreshRecent, refreshDecisionCounts, loadDecisions]);

  // Called by PreviewModal when the user makes (or changes) a decision.
  // We get the path and the new decision; the previous one is on the file
  // record we already have. Fires a toast with an undo handler that puts
  // the previous decision back (or clears, if there was none).
  const handleDecided = useCallback(
    async (path: string, newDecision: "approved" | "rejected") => {
      const prev = previewFile?.path === path ? previewFile : files.find((f) => f.path === path) ?? recent.find((f) => f.path === path);
      const prevDecision = prev?.decision ?? null;
      const filename = path.slice(path.lastIndexOf("/") + 1);

      await refreshAfterDecision();

      toast.show({
        message: newDecision === "approved" ? `Approved ${filename}` : `Rejected ${filename}`,
        tone: newDecision === "approved" ? "ok" : "warn",
        undo: async () => {
          if (prevDecision === null) {
            await api.clearDecision(path);
          } else {
            await api.decide(path, prevDecision);
          }
          await refreshAfterDecision();
        },
      });
    },
    [previewFile, files, recent, refreshAfterDecision, toast],
  );

  return (
    <div className="app">
      <Sidebar
        tree={tree}
        activePath={activePath}
        view={view}
        onHome={handleHome}
        onSelect={handleSelectFolder}
        onDecisionsView={handleDecisionsView}
        onRecapView={handleRecapView}
        decisionsFilter={decisionsFilter}
        decisionCounts={decisionCounts}
        scanning={scanning}
      />

      <main className="main">
        {view !== "recap" && (
        <Toolbar
          view={view}
          activePath={activePath}
          stats={{ total: sourceFiles.length, newCount, lastScan }}
          search={search}
          onSearch={handleSearchChange}
          filterKind={filterKind}
          setFilterKind={setFilterKind}
          filterDecision={filterDecision}
          setFilterDecision={setFilterDecision}
          counts={counts}
          onRescan={() => api.rescan()}
          onOpenSettings={() => setShowSettings(true)}
          decisionsFilter={decisionsFilter}
        />
        )}

        {view === "recap" ? (
          <RecapView
            onOpenFile={(f) => setPreviewFile(f)}
            onJumpToFolder={(folder) => handleSelectFolder(folder)}
          />
        ) : view === "home" && recent.length === 0 && scanning ? (
          <div className="center-state">
            <h2 className="center-state__h">Scanning…</h2>
            <p className="center-state__sub">
              Looking through ~/github/*/mockups, screenshots, and artifacts.
            </p>
          </div>
        ) : view === "home" && recent.length === 0 ? (
          <div className="center-state">
            <h2 className="center-state__h">Ready when you are.</h2>
            <p className="center-state__sub">
              None of the watched folders had visual files yet. Drop a PNG or HTML into{" "}
              <code style={{ fontFamily: "var(--font-mono)" }}>~/github/*/mockups</code> and it will
              appear here.
            </p>
            <button className="center-state__cta" onClick={() => api.rescan()}>
              Rescan now
            </button>
          </div>
        ) : view === "search" && searchHits.length === 0 && search.trim() ? (
          <div className="center-state">
            <h2 className="center-state__h">Nothing matches "{search}".</h2>
            <p className="center-state__sub">Try a shorter query, or check that the folder is indexed.</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="center-state">
            <h2 className="center-state__h">Nothing here.</h2>
            <p className="center-state__sub">Try clearing your filters.</p>
          </div>
        ) : reviewSet ? (
          <ReviewSetView
            set={reviewSet}
            onOpenFile={(f) => setPreviewFile(f)}
          />
        ) : (
          <div className="masonry-wrap">
            <div className="masonry">
              {filteredFiles.map((f) => {
                const slot = compareSelection.findIndex((x) => x.path === f.path);
                return (
                  <Card
                    key={f.id}
                    file={f}
                    onOpen={() => setPreviewFile(f)}
                    onCompareToggle={handleCompareToggle}
                    comparedSlot={slot === -1 ? null : (slot as 0 | 1)}
                    showLocation={view !== "folder"}
                    onJumpToFolder={(folder) => handleSelectFolder(folder)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {previewFile && pendingReviews.length === 0 && (
          <PreviewModal
            file={previewFile}
            siblings={filteredFiles}
            onClose={() => setPreviewFile(null)}
            onDecided={handleDecided}
            onNavigate={(f) => setPreviewFile(f)}
          />
        )}

        {pendingReviews.length > 0 && (
          <ReviewModal
            request={pendingReviews[0]}
            onClose={() =>
              setPendingReviews((prev) =>
                prev.filter((p) => p.id !== pendingReviews[0].id)
              )
            }
          />
        )}

        {showSettings && (
          <Settings
            onClose={() => setShowSettings(false)}
            onChanged={() => {
              refreshTree();
              refreshRecent();
              refreshFiles(activePath);
            }}
          />
        )}

        {compareSelection.length === 1 && !comparePair && (
          <div className="cmp-banner">
            <span>
              Comparing with <strong>{basename(compareSelection[0].path)}</strong> — ⌘-click another card
            </span>
            <span className="cmp-banner__hint">⌘ + click</span>
            <button className="cmp-banner__cancel" onClick={() => setCompareSelection([])}>
              Cancel
            </button>
          </div>
        )}

        {comparePair && (
          <CompareModal
            left={comparePair[0]}
            right={comparePair[1]}
            onClose={() => setComparePair(null)}
            onSwap={() =>
              setComparePair((prev) => (prev ? [prev[1], prev[0]] : prev))
            }
            onDecided={async (path, decision) => {
              await handleDecided(path, decision);
              // Reflect the new decision back into the compare panes immediately
              setComparePair((prev) => {
                if (!prev) return prev;
                return [
                  prev[0].path === path
                    ? { ...prev[0], decision }
                    : prev[0],
                  prev[1].path === path
                    ? { ...prev[1], decision }
                    : prev[1],
                ] as [FileRow, FileRow];
              });
            }}
          />
        )}

        <UpdateBanner />

        {showConsent && (
          <PrivacyConsent
            onDecide={(choice) => {
              if (choice === "later") {
                setShowConsent(false);
                return;
              }
              telemetry.setConsent(choice);
              setShowConsent(false);
            }}
          />
        )}
      </main>
    </div>
  );
}

function Sidebar({
  tree,
  activePath,
  view,
  onHome,
  onSelect,
  onDecisionsView,
  onRecapView,
  decisionsFilter,
  decisionCounts,
  scanning,
}: {
  tree: TreeNode[];
  activePath: string | null;
  view: View;
  onHome: () => void;
  onSelect: (p: string) => void;
  onDecisionsView: (filter: DecisionsFilter) => void;
  onRecapView: () => void;
  decisionsFilter: DecisionsFilter;
  decisionCounts: { approved: number; rejected: number };
  scanning: boolean;
}) {
  const totalFiles = tree.reduce((acc, t) => acc + t.count, 0);
  return (
    <aside className="sidebar">
      <div className="titlebar-drag" />
      <div className="sidebar__head">
        <span className="sidebar__brand-mark" />
        <span className="sidebar__brand">platter</span>
      </div>
      <div className="sidebar__scroll">
        <div
          className={`home-row ${view === "home" || view === "search" ? "home-row--active" : ""}`}
          onClick={onHome}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 7l5-5 5 5M3 6.5V12h8V6.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="home-row__label">Recent</span>
          <span className="tree-row__count" style={{ marginLeft: "auto" }}>
            {totalFiles}
          </span>
        </div>

        <FolderTree nodes={tree} activePath={activePath} onSelect={onSelect} />

        <div className="tree-section" style={{ marginTop: 16 }}>smart</div>
        <div
          className={`tree-row ${view === "recap" ? "tree-row--active" : ""}`}
          onClick={onRecapView}
        >
          <svg className="tree-row__icon" width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 11h2V6H2v5zm4 0h2V3H6v8zm4 0h2V8h-2v3z"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          </svg>
          <span className="tree-row__label">Recap</span>
        </div>

        <div className="tree-section" style={{ marginTop: 16 }}>decisions</div>
        <div
          className={`tree-row ${view === "decisions" && decisionsFilter === "approved" ? "tree-row--active" : ""}`}
          onClick={() => onDecisionsView("approved")}
        >
          <svg className="tree-row__icon" width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M3 7l3 3 5-6" stroke="var(--sage)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="tree-row__label">Approved</span>
          <span className="tree-row__count">{decisionCounts.approved}</span>
        </div>
        <div
          className={`tree-row ${view === "decisions" && decisionsFilter === "rejected" ? "tree-row--active" : ""}`}
          onClick={() => onDecisionsView("rejected")}
        >
          <svg className="tree-row__icon" width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M3 11l8-8" stroke="var(--brick)" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span className="tree-row__label">Rejected</span>
          <span className="tree-row__count">{decisionCounts.rejected}</span>
        </div>
        <div
          className={`tree-row ${view === "decisions" && decisionsFilter === "all" ? "tree-row--active" : ""}`}
          onClick={() => onDecisionsView("all")}
        >
          <svg className="tree-row__icon" width="13" height="13" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <span className="tree-row__label">All decisions</span>
          <span className="tree-row__count">{decisionCounts.approved + decisionCounts.rejected}</span>
        </div>
      </div>
      <div className="sidebar__footer">
        <span className={scanning ? "dot" : "dot dot--sage"} />
        <div className="sidebar__footer-status">
          <div className="sidebar__footer-label">{scanning ? "scanning…" : "ready"}</div>
          <div className="sidebar__footer-sub">{totalFiles} files indexed</div>
        </div>
      </div>
    </aside>
  );
}

function Toolbar({
  view,
  activePath,
  stats,
  search,
  onSearch,
  filterKind,
  setFilterKind,
  filterDecision,
  setFilterDecision,
  counts,
  onRescan,
  onOpenSettings,
  decisionsFilter,
}: {
  view: View;
  activePath: string | null;
  stats: { total: number; newCount: number; lastScan: number };
  search: string;
  onSearch: (s: string) => void;
  filterKind: FilterKind;
  setFilterKind: (k: FilterKind) => void;
  filterDecision: FilterDecision;
  setFilterDecision: (d: FilterDecision) => void;
  counts: {
    kind: Record<string, number>;
    decisions: { approved: number; rejected: number; undecided: number };
  };
  onRescan: () => void;
  onOpenSettings: () => void;
  decisionsFilter: DecisionsFilter;
}) {
  const breadcrumb = activePath ? activePath.replace(/\/Users\/[^/]+/, "~") : null;
  const parts = breadcrumb?.split("/").filter(Boolean) ?? [];

  let leadingTitle: React.ReactNode;
  let leadingSub: string;
  if (view === "home") {
    leadingTitle = (
      <span className="crumb__current" style={{ fontStyle: "italic" }}>
        Recent across everything
      </span>
    );
    leadingSub = `${stats.total} most recent · ${stats.newCount} new · scanned ${relativeTime(stats.lastScan)}`;
  } else if (view === "search") {
    leadingTitle = (
      <span className="crumb__current" style={{ fontStyle: "italic" }}>
        Search results
      </span>
    );
    leadingSub = `${stats.total} match${stats.total === 1 ? "" : "es"}`;
  } else if (view === "decisions") {
    const label =
      decisionsFilter === "approved"
        ? "Approved"
        : decisionsFilter === "rejected"
        ? "Rejected"
        : "All decisions";
    leadingTitle = (
      <span className="crumb__current" style={{ fontStyle: "italic" }}>
        {label}
      </span>
    );
    leadingSub = `${stats.total} decision${stats.total === 1 ? "" : "s"}`;
  } else if (parts.length > 0) {
    leadingTitle = (
      <>
        {parts.slice(0, -1).map((p, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
            <span>{p}</span>
            <span className="crumb__sep" style={{ margin: "0 4px" }}>/</span>
          </span>
        ))}
        <span className="crumb__current">{parts[parts.length - 1]}</span>
      </>
    );
    leadingSub = `${stats.total} items${
      stats.newCount > 0 ? ` · ${stats.newCount} new` : ""
    } · scanned ${relativeTime(stats.lastScan)}`;
  } else {
    leadingTitle = (
      <span className="crumb__current" style={{ fontStyle: "italic", color: "var(--ink-3)" }}>
        choose a folder
      </span>
    );
    leadingSub = "";
  }

  return (
    <div className="toolbar">
      <div className="toolbar__top">
        <div className="crumb">
          {leadingTitle}
          {leadingSub && <span className="crumb__sub">{leadingSub}</span>}
        </div>
        <span className="spacer" />
        <div className="search">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.2" />
            <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            className="input"
            placeholder={view === "folder" ? "Search this folder…" : "Search across all folders…"}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <ExportDecisionsButton />
        <button className="tool-icon" onClick={onRescan} title="Rescan">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 7a5 5 0 0 1 9-3M12 7a5 5 0 0 1-9 3M11 1v3h-3M3 13v-3h3"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button className="tool-icon" onClick={onOpenSettings} title="Settings (⌘,)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" />
            <path
              d="M7 1v1.5M7 11.5V13M13 7h-1.5M2.5 7H1M11.24 2.76l-1.06 1.06M3.82 10.18l-1.06 1.06M11.24 11.24l-1.06-1.06M3.82 3.82L2.76 2.76"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="toolbar__sub">
        <div className="filterbar">
          {(["all", "html", "png", "jpg", "pdf", "svg", "md"] as FilterKind[]).map((k) => {
            const c = counts.kind[k] ?? 0;
            if (k !== "all" && c === 0) return null;
            return (
              <button
                key={k}
                className={`pill ${filterKind === k ? "pill--active" : ""}`}
                onClick={() => setFilterKind(k)}
              >
                {k}
                <span className="pill__count">{k === "all" ? counts.kind.all ?? 0 : c}</span>
              </button>
            );
          })}
        </div>
        <span className="filter-divider" />
        <div className="filterbar">
          <button
            className={`pill pill--decision ${filterDecision === "approved" ? "pill--active" : ""}`}
            onClick={() => setFilterDecision(filterDecision === "approved" ? "all" : "approved")}
            style={filterDecision === "approved" ? undefined : { color: "var(--sage-2)" }}
          >
            <svg viewBox="0 0 14 14" fill="none">
              <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            approved
            <span className="pill__count">{counts.decisions.approved}</span>
          </button>
          <button
            className={`pill pill--decision ${filterDecision === "rejected" ? "pill--active" : ""}`}
            onClick={() => setFilterDecision(filterDecision === "rejected" ? "all" : "rejected")}
            style={filterDecision === "rejected" ? undefined : { color: "var(--brick)" }}
          >
            <svg viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            rejected
            <span className="pill__count">{counts.decisions.rejected}</span>
          </button>
          <button
            className={`pill pill--decision ${filterDecision === "undecided" ? "pill--active" : ""}`}
            onClick={() =>
              setFilterDecision(filterDecision === "undecided" ? "all" : "undecided")
            }
          >
            <svg viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2 2" />
            </svg>
            undecided
            <span className="pill__count">{counts.decisions.undecided}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportDecisionsButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const toast = useToast();

  async function exportWindow(w: DecisionWindow) {
    setOpen(false);
    try {
      const { count, window } = await copyDecisionsMarkdown(w);
      toast.show({
        message:
          count === 0
            ? `No decisions ${window === "all" ? "yet" : `in ${window === "today" ? "the last 24h" : window === "week" ? "the last week" : "the last month"}`}.`
            : `Copied ${count} decision${count === 1 ? "" : "s"} (${window === "all" ? "all-time" : window}) as markdown.`,
        tone: count === 0 ? "info" : "ok",
      });
    } catch (e) {
      toast.show({ message: `Export failed: ${e}`, tone: "warn" });
    }
  }

  return (
    <>
      <button
        ref={ref}
        className={`tool-icon ${open ? "tool-icon--active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Export decisions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M7 2v6m0 0L4 5m3 3l3-3M2 9v3h10V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Popover open={open} anchorRef={ref} onClose={() => setOpen(false)} anchor="bottom-end">
        <PopoverMenu
          items={[
            { kind: "item", label: "Copy today's decisions", onClick: () => exportWindow("today") },
            { kind: "item", label: "Copy this week's decisions", onClick: () => exportWindow("week") },
            { kind: "item", label: "Copy this month's decisions", onClick: () => exportWindow("month") },
            { kind: "separator" },
            { kind: "item", label: "Copy all decisions", onClick: () => exportWindow("all") },
          ]}
        />
      </Popover>
    </>
  );
}
