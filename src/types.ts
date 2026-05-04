export type FileRow = {
  id: number;
  path: string;
  root_id: number;
  kind: string;
  size: number;
  mtime: number;
  created_at: number;
  last_seen: number;
  decision: string | null;
  decision_note: string | null;
  decided_at: number | null;
};

export type TreeNode = {
  label: string;
  path: string;
  count: number;
  mtime: number;
  children: TreeNode[];
};

export type Decision = "approved" | "rejected";

export type FilterKind = "all" | "html" | "png" | "jpg" | "pdf" | "svg" | "md";
export type FilterDecision = "all" | "approved" | "rejected" | "undecided";
