import { api } from "./api";

// Kinds whose contents are plain text and worth copying as source.
// Anything not in this set falls back to "open in browser" / "reveal".
const COPYABLE_TEXT_KINDS = new Set([
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "less",
  "js",
  "mjs",
  "ts",
  "tsx",
  "jsx",
  "json",
  "md",
  "markdown",
  "txt",
  "svg",
  "yaml",
  "yml",
  "toml",
  "xml",
  "csv",
  "rs",
  "py",
  "go",
  "rb",
  "swift",
  "kt",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "sh",
  "bash",
  "zsh",
  "vue",
  "astro",
  "svelte",
]);

export function isTextCopyable(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return COPYABLE_TEXT_KINDS.has(ext);
}

/**
 * Read the file's contents and copy as plain text to the clipboard.
 * Throws if the file isn't text-copyable, or if the clipboard write fails.
 * Returns line count + char count so the caller can build a useful toast.
 */
export async function copySourceToClipboard(
  path: string,
): Promise<{ lines: number; chars: number }> {
  if (!isTextCopyable(path)) {
    throw new Error(`Not a text file — can't copy ${path.split("/").pop()}`);
  }
  const text = await api.readTextFile(path);
  await navigator.clipboard.writeText(text);
  const lines = text.split("\n").length;
  return { lines, chars: text.length };
}

/**
 * For HTML files, copy as a markdown fenced block — useful for pasting
 * into a PR description, Linear ticket, or chat.
 */
export async function copySourceAsMarkdown(
  path: string,
): Promise<{ lines: number; chars: number }> {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  if (!isTextCopyable(path)) {
    throw new Error(`Not a text file — can't copy ${path.split("/").pop()}`);
  }
  const text = await api.readTextFile(path);
  const filename = path.split("/").pop() ?? path;
  const lang = LANG_FOR_EXT[ext] ?? ext;
  const md = `**\`${filename}\`**\n\n\`\`\`${lang}\n${text}\n\`\`\`\n`;
  await navigator.clipboard.writeText(md);
  const lines = text.split("\n").length;
  return { lines, chars: md.length };
}

const LANG_FOR_EXT: Record<string, string> = {
  htm: "html",
  mjs: "js",
  jsx: "jsx",
  tsx: "tsx",
  yml: "yaml",
  md: "md",
  markdown: "md",
  rs: "rust",
  py: "python",
  rb: "ruby",
  swift: "swift",
  sh: "bash",
  zsh: "bash",
};
