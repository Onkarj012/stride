import { useState } from "react";
import { AlertTriangle, Check, Copy, RotateCcw } from "lucide-react";
import {
  isChatTurnCard,
  type ChatTurnCard,
  type ChatTurnOutcome,
  type ClarificationCardData,
  type DuplicateCardData,
  type FailureCardData,
  type ResultCardData,
  type UndoCardData,
} from "@stride/shared";
import { cn, localDateStr } from "@/lib/utils";
import { ConfirmationCard, type ConfirmationDecision } from "./ConfirmationCard";
import {
  CHAT_CARD_BAND,
  CHAT_CARD_BODY,
  CHAT_CARD_EYEBROW,
  CHAT_CARD_FIELD,
  CHAT_CARD_META,
  CHAT_CARD_PILL,
  CHAT_CARD_ROW,
  CHAT_CARD_SURFACE,
  CHAT_CARD_TITLE,
} from "./cardSizing";

export type { ConfirmationDecision };

export type ChatTurnResolution = {
  content: string;
  turnContractVersion: 1;
  turnOutcome: ChatTurnOutcome;
  turnCards: ChatTurnCard[];
  actionGroupId: string;
  actionIds: string[];
};

/** Callbacks a surface wires to Convex. Every one is optional: a card whose */
/** handler is missing renders as a durable record without live controls. */
export type ChatCardHandlers = {
  onConfirm?: (groupId: string, decisions: ConfirmationDecision[]) => void;
  onClarify?: (groupId: string, date: string) => void;
  onUndoItem?: (groupId: string, actionId: string) => void;
  onUndoAll?: (groupId: string) => void;
  onLogAnyway?: (
    groupId: string,
    item: DuplicateCardData["items"][number],
  ) => Promise<ChatTurnResolution | void>;
};

/** Transient UI state layered on top of the persisted cards. */
export type ChatCardState = {
  /** Groups with a confirm/clarify round-trip in flight. */
  pendingGroupIds?: ReadonlySet<string>;
  /** Actions with an undo or "log anyway" round-trip in flight. */
  pendingActionIds?: ReadonlySet<string>;
  /** Groups already resolved in this session (before the query catches up). */
  resolvedGroupIds?: ReadonlySet<string>;
  now?: number;
};

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Validate persisted card data before rendering. Historical messages carry no
 * cards, and anything that does not satisfy the contract is dropped rather
 * than rendered half-formed.
 */
export function parseChatTurnCards(value: unknown): ChatTurnCard[] {
  if (!Array.isArray(value)) return [];
  return value.filter((card): card is ChatTurnCard => isChatTurnCard(card));
}

function itemDateLine(item: { date?: string; time?: string }): string | null {
  if (!item.date && !item.time) return null;
  return [item.date, item.time].filter(Boolean).join(" · ");
}

function ItemHeader({ actionType, title }: { actionType: string; title: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={CHAT_CARD_EYEBROW}>{actionType}</span>
      <span className={cn(CHAT_CARD_BODY, "font-semibold")}>{title}</span>
    </div>
  );
}

/* ── Result ──────────────────────────────────────────────────────────────── */

