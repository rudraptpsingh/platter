import { ReactNode } from "react";

/**
 * Tiny markdown renderer — handles headings, paragraphs, lists, inline code,
 * bold, italic, links. Intentionally small (no remark/marked dep). Good enough
 * for plan files that sit next to mockups.
 */
export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return <>{blocks.map((b, i) => renderBlock(b, i))}</>;
}

type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; text: string; lang?: string }
  | { kind: "quote"; text: string }
  | { kind: "hr" };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim() || undefined;
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ kind: "code", text: buf.join("\n"), lang });
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      blocks.push({ kind: "h", level: h[1].length, text: h[2] });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", text: buf.join(" ") });
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Paragraph (collects until blank line or another block)
    if (line.trim() === "") {
      i++;
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !lines[i].startsWith(">") &&
      !lines[i].trim().startsWith("```") &&
      !/^---+$/.test(lines[i].trim())
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "p", text: buf.join(" ") });
  }

  return blocks;
}

function renderBlock(b: Block, i: number): ReactNode {
  switch (b.kind) {
    case "h": {
      const inline = renderInline(b.text);
      switch (b.level) {
        case 1: return <h1 key={i}>{inline}</h1>;
        case 2: return <h2 key={i}>{inline}</h2>;
        case 3: return <h3 key={i}>{inline}</h3>;
        case 4: return <h4 key={i}>{inline}</h4>;
        case 5: return <h5 key={i}>{inline}</h5>;
        default: return <h6 key={i}>{inline}</h6>;
      }
    }
    case "p":
      return <p key={i}>{renderInline(b.text)}</p>;
    case "ul":
      return (
        <ul key={i}>
          {b.items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={i}>
          {b.items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ol>
      );
    case "code":
      return (
        <pre key={i} className="md-code">
          <code data-lang={b.lang}>{b.text}</code>
        </pre>
      );
    case "quote":
      return <blockquote key={i}>{renderInline(b.text)}</blockquote>;
    case "hr":
      return <hr key={i} />;
  }
}

/**
 * Inline formatting: **bold**, *italic*, `code`, [link](url).
 * Not a full parser — designed to be safe & predictable for plan text.
 */
function renderInline(text: string): ReactNode {
  // Tokenize via a single regex with alternation
  const tokens: ReactNode[] = [];
  const re =
    /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push(text.slice(last, m.index));
    if (m[1]) tokens.push(<code key={key++}>{m[1]}</code>);
    else if (m[2]) tokens.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3]) tokens.push(<em key={key++}>{m[3]}</em>);
    else if (m[4] && m[5])
      tokens.push(
        <a key={key++} href={m[5]} target="_blank" rel="noreferrer">
          {m[4]}
        </a>
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return tokens.length === 1 ? tokens[0] : tokens;
}
