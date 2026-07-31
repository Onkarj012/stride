/**
 * Pure, framework-free helpers backing the Home chat action flow.
 *
 * Log drafts are no longer staged client-side: a turn persists its own
 * confirmation/result cards, so only conversational actions are staged here.
 */

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function splitActions<T extends { type: string; draft?: any }>(actions: T[]): { drafts: any[]; rest: T[] } {
  const drafts: any[] = [];
  const rest: T[] = [];
  for (const action of actions) {
    if (action.type === "log_draft") drafts.push(action.draft);
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
