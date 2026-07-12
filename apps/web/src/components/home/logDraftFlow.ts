/**
 * Pure, framework-free helpers backing the Home chat logging flow
 * (see AssistantConsole.tsx). Kept separate from the component so the
 * draft-merge / staging / persistence logic can be unit tested without
 * mounting the full console.
 */

export type AnyDraft = Record<string, any>;

function hashDraftSeed(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function draftClientId(draft: any, index = 0): string {
  const existing = draft?._clientId;
  if (typeof existing === "string" && existing.trim()) return existing;
  const seed = JSON.stringify({
    kind: draft?.kind,
    date: draft?.date,
    description: draft?.description,
    name: draft?.name,
    kcal: draft?.kcal,
    index,
  });
  return `draft-${hashDraftSeed(seed)}-${index}`;
}

export function normalizeDraft(draft: any, index = 0): AnyDraft | null {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
  return { ...draft, _clientId: draftClientId(draft, index) };
}

export function normalizeDrafts(drafts: unknown): AnyDraft[] {
  if (!Array.isArray(drafts)) return [];
  return drafts.flatMap((draft, index) => {
    const normalized = normalizeDraft(draft, index);
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
 * Actions returned by `send()` are held in a "staged" state until the
 * `messages` query has caught up with the persisted AI reply, so the
 * confirm card never renders before its text bubble. A fallback timeout
 * (see STAGED_FALLBACK_MS) guarantees staged actions never get stuck.
 */
export type StagedActions<T> = { actions: T[]; countAtSend: number } | null;

export function stageActions<T>(actions: T[], countAtSend: number): StagedActions<T> {
  return actions.length > 0 ? { actions, countAtSend } : null;
}

export function promoteOnMessages<T>(
  staged: StagedActions<T>,
  messagesLength: number,
): { staged: StagedActions<T>; promote: T[] | null } {
  if (!staged) return { staged, promote: null };
  if (messagesLength > staged.countAtSend) return { staged: null, promote: staged.actions };
  return { staged, promote: null };
}

export function promoteOnTimeout<T>(staged: StagedActions<T>): { staged: StagedActions<T>; promote: T[] | null } {
  if (!staged) return { staged, promote: null };
  return { staged: null, promote: staged.actions };
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
