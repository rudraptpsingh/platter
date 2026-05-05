import type { FileRow } from "../types";
import { basename } from "./api";

export type ReviewSet = {
  hero: FileRow;          // the index.html
  numbered: FileRow[];    // sorted by numeric prefix
  plan: FileRow | null;   // sibling .md
  others: FileRow[];      // anything else in the folder (rendered below)
};

const NUMBERED_PREFIX = /^(\d{1,3})[-_. ]/;

/**
 * Detect a "review set" in the file list of a folder. A review set is the
 * shape agents naturally produce when iterating on UI: an `index.html` hub,
 * a sequence of numbered HTML siblings (`01-foo.html`, `02-bar.html`), and
 * optionally a sibling markdown plan file.
 *
 * Returns null when the pattern doesn't match.
 */
export function detectReviewSet(files: FileRow[]): ReviewSet | null {
  if (files.length < 3) return null;

  const htmls = files.filter((f) => f.kind === "html" || f.kind === "htm");
  if (htmls.length < 3) return null;

  // Must have index.html (case-insensitive)
  const hero = htmls.find((f) => basename(f.path).toLowerCase() === "index.html");
  if (!hero) return null;

  // Must have at least 2 numbered HTML siblings
  const numbered = htmls
    .filter((f) => f.path !== hero.path && NUMBERED_PREFIX.test(basename(f.path)))
    .sort((a, b) => {
      const an = parseInt(basename(a.path).match(NUMBERED_PREFIX)?.[1] ?? "0", 10);
      const bn = parseInt(basename(b.path).match(NUMBERED_PREFIX)?.[1] ?? "0", 10);
      return an - bn;
    });
  if (numbered.length < 2) return null;

  // Optional plan: a sibling .md file. Prefer 00-* names, else first alphabetically.
  const mds = files.filter((f) => f.kind === "md");
  const plan =
    mds.find((f) => basename(f.path).toLowerCase().startsWith("00-")) ??
    mds.find((f) => /plan|notes|readme/i.test(basename(f.path))) ??
    mds[0] ??
    null;

  // Anything not classified above
  const claimed = new Set([hero.path, ...numbered.map((n) => n.path), plan?.path].filter(Boolean));
  const others = files.filter((f) => !claimed.has(f.path));

  return { hero, numbered, plan, others };
}

export function numberedPrefix(filename: string): string | null {
  const m = filename.match(NUMBERED_PREFIX);
  return m ? m[1].padStart(2, "0") : null;
}
