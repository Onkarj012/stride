import { useMemo, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfirmationItem = {
  actionType: string;
  description: string;
  resolvedDate?: string;
  confidence?: number;
  provenance: string;
  validation: { status: "valid" | "warning" | "error"; messages: string[] };
  ordinal: number;
};

export type ConfirmationPayload = { groupId: string; items: ConfirmationItem[] };

export type ConfirmationDecision = {
  ordinal: number;
  action: "confirm" | "discard";
  edits?: { date?: string; description?: string; payload?: Record<string, unknown> };
};

export type ConfirmationResult = {
  status: string;
  results?: Array<{ ordinal: number; actionType: string; status: string; error?: string }>;
};

type Props = {
  payload: ConfirmationPayload;
  pending?: boolean;
  result?: ConfirmationResult;
  onConfirm: (decisions: ConfirmationDecision[]) => void;
};

type Draft = ConfirmationItem & { selected: boolean; date: string; descriptionDraft: string };

export function ConfirmationCard({ payload, pending = false, result, onConfirm }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>(() => payload.items.map((item) => ({
    ...item,
    selected: true,
    date: item.resolvedDate ?? "",
    descriptionDraft: item.description,
  })));
  const resultByOrdinal = useMemo(
    () => new Map((result?.results ?? []).map((item) => [item.ordinal, item])),
    [result],
  );
  const expired = result?.status === "expired";
  const disabled = pending || expired;

  function decisions(mode: "all" | "selected" | "discard") {
    onConfirm(drafts.map((item) => {
      const confirm = mode === "all" ? true : mode === "discard" ? false : item.selected;
      return {
        ordinal: item.ordinal,
        action: confirm ? "confirm" : "discard",
        ...(confirm ? {
          edits: {
            date: item.date || undefined,
            description: item.descriptionDraft !== item.description ? item.descriptionDraft : undefined,
          },
        } : {}),
      };
    }));
  }

  return (
    <div className={cn(
      "max-w-[92%] rounded-[16px] border bg-white p-3.5 shadow-[0_8px_24px_rgba(13,16,27,0.06)] dark:bg-[#1a1e2e]",
      expired ? "border-ink/10 opacity-70 dark:border-white/10" : "border-ink/8 dark:border-white/10",
    )}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-extrabold text-ink dark:text-surface">Review these actions</p>
          <p className="mt-0.5 text-[11px] text-ink/45 dark:text-white/45">Edit details or remove anything you do not want to save.</p>
        </div>
        {expired && <span className="rounded-full bg-ink/6 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-ink/50 dark:bg-white/8 dark:text-white/50">Expired</span>}
      </div>

      <div className="space-y-2.5">
        {drafts.map((item) => {
          const memberResult = resultByOrdinal.get(item.ordinal);
          const failed = memberResult?.status === "failed";
          const committed = memberResult?.status === "committed" || memberResult?.status === "already_committed";
          const discarded = memberResult?.status === "discarded";
          return (
            <div key={item.ordinal} className={cn("rounded-[12px] border p-2.5", failed ? "border-bubblegum/40 bg-bubblegum/5" : "border-ink/8 dark:border-white/10", committed || discarded ? "opacity-60" : "")}>
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  aria-label={`Include ${item.description}`}
                  aria-pressed={item.selected}
                  disabled={disabled || committed || discarded}
                  onClick={() => setDrafts((current) => current.map((draft) => draft.ordinal === item.ordinal ? { ...draft, selected: !draft.selected } : draft))}
                  className={cn("mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", item.selected ? "border-lavender bg-lavender text-ink" : "border-ink/20 text-transparent dark:border-white/20")}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </button>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-ink/45 dark:text-white/45">{item.actionType}</span>
                    <span className="rounded-full bg-ink/5 px-1.5 py-0.5 text-[10px] font-bold text-ink/55 dark:bg-white/8 dark:text-white/55">{item.provenance.replaceAll("_", " ")}{item.confidence != null ? ` · ${item.confidence >= 0.8 ? "high" : item.confidence >= 0.6 ? "medium" : "low"} confidence` : ""}</span>
                  </div>
                  <input
                    aria-label="Action description"
                    value={item.descriptionDraft}
                    disabled={disabled || committed || discarded}
                    onChange={(event) => setDrafts((current) => current.map((draft) => draft.ordinal === item.ordinal ? { ...draft, descriptionDraft: event.target.value } : draft))}
                    className="w-full rounded-[8px] border border-ink/10 bg-surface px-2 py-1.5 text-[12px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-lavender/40 dark:border-white/10 dark:bg-[#0b0d15] dark:text-surface"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      aria-label="Resolved date"
                      value={item.date}
                      disabled={disabled || committed || discarded}
                      onChange={(event) => setDrafts((current) => current.map((draft) => draft.ordinal === item.ordinal ? { ...draft, date: event.target.value } : draft))}
                      className="h-7 rounded-[8px] border border-ink/10 bg-surface px-2 text-[11px] font-medium text-ink focus:outline-none focus:ring-2 focus:ring-lavender/40 dark:border-white/10 dark:bg-[#0b0d15] dark:text-surface"
                    />
                    <span className={cn("text-[10px] font-bold uppercase tracking-wide", item.validation.status === "valid" ? "text-mint" : "text-peach")}>{item.validation.status}</span>
                    {item.validation.messages.length > 0 && <span className="text-[10px] text-ink/50 dark:text-white/45">{item.validation.messages.join(" · ")}</span>}
                  </div>
                  {failed && <p className="text-[11px] font-semibold text-bubblegum">Unresolved: {memberResult?.error ?? "Could not save this item"}</p>}
                </div>
                {!committed && !discarded && (
                  <button type="button" disabled={disabled} onClick={() => setDrafts((current) => current.map((draft) => draft.ordinal === item.ordinal ? { ...draft, selected: false } : draft))} aria-label="Remove item" className="text-ink/35 hover:text-bubblegum dark:text-white/35">
                    <X className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!expired && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={disabled} onClick={() => decisions("all")} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[12px] font-extrabold text-white disabled:opacity-35 dark:bg-lavender dark:text-ink">
            <Check className="h-3 w-3" strokeWidth={2.6} />{pending ? "Saving…" : "Confirm all"}
          </button>
          <button type="button" disabled={disabled} onClick={() => decisions("selected")} className="inline-flex items-center gap-1.5 rounded-full border border-lavender/50 px-3 py-1.5 text-[12px] font-extrabold text-ink disabled:opacity-35 dark:text-lavender">
            <Check className="h-3 w-3" strokeWidth={2.6} />Confirm selected
          </button>
          <button type="button" disabled={disabled} onClick={() => decisions("discard")} className="inline-flex items-center gap-1.5 rounded-full border border-bubblegum/30 px-3 py-1.5 text-[12px] font-extrabold text-bubblegum disabled:opacity-35">
            <RotateCcw className="h-3 w-3" strokeWidth={2.3} />Discard all
          </button>
        </div>
      )}
      {result && !expired && result.status !== "pending" && <p className="mt-2 text-[11px] font-semibold text-ink/50 dark:text-white/45">Group status: {result.status}</p>}
    </div>
  );
}
