import { useState } from "react";
import type { TreeNode } from "../types";

type Props = {
  nodes: TreeNode[];
  activePath: string | null;
  onSelect: (path: string) => void;
};

export function FolderTree({ nodes, activePath, onSelect }: Props) {
  if (nodes.length === 0) {
    return (
      <div style={{ padding: "20px 12px", fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
        Scanning the watched roots… If nothing shows up, it means none of the default folders had visual files. You can add a custom root in Settings.
      </div>
    );
  }
  return (
    <div>
      <div className="tree-section">watched roots</div>
      {nodes.map((root) => (
        <Branch
          key={root.path}
          node={root}
          depth={0}
          activePath={activePath}
          onSelect={onSelect}
          defaultExpanded
        />
      ))}
    </div>
  );
}

function Branch({
  node,
  depth,
  activePath,
  onSelect,
  defaultExpanded = false,
}: {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  onSelect: (path: string) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = node.children.length > 0;
  const isActive = activePath === node.path;
  const childClass =
    depth === 0 ? "" : depth === 1 ? "tree-row--child" : "tree-row--child2";

  // Top-level "roots" entries are not directly selectable as a folder (they're glob containers)
  const selectable = depth > 0 || !node.path.includes("*");

  return (
    <>
      <div
        className={`tree-row ${childClass} ${isActive ? "tree-row--active" : ""}`}
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          if (selectable) onSelect(node.path);
        }}
      >
        <span className={`tree-row__chev ${expanded ? "tree-row__chev--expanded" : ""}`}>
          {hasChildren ? "▶" : ""}
        </span>
        <FolderIcon />
        <span className="tree-row__label">{node.label}</span>
        <span className="tree-row__count">{node.count}</span>
      </div>
      {expanded &&
        node.children.map((child) => (
          <Branch
            key={child.path}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

function FolderIcon() {
  return (
    <svg className="tree-row__icon" viewBox="0 0 14 14" fill="none">
      <path
        d="M2 4h10v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path
        d="M2 4h10v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4zM2 4l1.5-1.5h2L7 4"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
