import { useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import type { ConfirmationCardData, ConfirmationMacroData } from "@stride/shared";
import { cn } from "@/lib/utils";
import {
  CHAT_CARD_BODY,
  CHAT_CARD_EYEBROW,
  CHAT_CARD_FIELD,
  CHAT_CARD_ICON_BUTTON,
  CHAT_CARD_META,
  CHAT_CARD_PILL,
  CHAT_CARD_ROW,
  CHAT_CARD_SURFACE,
  CHAT_CARD_TITLE,
} from "./cardSizing";

export type ConfirmationDecision = {
  ordinal: number;
  action: "confirm" | "discard";
  edits?: {
    date?: string;
    description?: string;
    macros?: Pick<ConfirmationMacroData, "calories" | "protein" | "carbs" | "fat">;
  };
};

type Props = {
  data: ConfirmationCardData;
  /** A confirm/discard round-trip is in flight for this group. */
  pending?: boolean;
  /** The group is already committed, discarded, or expired — render read-only. */
  resolved?: boolean;
  now?: number;
  onConfirm?: (groupId: string, decisions: ConfirmationDecision[]) => void;
};

type Draft = {
  ordinal: number;
  selected: boolean;
  date: string;
  description: string;
  macros?: ConfirmationMacroData;
};

function confidenceBand(confidence?: number): string | null {
  if (confidence == null) return null;
  return confidence >= 0.8 ? "high confidence" : confidence >= 0.6 ? "medium confidence" : "low confidence";
}

export function ConfirmationCard({ data, pending = false, resolved = false, now = Date.now(), onConfirm }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>(() => data.items.map((item) => ({
    ordinal: item.ordinal,
    selected: true,
    date: item.date ?? "",
    description: item.description ?? item.title,
    macros: item.macros ? { ...item.macros, estimate: item.macros.estimate ? { ...item.macros.estimate } : undefined } : undefined,
  })));

  const expired = data.expiresAt <= now;
  const readOnly = resolved || expired;
  const draftFor = (ordinal: number) => drafts.find((draft) => draft.ordinal === ordinal);
  const patchDraft = (ordinal: number, patch: Partial<Draft>) =>
    setDrafts((current) => current.map((draft) => draft.ordinal === ordinal ? { ...draft, ...patch } : draft));

  function submit(mode: "all" | "selected" | "discard") {
    if (!onConfirm) return;
    onConfirm(data.groupId, drafts.map((draft) => {
      const item = data.items.find((candidate) => candidate.ordinal === draft.ordinal);
      const confirm = mode === "all" ? true : mode === "discard" ? false : draft.selected;
      if (!confirm) return { ordinal: draft.ordinal, action: "discard" as const };
      const originalDescription = item?.description ?? item?.title;
      return {
        ordinal: draft.ordinal,
        action: "confirm" as const,
        edits: {
          date: draft.date || undefined,
          description: draft.description !== originalDescription ? draft.description : undefined,
          macros: draft.macros
            ? {
                calories: draft.macros.calories,
                protein: draft.macros.protein,
                carbs: draft.macros.carbs,
                fat: draft.macros.fat,
              }
            : undefined,
        },
      };
    }));
  }

  return (
    <section
      data-card-kind="confirmation"
      data-card-state={readOnly ? "resolved" : "active"}
      aria-label="Review these actions"
      className={cn(CHAT_CARD_SURFACE, readOnly && "opacity-80")}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className={CHAT_CARD_TITLE}>Review these actions</p>
          <p className={cn(CHAT_CARD_META, "mt-1")}>
            {readOnly
              ? "This batch is closed — nothing here is waiting on you."
              : "Edit details or remove anything you do not want to save."}
          </p>
        </div>
        {readOnly && (
          <span className="shrink-0 rounded-full bg-ink/6 px-2.5 py-1 text-[13px] font-extrabold uppercase tracking-[0.04em] text-ink/50 dark:bg-white/8 dark:text-white/50">
            {expired ? "Expired" : "Resolved"}
          </span>
        )}
      </div>

      <ul className="space-y-2.5">
        {data.items.map((item) => {
          const draft = draftFor(item.ordinal);
          const band = confidenceBand(item.confidence);
          return (
            <li key={item.ordinal} className={CHAT_CARD_ROW}>
              <div className="flex items-start gap-2">
                {!readOnly && (
                  <button
                    type="button"
                    aria-label={`Include ${item.title}`}
                    aria-pressed={draft?.selected ?? true}
                    disabled={pending}
                    onClick={() => patchDraft(item.ordinal, { selected: !(draft?.selected ?? true) })}
                    className={cn(CHAT_CARD_ICON_BUTTON, "text-ink dark:text-surface")}
                  >
                    <span className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full border",
                      draft?.selected ? "border-lavender bg-lavender text-ink" : "border-ink/25 text-transparent dark:border-white/25",
                    )}>
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  </button>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={CHAT_CARD_EYEBROW}>{item.actionType}</span>
                    {band && (
                      <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[13px] font-bold text-ink/55 dark:bg-white/8 dark:text-white/55">{band}</span>
                    )}
                  </div>
                  {readOnly ? (
                    <p className={CHAT_CARD_BODY}>{item.description ?? item.title}</p>
                  ) : (
                    <input
                      aria-label={`Description for ${item.title}`}
                      value={draft?.description ?? ""}
                      disabled={pending}
                      onChange={(event) => patchDraft(item.ordinal, { description: event.target.value })}
                      className={cn(CHAT_CARD_FIELD, "w-full")}
                    />
                  )}
                  {draft?.macros && (
                    <div className="space-y-2 rounded-xl bg-card-elev px-3 py-2.5">
                      {draft.macros.conflict && <p className="text-[13px] font-bold text-peach">Macro check</p>}
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {([
                          ["Calories", "calories", "kcal"],
                          ["Protein", "protein", "g"],
                          ["Carbs", "carbs", "g"],
                          ["Fat", "fat", "g"],
                        ] as const).map(([label, field, unit]) => (
                          <label key={field} className="flex min-w-0 flex-col gap-1 text-[12px] font-semibold text-text-muted">
                            {label}
                            {readOnly ? (
                              <span className="text-[15px] font-extrabold text-text">{draft.macros?.[field]} <span className="text-[11px] font-medium">{unit}</span></span>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                aria-label={`${label} for ${item.title}`}
                                value={draft.macros?.[field] ?? 0}
                                disabled={pending}
                                onChange={(event) => patchDraft(item.ordinal, {
                                  macros: draft.macros ? { ...draft.macros, [field]: Number(event.target.value) } : undefined,
                                })}
                                className={cn(CHAT_CARD_FIELD, "w-full")}
                              />
                            )}
                          </label>
                        ))}
                      </div>
                      {!readOnly && draft.macros.estimate && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            const macros = draft.macros;
                            const estimate = macros?.estimate;
                            if (!macros || !estimate) return;
                            const usingEstimate = macros.calories === estimate.calories
                              && macros.protein === estimate.protein
                              && macros.carbs === estimate.carbs
                              && macros.fat === estimate.fat;
                            const source = usingEstimate ? (macros.reported ?? macros) : estimate;
                            const target: ConfirmationMacroData = {
                              calories: source.calories,
                              protein: source.protein,
                              carbs: source.carbs,
                              fat: source.fat,
                              reported: macros.reported,
                              estimate: macros.estimate,
                              conflict: macros.conflict,
                            };
                            patchDraft(item.ordinal, {
                              macros: target,
                            });
                          }}
                          className={cn(CHAT_CARD_PILL, "border border-peach/40 bg-card text-text")}
                        >
                          {draft.macros.calories === draft.macros.estimate.calories
                            && draft.macros.protein === draft.macros.estimate.protein
                            && draft.macros.carbs === draft.macros.estimate.carbs
                            && draft.macros.fat === draft.macros.estimate.fat
                            ? "Use my numbers"
                            : "Use my estimate"}
                        </button>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {readOnly ? (
                      item.date && <span className={CHAT_CARD_META}>{item.date}</span>
                    ) : (
                      <input
                        type="date"
                        aria-label={`Date for ${item.title}`}
                        value={draft?.date ?? ""}
                        disabled={pending}
                        onChange={(event) => patchDraft(item.ordinal, { date: event.target.value })}
                        className={CHAT_CARD_FIELD}
                      />
                    )}
                    {item.validationMessages.length > 0 && (
                      <span className={CHAT_CARD_META}>{item.validationMessages.join(" · ")}</span>
                    )}
                  </div>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => patchDraft(item.ordinal, { selected: false })}
                    aria-label={`Remove ${item.title}`}
                    className={cn(CHAT_CARD_ICON_BUTTON, "text-ink/40 hover:text-bubblegum dark:text-white/40")}
                  >
                    <X className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!readOnly && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => submit("all")}
            className={cn(CHAT_CARD_PILL, "bg-ink text-white dark:bg-lavender dark:text-ink")}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.6} />{pending ? "Saving…" : "Confirm all"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit("selected")}
            className={cn(CHAT_CARD_PILL, "border border-lavender/50 text-ink dark:text-lavender")}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.6} />Confirm selected
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit("discard")}
            className={cn(CHAT_CARD_PILL, "border border-bubblegum/30 text-bubblegum")}
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.3} />Discard all
          </button>
        </div>
      )}
    </section>
  );
}
