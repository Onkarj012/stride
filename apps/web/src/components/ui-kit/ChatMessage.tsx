import { useState } from "react";
import { motion } from "motion/react";
import { Check, Copy, Pencil } from "lucide-react";
import { useTypewriter } from "@/hooks/useTypewriter";
import { Markdown } from "@/components/primitives/Markdown";

export type Modality = "type" | "voice" | "photo" | "barcode" | "ocr";

const MODALITY_ICON: Record<Modality, React.ReactNode> = {
  type: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-4.5A8 8 0 1 1 21 12z" />
    </svg>
  ),
  voice: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" /><path d="M5 11v1a7 7 0 0 0 14 0v-1" /><path d="M12 19v3" />
    </svg>
  ),
  photo: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" />
    </svg>
  ),
  barcode: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6v12M8 6v12M11 6v12M14 6v12M18 6v12M21 6v12" />
    </svg>
  ),
  ocr: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10" />
    </svg>
  ),
};

export const MODALITY_LABEL: Record<Modality, string> = {
  type: "Type", voice: "Voice", photo: "Photo", barcode: "Scan", ocr: "Label",
};

export function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-ink/30 dark:bg-white/40"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export function ThinkingBubble() {
  return (
    <motion.div
      className="w-fit rounded-[16px] rounded-tl-[5px] bg-white dark:bg-[#1a1e2e] px-3 shadow-[0_8px_24px_rgba(13,16,27,0.06)]"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
    >
      <TypingDots />
    </motion.div>
  );
}

export interface ChatMessageProps {
  role: "user" | "ai";
  content: string;
  entrance?: boolean;
  fresh?: boolean;
  onEdit?: () => void;
  onCopy?: () => void;
  badge?: React.ReactNode;
  modality?: Modality;
  chip?: string;
}

export function ChatMessage({
  role, content, entrance = true, fresh = false, onEdit, onCopy, badge, modality, chip,
}: ChatMessageProps) {
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
      <motion.div
        className="flex flex-col items-end gap-1 group"
        initial={entrance ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
      >
        {modality && chip && (
        <div className="flex items-center justify-end gap-1.5 mb-1.5 text-ink/45 dark:text-white/45">
            <span className="h-3.5 w-3.5">{MODALITY_ICON[modality]}</span>
            <span className="text-[10px] font-extrabold uppercase tracking-wide">{MODALITY_LABEL[modality]} · {chip}</span>
          </div>
        )}
        <div className="max-w-[80%] rounded-[16px] rounded-br-[5px] bg-ink dark:bg-lavender px-3.5 py-2.5 text-[14px] font-medium leading-relaxed break-words text-white dark:text-ink shadow-[0_8px_24px_rgba(13,16,27,0.12)]">
          <span className="whitespace-pre-wrap">{text}</span>
        </div>
        <div className="flex items-center gap-2.5 mr-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
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
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex flex-col items-start gap-1 group max-w-[92%]"
      initial={entrance ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
    >
      {badge && <div className="mb-0.5">{badge}</div>}
      <div className="max-w-full text-[14px] font-medium leading-relaxed text-ink dark:text-surface/90 break-words">
        {showMarkdown
          ? <Markdown className="text-[14px] font-medium leading-relaxed text-ink dark:text-surface/90">{text}</Markdown>
          : <span className="whitespace-pre-wrap">{text}</span>}
      </div>
      <div className="flex items-center gap-2.5 ml-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
        <ActionBtn onClick={copyText}>
          {copied ? <Check className="h-3 w-3 text-mint" strokeWidth={2.5} /> : <Copy className="h-3 w-3" strokeWidth={2} />}
          {copied ? "Copied" : "Copy"}
        </ActionBtn>
      </div>
    </motion.div>
  );
}
