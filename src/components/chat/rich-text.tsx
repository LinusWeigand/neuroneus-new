import { Fragment, type ReactNode } from "react";
import { AGENTS } from "@/lib/agents";

// A deliberately tiny, safe renderer for agent messages: `code`, **bold**, [links](https://…)
// and @mentions. No HTML injection, no full markdown: agents write Slack-style plain text.

const names = AGENTS.map((a) => a.name).join("|");
const TOKEN = new RegExp(
  "(`[^`\\n]+`)|(\\*\\*[^*\\n]+\\*\\*)|(\\[[^\\]\\n]+\\]\\(https?:\\/\\/[^\\s)]+\\))|(@(?:" + names + ")\\b)",
  "gi",
);

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(<Fragment key={key++}>{text.slice(last, idx)}</Fragment>);
    const [tok] = m;
    if (m[1]) {
      out.push(
        <code key={key++} className="rounded-xs bg-surface-strong px-1 py-px font-mono text-[0.86em] text-body-strong">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      out.push(
        <strong key={key++} className="font-medium text-ink">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (m[3]) {
      const label = tok.slice(1, tok.indexOf("]("));
      const href = tok.slice(tok.indexOf("](") + 2, -1);
      out.push(
        <a key={key++} href={href} target="_blank" rel="noreferrer" className="text-ink underline decoration-hairline-strong underline-offset-4 hover:decoration-ink">
          {label}
        </a>,
      );
    } else if (m[4]) {
      out.push(
        <span key={key++} className="rounded-xs bg-surface-strong px-1 font-medium text-ink">
          {tok}
        </span>,
      );
    }
    last = idx + tok.length;
  }
  if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return <span className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${className}`}>{out}</span>;
}
