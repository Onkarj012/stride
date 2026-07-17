/**
 * Pure, framework-free helpers backing the Home chat logging flow
 * (see AssistantConsole.tsx). Kept separate from the component so the
 * draft-merge / staging / persistence logic can be unit tested without
 * mounting the full console.
 */

export type AnyDraft = Record<string, any>;

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function draftClientId(draft: any): string {
  const existing = draft?._clientId;
  if (typeof existing === "string" && existing.trim()) return existing;
  return generateId();
}

export function normalizeDraft(draft: any): AnyDraft | null {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
  return { ...draft, _clientId: draftClientId(draft) };
}

export function normalizeDrafts(drafts: unknown): AnyDraft[] {
  if (!Array.isArray(drafts)) return [];
  return drafts.flatMap((draft) => {
    const normalized = normalizeDraft(draft);
    return normalized ? [normalized] : [];
  });
}

/**
 * Merge incoming drafts into the existing pending list — update in place by
 * `_clientId` when a draft already exists, otherwise append. Never replaces
 * the whole array, so confirming/discarding one draft (or a new message
 * arriving) can't silently drop unrelated pending drafts.
 */
export function mergeDrafts(existing: AnyDraft[], incoming: unknown): AnyDraft[] {
  const normalizedIncoming = normalizeDrafts(incoming);
  if (normalizedIncoming.length === 0) return existing;
  const result = [...existing];
  for (const draft of normalizedIncoming) {
    const idx = result.findIndex((d) => d._clientId === draft._clientId);
    if (idx >= 0) result[idx] = { ...result[idx], ...draft };
    else result.push(draft);
  }
  return result;
}

/**
 * Split a backend `actions` array into `log_draft` drafts — rendered
 * directly as a `LogConfirmCard` (single-step confirm) — versus everything
 * else, which still goes through the generic `AgentActionCard` path.
 */
export function splitActions<T extends { type: string; draft?: any }>(
  actions: T[],
): { drafts: any[]; rest: T[] } {
  const drafts: any[] = [];
  const rest: T[] = [];
  for (const action of actions) {
    if (action.type === "log_draft") drafts.push(action.draft);
    else rest.push(action);
  }
  return { drafts, rest };
}

/* ── Race-free card ordering ──
 * Actions returned by `send()` are held in a queue of "staged" batches until
 * the `messages` query reflects the persisted AI reply whose ID matches the
 * batch's `messageId`. This keeps confirm cards tied to the correct text
 * bubble even when requests overlap or replies arrive out of order. A
 * fallback timeout (see STAGED_FALLBACK_MS) guarantees staged actions never
 * get stuck; the timeout verifies its batch by immutable `batchId` before
 * promoting, so it cannot resurrect an already-promoted or confirmed batch.
 */
export type StagedBatch<T> = {
  batchId: string;
  messageId: string | null;
  actions: T[];
};

export type StagedActions<T> = StagedBatch<T>[] | null;

export function stageActions<T>(
  actions: T[],
  messageId: string | null = null,
): StagedActions<T> {
  if (actions.length === 0) return null;
  return [{ batchId: generateId(), messageId, actions }];
}

export function promoteOnMessages<T>(
  staged: StagedActions<T>,
  messages: Array<{ role: string; id?: string; ts: number; content?: string }>,
): { staged: StagedActions<T>; promote: T[] | null } {
  if (!staged || staged.length === 0) return { staged, promote: null };

  // Promote every batch whose assistant-message ID has arrived. A single query
  // update can contain multiple replies, so stopping after the first match
  // would leave the others waiting for their fallback timers.
  const aiIds = new Set(messages.filter((m) => m.role === "ai").map((m) => m.id).filter(Boolean));
  const delivered = staged.filter((batch) => batch.messageId && aiIds.has(batch.messageId));
  if (delivered.length > 0) return {
    staged: staged.filter((batch) => !batch.messageId || !aiIds.has(batch.messageId)),
    promote: delivered.flatMap((batch) => batch.actions),
  };

  return { staged, promote: null };
}

export function promoteOnTimeout<T>(
  staged: StagedActions<T>,
  batchId: string,
): { staged: StagedActions<T>; promote: T[] | null } {
  if (!staged || staged.length === 0) return { staged, promote: null };
  const index = staged.findIndex((b) => b.batchId === batchId);
  if (index < 0) return { staged, promote: null };
  const promoted = staged[index];
  return { staged: staged.filter((_, i) => i !== index), promote: promoted.actions };
}

export const STAGED_FALLBACK_MS = 4000;

/* ── Date-scoped sessionStorage codec for pending drafts ──
 * Storing drafts under a fixed key with no date meant an unconfirmed draft
 * from a stale tab could reappear on a later day's thread. Scope the
 * payload by date and drop it on restore if it doesn't match today.
 */
const PENDING_DRAFTS_KEY = "stride_pending_drafts";

export function loadPendingDrafts(storage: Pick<Storage, "getItem">, today: string): AnyDraft[] {
  try {
    const raw = JSON.parse(storage.getItem(PENDING_DRAFTS_KEY) ?? "null");
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.date !== today) return [];
    return normalizeDrafts(raw.drafts);
  } catch {
    return [];
  }
}

export function savePendingDrafts(storage: Pick<Storage, "setItem">, today: string, drafts: AnyDraft[]): void {
  try {
    storage.setItem(PENDING_DRAFTS_KEY, JSON.stringify({ date: today, drafts }));
  } catch {
    /* ignore */
  }
}
