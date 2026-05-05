import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import "../styles/popover.css";

type Anchor = "bottom-end" | "bottom-start" | "top-end" | "top-start" | "right" | "left";

type Props = {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  anchor?: Anchor;
  offset?: number;
  /** Minimum gap from any window edge before flipping. */
  edgeGap?: number;
  className?: string;
  children: ReactNode;
};

/**
 * A portal-rendered popover anchored to any element.
 *
 * Why portal: platter's window has overflow:hidden + border-radius, the
 * sidebar has overflow:hidden, every modal has overflow:hidden. Anything
 * rendered "in place" near the corner of those containers gets clipped.
 * Portals escape that by mounting at document.body and positioning by
 * pixel coordinates derived from the anchor's bounding rect.
 *
 * Auto-flips when the natural placement would cross the viewport edge.
 * Closes on outside click + Escape. Repositions on resize/scroll.
 */
export function Popover({
  open,
  anchorRef,
  onClose,
  anchor = "bottom-end",
  offset = 6,
  edgeGap = 12,
  className = "",
  children,
}: Props) {
  const popRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  // Position calculation
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const a = anchorRef.current;
      const p = popRef.current;
      if (!a || !p) return;
      const ar = a.getBoundingClientRect();
      const pr = p.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = 0;
      let top = 0;

      // Initial placement
      switch (anchor) {
        case "bottom-end":
          left = ar.right - pr.width;
          top = ar.bottom + offset;
          break;
        case "bottom-start":
          left = ar.left;
          top = ar.bottom + offset;
          break;
        case "top-end":
          left = ar.right - pr.width;
          top = ar.top - pr.height - offset;
          break;
        case "top-start":
          left = ar.left;
          top = ar.top - pr.height - offset;
          break;
        case "right":
          left = ar.right + offset;
          top = ar.top;
          break;
        case "left":
          left = ar.left - pr.width - offset;
          top = ar.top;
          break;
      }

      // Flip vertically if we overflow off the bottom
      if (top + pr.height > vh - edgeGap && anchor.startsWith("bottom")) {
        top = ar.top - pr.height - offset;
      }
      if (top < edgeGap && anchor.startsWith("top")) {
        top = ar.bottom + offset;
      }

      // Flip horizontally if we overflow off either side
      if (left + pr.width > vw - edgeGap) {
        left = vw - edgeGap - pr.width;
      }
      if (left < edgeGap) {
        left = edgeGap;
      }

      // Final clamp — never let the popover scroll the page
      top = Math.max(edgeGap, Math.min(top, vh - edgeGap - pr.height));
      left = Math.max(edgeGap, Math.min(left, vw - edgeGap - pr.width));

      setCoords({ left, top });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor, offset, edgeGap, anchorRef]);

  // Outside click + Escape
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (popRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Defer so the same click that opens the popover doesn't immediately close it
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorRef, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={popRef}
      className={`popover ${className}`}
      style={{
        position: "fixed",
        left: coords?.left ?? -9999,
        top: coords?.top ?? -9999,
        opacity: coords ? 1 : 0,
      }}
      role="menu"
    >
      {children}
    </div>,
    document.body,
  );
}

// ─── Pre-built kebab menu surface ──────────────────────────────────

type MenuItem =
  | { kind: "item"; label: string; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string }
  | { kind: "separator" };

export function PopoverMenu({ items }: { items: MenuItem[] }) {
  return (
    <ul className="popover-menu">
      {items.map((it, i) =>
        it.kind === "separator" ? (
          <li key={i} className="popover-menu__sep" />
        ) : (
          <li key={i}>
            <button
              className={`popover-menu__item ${it.danger ? "popover-menu__item--danger" : ""}`}
              onClick={it.onClick}
              disabled={it.disabled}
            >
              <span>{it.label}</span>
              {it.hint && <span className="popover-menu__hint">{it.hint}</span>}
            </button>
          </li>
        ),
      )}
    </ul>
  );
}
