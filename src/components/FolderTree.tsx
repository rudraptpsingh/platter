import { useState } from "react";
import type { TreeNode, RootInfo } from "../types";

type Props = {
  nodes: TreeNode[];
  activePath: string | null;
  onSelect: (path: string) => void;
  roots?: RootInfo[];
  onRemoveRoot?: (id: number) => void;
};

const PROJECT_COLORS = ["#4A6741", "#5A4A7A", "#7A5A3A", "#3A5A6A", "#6A3A5A"];

function projectColor(_id: number | undefined, idx: number): string {
  return PROJECT_COLORS[idx % PROJECT_COLORS.length];
}

function kindSummary(kindCounts?: Record<string, number>): string {
  if (!kindCounts) return "";
  const order = ["png", "jpg", "jpeg", "svg", "webp", "gif", "html", "htm", "pdf", "md"];
  const parts: string[] = [];
  for (const k of order) {
    if (kindCounts[k]) parts.push(`${kindCounts[k]} ${k}`);
  }
  // catch anything not in order list
  for (const [k, n] of Object.entries(kindCounts)) {
    if (!order.includes(k)) parts.push(`${n} ${k}`);
  }
  return parts.slice(0, 3).join(" · ");
}

export function FolderTree({ nodes, activePath, onSelect, roots, onRemoveRoot }: Props) {
  if (nodes.length === 0) {
    return (
      <div style={{ padding: "20px 14px", fontSize: 12, color: "var(--ink-3)", lineHeight: 1.6 }}>
        No projects yet — add a folder in Settings.
      </div>
    );
  }

  return (
    <div>
      {nodes.map((root, idx) => {
        const rootInfo = roots?.find(r => r.glob === root.path || r.label === root.label);
        return (
          <Branch
            key={root.path}
            node={root}
            depth={0}
            activePath={activePath}
            onSelect={onSelect}
            defaultExpanded
            projectColor={projectColor(rootInfo?.id, idx)}
            rootInfo={rootInfo}
            onRemoveRoot={onRemoveRoot}
          />
        );
      })}
    </div>
  );
}

function Branch({
  node, depth, activePath, onSelect, defaultExpanded = false,
  projectColor: color, rootInfo, onRemoveRoot,
}: {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  onSelect: (path: string) => void;
  defaultExpanded?: boolean;
  projectColor?: string;
  rootInfo?: RootInfo;
  onRemoveRoot?: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [hovered, setHovered] = useState(false);
  const hasChildren = node.children.length > 0;
  const isActive = activePath === node.path;
  const isRoot = depth === 0;

  const summary = isRoot ? kindSummary(rootInfo?.kind_counts) : "";

  return (
    <>
      <div
        className={`tree-row ${isRoot ? "tree-row--root" : depth === 1 ? "tree-row--child" : "tree-row--child2"} ${isActive ? "tree-row--active" : ""}`}
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          if (!node.path.includes("*")) onSelect(node.path);
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={node.path && !node.path.includes("*") ? node.path : node.label}
      >
        {isRoot ? (
          <span className="tree-row__project-dot" style={{ background: color }} />
        ) : (
          <>
            <span className={`tree-row__chev ${expanded ? "tree-row__chev--expanded" : ""}`}>
              {hasChildren ? "▶" : ""}
            </span>
            <FolderIcon />
          </>
        )}

        <span className="tree-row__label">
          {rootInfo?.label ?? node.label}
          {isRoot && summary && (
            <span className="tree-row__summary">{summary}</span>
          )}
        </span>

        {(!hovered || !onRemoveRoot || !isRoot) && (
          <span className="tree-row__count">{node.count}</span>
        )}

        {hovered && onRemoveRoot && isRoot && rootInfo && (
          <button
            className="tree-row__remove"
            onClick={e => { e.stopPropagation(); onRemoveRoot(rootInfo.id); }}
            title="Remove project"
          >×</button>
        )}
      </div>

      {expanded && node.children.map(child => (
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
      <path d="M2 4h10v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z" fill="currentColor" fillOpacity="0.12"/>
      <path d="M2 4h10v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4zM2 4l1.5-1.5h2L7 4" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
    </svg>
  );
}
