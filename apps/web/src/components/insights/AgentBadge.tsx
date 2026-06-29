import type { Agent } from "@/lib/storage";
import { AGENT_META } from "@/data/mock";
import { cn } from "@/lib/utils";

const TONE_TO_BG: Record<string, string> = {
  peach: "bg-peach/40",
  lavender: "bg-lavender/40",
  sky: "bg-sky/40",
  mint: "bg-mint/40",
  bubblegum: "bg-bubblegum/40",
};

export function AgentBadge({ agent, className }: { agent: Agent; className?: string }) {
  const meta = AGENT_META[agent];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
        "border border-border text-[11px] font-semibold text-text",
        TONE_TO_BG[meta.tone] ?? "bg-card",
        className,
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2} />
      {meta.label}
    </span>
  );
}