function ResultCard({ data }: { data: ResultCardData }) {
  const committed = data.items.filter((item) => item.status === "committed");
  const failed = data.items.filter((item) => item.status === "failed");
  const resolved = data.items.filter((item) => item.status === "discarded" || item.status === "expired");
  return (
    <section data-card-kind="result" data-card-state="resolved" aria-label="Logged" className={CHAT_CARD_SURFACE}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className={CHAT_CARD_TITLE}>
            {committed.length > 0 ? `Logged ${committed.length} item${committed.length === 1 ? "" : "s"}` : "Nothing was logged"}
          </p>
          <p className={cn(CHAT_CARD_META, "mt-1")}>
            {failed.length > 0
              ? `${failed.length} item${failed.length === 1 ? "" : "s"} could not be saved.`
              : resolved.length > 0 && committed.length === 0
                ? `${resolved.length} item${resolved.length === 1 ? "" : "s"} were resolved without being saved.`
                : "Saved to your log — undo below if this isn't right."}
          </p>
        </div>
        {committed.length > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-mint/20 px-2.5 py-1 text-[13px] font-extrabold uppercase tracking-[0.04em] text-ink/70 dark:text-mint">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />Saved
          </span>
        )}
      </div>
      <ul className="space-y-2.5">
        {data.items.map((item) => {
          const dateLine = itemDateLine(item);
          return (
            <li
              key={`${item.ordinal}-${item.status}`}
              data-result-status={item.status}
              className={cn(CHAT_CARD_ROW, item.status === "failed" && "border-bubblegum/40 bg-bubblegum/5", (item.status === "discarded" || item.status === "expired") && "opacity-70")}
            >
              <ItemHeader actionType={item.actionType} title={item.title} />
              {item.description && item.description !== item.title && (
                <p className={cn(CHAT_CARD_META, "mt-1")}>{item.description}</p>
              )}
              <p className={cn(CHAT_CARD_META, "mt-1")}>
                {item.status === "committed"
                  ? [dateLine, `saved to ${item.record.table}`].filter(Boolean).join(" · ")
                  : [dateLine, item.status === "expired" ? "Confirmation expired" : item.status === "discarded" ? "Discarded" : item.reason].filter(Boolean).join(" · ")}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── Undo ────────────────────────────────────────────────────────────────── */

function UndoCard({ data, handlers, state }: { data: UndoCardData; handlers: ChatCardHandlers; state: ChatCardState }) {
  const pendingActionIds = state.pendingActionIds ?? EMPTY_SET;
  const available = data.items.filter((item) => item.state === "available");
  const groupPending = pendingActionIds.has(`group:${data.groupId}`);
  const allResolved = available.length === 0;
  return (
    <section
      data-card-kind="undo"
      data-card-state={allResolved ? "resolved" : "active"}
      aria-label="Undo logged items"
      className={CHAT_CARD_SURFACE}
    >
      <p className={CHAT_CARD_TITLE}>{allResolved ? "Undo history" : "Undo this log"}</p>
      <p className={cn(CHAT_CARD_META, "mt-1")}>
        {allResolved ? "These entries are no longer active." : "Reverses the entry in your log."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {available.length > 1 && handlers.onUndoAll && (
          <button
            type="button"
            disabled={groupPending}
            onClick={() => handlers.onUndoAll?.(data.groupId)}
            className={cn(CHAT_CARD_PILL, "border border-bubblegum/30 text-bubblegum hover:bg-bubblegum/10")}
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.4} />{groupPending ? "Undoing all…" : "Undo all"}
          </button>
        )}
        {data.items.map((item) => {
          const pending = pendingActionIds.has(item.actionId);
          const resolved = item.state !== "available";
          const disabled = resolved || pending || !handlers.onUndoItem;
          return (
            <button
              key={item.actionId}
              type="button"
              data-undo-state={item.state}
              disabled={disabled}
              onClick={() => handlers.onUndoItem?.(data.groupId, item.actionId)}
              className={cn(
                CHAT_CARD_PILL,
                "border",
                disabled
                  ? "border-ink/10 text-ink/40 dark:border-white/10 dark:text-white/35"
                  : "border-bubblegum/30 text-bubblegum hover:bg-bubblegum/10",
              )}
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.4} />
              {item.state === "undone"
                ? `${item.title} reversed`
                : item.state === "expired"
                  ? `${item.title} — undo expired`
                  : pending
                    ? `Undoing ${item.title}…`
                    : `Undo ${item.title}`}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ── Clarification ───────────────────────────────────────────────────────── */

function ClarificationCard({
  data,
  handlers,
  state,
}: {
  data: ClarificationCardData;
  handlers: ChatCardHandlers;
  state: ChatCardState;
}) {
  const [date, setDate] = useState(() => data.items[0]?.date ?? localDateStr());
  const pending = (state.pendingGroupIds ?? EMPTY_SET).has(data.groupId);
  const resolved = (state.resolvedGroupIds ?? EMPTY_SET).has(data.groupId);
  const readOnly = resolved || !handlers.onClarify;

  return (
    <section
      data-card-kind="clarification"
      data-card-state={readOnly ? "resolved" : "active"}
      aria-label="Needs one more detail"
      className={cn(CHAT_CARD_SURFACE, readOnly && "opacity-80")}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className={CHAT_CARD_TITLE}>{resolved ? "Clarification resolved" : "Needs one more detail"}</p>
        {resolved && (
          <span className="shrink-0 rounded-full bg-ink/6 px-2.5 py-1 text-[13px] font-extrabold uppercase tracking-[0.04em] text-ink/50 dark:bg-white/8 dark:text-white/50">Resolved</span>
        )}
      </div>
      <ul className="space-y-2.5">
        {data.items.map((item) => (
          <li key={item.actionId} className={CHAT_CARD_ROW}>
            <ItemHeader actionType={item.actionType} title={item.title} />
            <p className={cn(CHAT_CARD_META, "mt-1")}>{item.reason}</p>
          </li>
        ))}
      </ul>
      <p className={cn(CHAT_CARD_BODY, "mt-3")}>{data.prompt}</p>
      {!readOnly && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="Date for these items"
            value={date}
            disabled={pending}
            onChange={(event) => setDate(event.target.value)}
            className={CHAT_CARD_FIELD}
          />
          <button
            type="button"
            disabled={pending || !date}
            onClick={() => handlers.onClarify?.(data.groupId, date)}
            className={cn(CHAT_CARD_PILL, "bg-ink text-white dark:bg-lavender dark:text-ink")}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.6} />{pending ? "Saving…" : "Save with this date"}
          </button>
        </div>
      )}
      {!readOnly && <p className={cn(CHAT_CARD_META, "mt-2")}>Or just tell me the date in chat.</p>}
    </section>
  );
}

/* ── Duplicate ───────────────────────────────────────────────────────────── */

function DuplicateCard({
  data,
  handlers,
  state,
}: {
  data: DuplicateCardData;
  handlers: ChatCardHandlers;
  state: ChatCardState;
}) {
  const pendingActionIds = state.pendingActionIds ?? EMPTY_SET;
  return (
    <section
      data-card-kind="duplicate"
      data-card-state={handlers.onLogAnyway ? "active" : "resolved"}
      aria-label="Possible duplicate"
      className={CHAT_CARD_SURFACE}
    >
      <div className="mb-3 flex items-start gap-2">
        <Copy className="mt-0.5 h-4 w-4 shrink-0 text-peach" strokeWidth={2.2} />
        <div>
          <p className={CHAT_CARD_TITLE}>Possible duplicate</p>
          <p className={cn(CHAT_CARD_META, "mt-1")}>
            {handlers.onLogAnyway
              ? "These look like entries you already have. Log them anyway if they're separate."
              : "These were skipped because they look like entries you already have. Send them again to log them anyway."}
          </p>
        </div>
      </div>
      <ul className="space-y-2.5">
        {data.items.map((item) => {
          const pending = pendingActionIds.has(item.actionId);
          return (
            <li key={item.actionId} className={CHAT_CARD_ROW}>
              <ItemHeader actionType={item.actionType} title={item.title} />
              <p className={cn(CHAT_CARD_META, "mt-1")}>{item.reason}</p>
              {handlers.onLogAnyway && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handlers.onLogAnyway?.(data.groupId, item)}
                  className={cn(
                    CHAT_CARD_PILL,
                    "mt-2 border",
                    pending
                      ? "border-ink/10 text-ink/40 dark:border-white/10 dark:text-white/35"
                      : "border-peach/50 text-ink dark:text-peach",
                  )}
                >
                  {pending ? "Logging…" : "Log anyway"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── Failure ─────────────────────────────────────────────────────────────── */

function FailureCard({ data }: { data: FailureCardData }) {
  return (
    <section data-card-kind="failure" data-card-state="resolved" aria-label="Log failed" className={cn(CHAT_CARD_SURFACE, "border-bubblegum/40")}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bubblegum" strokeWidth={2.2} />
        <div className="min-w-0">
          <p className={CHAT_CARD_TITLE}>Nothing was logged</p>
          <p className={cn(CHAT_CARD_BODY, "mt-1")}>{data.message}</p>
          <p className={cn(CHAT_CARD_META, "mt-1")}>
            {data.retriable ? "Send it again — retries are safe and won't double-log." : "Please re-enter this one."}
          </p>
        </div>
      </div>
      {data.items.length > 0 && (
        <ul className="mt-3 space-y-2.5">
          {data.items.map((item, index) => (
            <li key={item.actionId ?? `${item.ordinal}-${index}`} className={CHAT_CARD_ROW}>
              <ItemHeader actionType={item.actionType} title={item.title} />
              <p className={cn(CHAT_CARD_META, "mt-1")}>{item.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Dispatch ────────────────────────────────────────────────────────────── */

export function ChatTurnCardView({
  card,
  handlers = {},
  state = {},
}: {
  card: ChatTurnCard;
  handlers?: ChatCardHandlers;
  state?: ChatCardState;
}) {
  switch (card.kind) {
    case "confirmation":
      return (
        <ConfirmationCard
          data={card.data}
          pending={(state.pendingGroupIds ?? EMPTY_SET).has(card.data.groupId)}
          resolved={card.data.state === "resolved" || (state.resolvedGroupIds ?? EMPTY_SET).has(card.data.groupId) || !handlers.onConfirm}
          now={state.now}
          onConfirm={handlers.onConfirm}
        />
      );
    case "clarification":
      return <ClarificationCard data={card.data} handlers={handlers} state={state} />;
    case "duplicate":
      return <DuplicateCard data={card.data} handlers={handlers} state={state} />;
    case "result":
      return <ResultCard data={card.data} />;
    case "failure":
      return <FailureCard data={card.data} />;
    case "undo":
      return <UndoCard data={card.data} handlers={handlers} state={state} />;
    default:
      return null;
  }
}

/**
 * The single card renderer used by both chat surfaces. Cards come straight from
 * the persisted turn record, so a reload or session switch reproduces exactly
 * the same cards in the same state.
 */
export function ChatTurnCards({
  cards,
  handlers,
  state,
  className,
}: {
  cards: ChatTurnCard[];
  handlers?: ChatCardHandlers;
  state?: ChatCardState;
  className?: string;
}) {
  if (cards.length === 0) return null;
  return (
    <div data-chat-cards="" className={cn(CHAT_CARD_BAND, "space-y-3", className)}>
      {cards.map((card, index) => (
        <ChatTurnCardView key={`${card.kind}-${index}`} card={card} handlers={handlers} state={state} />
      ))}
    </div>
  );
}
