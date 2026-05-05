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

export type RootInfo = {
  id: number;
  glob: string;
  label: string;
  enabled: boolean;
  is_default: boolean;
  resolved_count: number;
  file_count: number;
};

export type ReviewMode = "approve_reject" | "rank" | "pick_one";

export type ReviewRequest = {
  id: string;
  paths: string[];
  prompt: string | null;
  mode: ReviewMode;
  timeout_seconds: number;
  context: Record<string, unknown> | null;
  created_at: number;
};

export type DecisionKind =
  | "approved"
  | "rejected"
  | "timeout"
  | "dismissed"
  | "picked"
  | "ranked";

export type PerItem = {
  path: string;
  verdict: string;
  stars?: number;
  note?: string;
};

export type ReviewDecision = {
  id: string;
  decision: DecisionKind;
  picked?: string | null;
  ranking?: string[] | null;
  per_item?: PerItem[] | null;
  note?: string | null;
  decided_at: string;
};
