import { useState } from "react";
import { Check, Copy, Pencil } from "lucide-react";
import { useTypewriter } from "@/hooks/useTypewriter";
import { Markdown } from "@/components/primitives/Markdown";

export function MessageBubble({
  role, content, fresh, onEdit, onCopy, badge,
}: {
  role: "user" | "ai"; content: string; fresh: boolean;
  onEdit?: () => void; onCopy?: () => void; badge?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const { displayed, done } = useTypewriter(content, 18, fresh);
  const text = fresh ? displayed : content;
  const showMarkdown = !fresh || done;

  const copyText = () => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onCopy?.();
  };

  const ActionBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text transition-colors">
      {children}
    </button>
  );

  if (role === "user") {
    return (
      <div className="flex flex-col items-end gap-1 group">
        <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-[var(--color-bubble-user)] px-3.5 py-2.5 text-[0.95rem] leading-relaxed break-words text-[var(--color-bubble-user-text)]">
          <span className="whitespace-pre-wrap">{text}</span>
        </div>
        <div className="flex items-center gap-2.5 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionBtn onClick={copyText}>
            {copied ? <Check className="h-3 w-3 text-mint" strokeWidth={2.5} /> : <Copy className="h-3 w-3" strokeWidth={2} />}
            {copied ? "Copied" : "Copy"}
          </ActionBtn>
          {onEdit && (
            <ActionBtn onClick={onEdit}>
              <Pencil className="h-3 w-3" strokeWidth={2} />
              Edit
            </ActionBtn>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1 group">
      <div className="max-w-[86%] rounded-2xl rounded-bl-sm bg-card shadow-[var(--shadow-soft)] px-3.5 py-2.5 text-[0.95rem] leading-relaxed text-text break-words">
        {showMarkdown
          ? <Markdown className="text-[0.95rem] leading-relaxed">{text}</Markdown>
          : <span className="whitespace-pre-wrap">{text}</span>}
      </div>
      <div className="flex items-center gap-2.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {badge}
        <ActionBtn onClick={copyText}>
          {copied ? <Check className="h-3 w-3 text-mint" strokeWidth={2.5} /> : <Copy className="h-3 w-3" strokeWidth={2} />}
          {copied ? "Copied" : "Copy"}
        </ActionBtn>
      </div>
    </div>
  );
}
