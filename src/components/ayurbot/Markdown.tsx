import React from 'react';

/* ---------- tiny, safe markdown renderer (no HTML injection) ---------- */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={`${keyPrefix}-${i}`} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={`${keyPrefix}-${i}`}>{part.slice(1, -1)}</em>;
    return <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>;
  });
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={`l-${blocks.length}`} className={`${list.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}>
        {list.items.map((it, i) => (
          <li key={i}>{renderInline(it, `li-${blocks.length}-${i}`)}</li>
        ))}
      </Tag>
    );
    list = null;
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet || numbered)![1]);
      return;
    }
    flush();
    if (!trimmed) return;
    if (/^-{3,}$|^\*{3,}$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${idx}`} className="border-line" />);
      return;
    }
    const heading = trimmed.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      blocks.push(
        <p key={`h-${idx}`} className="pt-1 font-semibold text-ink">
          {renderInline(heading[1], `h-${idx}`)}
        </p>
      );
      return;
    }
    blocks.push(<p key={`p-${idx}`}>{renderInline(trimmed, `p-${idx}`)}</p>);
  });
  flush();
  return <div className="space-y-2.5">{blocks}</div>;
}

