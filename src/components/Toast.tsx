import { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import "../styles/toast.css";

export type ToastTone = "info" | "ok" | "warn";

export type ToastOpts = {
  message: string;
  tone?: ToastTone;
  /** Optional undo handler. If present, ⌘Z within ttl reverts. */
  undo?: () => void | Promise<void>;
  /** Optional action button shown alongside the message. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds to show. Default 5000. */
  ttl?: number;
};

type Toast = ToastOpts & { id: number; createdAt: number };

type Ctx = {
  show: (opts: ToastOpts) => void;
  dismiss: (id?: number) => void;
};

const ToastContext = createContext<Ctx>({
  show: () => {},
  dismiss: () => {},
});

export function useToast(): Ctx {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seqRef = useRef(0);

  const show = useCallback((opts: ToastOpts) => {
    const id = ++seqRef.current;
    const ttl = opts.ttl ?? 5000;
    const t: Toast = { ...opts, id, createdAt: Date.now() };
    setToasts((prev) => [...prev, t]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, ttl);
  }, []);

  const dismiss = useCallback((id?: number) => {
    setToasts((prev) => (id == null ? [] : prev.filter((x) => x.id !== id)));
  }, []);

  // Global ⌘Z while a toast with `undo` is up — fire the most recent one.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        const last = [...toasts].reverse().find((t) => t.undo);
        if (last) {
          e.preventDefault();
          last.undo?.();
          setToasts((prev) => prev.filter((x) => x.id !== last.id));
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toasts]);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      {createPortal(
        <div className="toast-stack" aria-live="polite">
          {toasts.map((t) => (
            <ToastView
              key={t.id}
              toast={t}
              onUndo={() => {
                t.undo?.();
                setToasts((prev) => prev.filter((x) => x.id !== t.id));
              }}
              onDismiss={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function ToastView({
  toast,
  onUndo,
  onDismiss,
}: {
  toast: Toast;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const tone = toast.tone ?? "info";
  return (
    <div className={`toast toast--${tone}`} role="status">
      <span className="toast__message">{toast.message}</span>
      {toast.action && (
        <button className="toast__btn" onClick={() => { toast.action!.onClick(); onDismiss(); }}>
          {toast.action.label}
        </button>
      )}
      {toast.undo && (
        <button className="toast__btn" onClick={onUndo}>
          Undo
          <span className="toast__hint">⌘Z</span>
        </button>
      )}
      <button className="toast__close" onClick={onDismiss} aria-label="Dismiss">
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
          <path d="M3 3l8 8M3 11l8-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
