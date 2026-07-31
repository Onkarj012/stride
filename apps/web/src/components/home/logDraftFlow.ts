/**
 * Pure, framework-free helpers backing the Home chat action flow.
 *
 * Turn outcomes (confirmation, result, undo…) are persisted by the backend and
 * rendered from the chat message itself. Macro-level editing has no place in
 * that contract yet, so `log_draft` and `macro_conflict` actions still travel
 * as transient drafts and are confirmed through `LogConfirmCard`. Drafts live
 * in memory only — they are never written to browser storage.
 */

export type AnyDraft = Record<string, any>;

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function draftClientId(draft: any): string {
  const existing = draft?._clientId;
  if (typeof existing === "string" && existing.trim()) return existing;
  return generateId();
}

export function normalizeDraft(draft: any): AnyDraft | null {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
  if (typeof draft._clientId === "string" && draft._clientId.trim()) return draft;
  return { ...draft, _clientId: draftClientId(draft) };
}

export function normalizeDrafts(drafts: unknown): AnyDraft[] {
  if (!Array.isArray(drafts)) return [];
  return drafts.flatMap((draft) => {
    const normalized = normalizeDraft(draft);
    return normalized ? [normalized] : [];
  });
}

export function mergeDrafts(existing: AnyDraft[], incoming: unknown): AnyDraft[] {
  const normalizedIncoming = normalizeDrafts(incoming);
  if (normalizedIncoming.length === 0) return existing;
  const result = [...existing];
  for (const draft of normalizedIncoming) {
    const index = result.findIndex((item) => item._clientId === draft._clientId);
    if (index >= 0) result[index] = { ...result[index], ...draft };
    else result.push(draft);
  }
  return result;
}

/**
 * `log_draft` and `macro_conflict` both carry a draft that needs macro-level
 * confirmation; everything else stays an inline conversational action.
 */
export function splitActions<T extends { type: string; draft?: any }>(actions: T[]): { drafts: any[]; rest: T[] } {
  const drafts: any[] = [];
  const rest: T[] = [];
  for (const action of actions) {
    if (action.type === "log_draft") drafts.push(action.draft);
    else if (action.type === "macro_conflict" && action.draft) drafts.push(action.draft);
    else rest.push(action);
  }
  return { drafts, rest };
}

export type StagedBatch<T> = {
  batchId: string;
  messageId: string | null;
  actions: T[];
};

export type StagedActions<T> = StagedBatch<T>[] | null;

export function stageActions<T>(actions: T[], messageId: string | null = null): StagedActions<T> {
  if (actions.length === 0) return null;
  return [{ batchId: generateId(), messageId, actions }];
}

export function promoteOnMessages<T>(
  staged: StagedActions<T>,
  messages: Array<{ role: string; id?: string; ts: number; content?: string }>,
): { staged: StagedActions<T>; promote: T[] | null } {
  if (!staged || staged.length === 0) return { staged, promote: null };
  const aiIds = new Set(messages.filter((message) => message.role === "ai").map((message) => message.id).filter(Boolean));
  const delivered = staged.filter((batch) => batch.messageId && aiIds.has(batch.messageId));
  if (delivered.length === 0) return { staged, promote: null };
  return {
    staged: staged.filter((batch) => !batch.messageId || !aiIds.has(batch.messageId)),
    promote: delivered.flatMap((batch) => batch.actions),
  };
}

export function promoteOnTimeout<T>(staged: StagedActions<T>, batchId: string): { staged: StagedActions<T>; promote: T[] | null } {
  if (!staged || staged.length === 0) return { staged, promote: null };
  const index = staged.findIndex((batch) => batch.batchId === batchId);
  if (index < 0) return { staged, promote: null };
  return {
    staged: staged.filter((_, itemIndex) => itemIndex !== index),
    promote: staged[index].actions,
  };
}

export const STAGED_FALLBACK_MS = 4000;
