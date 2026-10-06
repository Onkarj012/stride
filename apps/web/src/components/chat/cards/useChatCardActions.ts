import { useCallback, useMemo, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { DuplicateCardData } from "@stride/shared";
import { useToast } from "@/context/ToastContext";
import type {
  ChatCardHandlers,
  ChatCardState,
  ChatTurnResolution,
  ConfirmationDecision,
} from "./ChatTurnCards";

type ConfirmGroupResult = {
  status?: string;
  results?: Array<{ ordinal: number; status: string }>;
  unresolvedItems?: unknown[];
  memoryApprovals?: Array<{ memoryId: string; kind: "food" | "workout"; label: string }>;
};

type LogAnywayResult = {
  turn: ChatTurnResolution;
};

type UndoActionResult = {
  status: "undone" | "already_undone" | "skipped";
  reason?: string;
  turn?: ChatTurnResolution;
};

type UndoGroupResult = {
  results: Array<{
    status: "undone" | "already_undone" | "skipped";
    reason?: string;
  }>;
  turn?: ChatTurnResolution;
};

type Options = {
  /** Called after a confirm round-trip so a surface can surface memory approvals. */
  onConfirmResult?: (result: ConfirmGroupResult) => void;
  /** Called after any successful card action, e.g. to scroll the transcript. */
  onSettled?: () => void;
};

function withId(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  next.add(id);
  return next;
}

function withoutId(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

/**
 * Card actions wired to Convex, shared by Home and Coach so both surfaces
 * commit, clarify, and undo through exactly the same calls. All durable state
 * lives on the chat message itself; the sets returned here only track requests
 * that are currently in flight.
 */
export function useChatCardActions(options: Options = {}): { handlers: ChatCardHandlers; state: ChatCardState } {
  const confirmGroup = useAction((api as any).ai.confirmGroup);
  const resolveClarification = useAction(api.ai.resolveClarification);
  const logAnywayForAction = useAction(api.ai.logAnywayForAction);
  const undoAction = useMutation((api as any).actions_undo.undoAction);
  const undoGroup = useMutation((api as any).actions_undo.undoGroup);
  const toast = useToast();

  const [pendingGroupIds, setPendingGroupIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingActionIds, setPendingActionIds] = useState<ReadonlySet<string>>(() => new Set());

  const { onConfirmResult, onSettled } = options;

  const onConfirm = useCallback(async (groupId: string, decisions: ConfirmationDecision[]) => {
    let alreadyPending = false;
    setPendingGroupIds((current) => {
      alreadyPending = current.has(groupId);
      return alreadyPending ? current : withId(current, groupId);
    });
    if (alreadyPending) return;
    try {
      const result = await confirmGroup({ groupId, decisions }) as ConfirmGroupResult;
      onConfirmResult?.(result);
      if (result.status === "expired") toast.error("Confirmation expired", "This batch can no longer be saved");
      else if (result.unresolvedItems?.length) toast.error("Some items need attention", "Saved items remain available to undo");
      else if (result.status === "discarded") toast.success("Discarded", "No items were saved");
      else toast.success("Saved", "Confirmed items were logged");
      onSettled?.();
    } catch (error) {
      toast.error("Couldn't save", error instanceof Error ? error.message : "Try again");
    } finally {
      setPendingGroupIds((current) => withoutId(current, groupId));
    }
  }, [confirmGroup, onConfirmResult, onSettled, toast]);

  const onClarify = useCallback(async (groupId: string, date: string) => {
    let alreadyPending = false;
    setPendingGroupIds((current) => {
      alreadyPending = current.has(groupId);
      return alreadyPending ? current : withId(current, groupId);
    });
    if (alreadyPending) return;
    try {
      await resolveClarification({ groupId: groupId as never, date });
      toast.success("Saved", date);
      onSettled?.();
    } catch (error) {
      toast.error("Couldn't save", error instanceof Error ? error.message : "Try again");
    } finally {
      setPendingGroupIds((current) => withoutId(current, groupId));
    }
  }, [onSettled, resolveClarification, toast]);

  const onUndoItem = useCallback(async (_groupId: string, actionId: string) => {
    let alreadyPending = false;
    setPendingActionIds((current) => {
      alreadyPending = current.has(actionId);
      return alreadyPending ? current : withId(current, actionId);
    });
    if (alreadyPending) return;
    try {
      const result = await undoAction({ actionId }) as UndoActionResult;
      if (result.status === "undone" || result.status === "already_undone") {
        toast.success(
          result.status === "undone" ? "Undone" : "Already undone",
          result.status === "undone" ? "That entry was reversed" : "That entry was already reversed",
        );
        onSettled?.();
      } else {
        toast.error(
          "Couldn't undo",
          result.reason ?? "That entry was not reversed",
        );
      }
      return result.turn;
    } catch (error) {
      toast.error("Couldn't undo", error instanceof Error ? error.message : "Try again");
    } finally {
      setPendingActionIds((current) => withoutId(current, actionId));
    }
  }, [onSettled, toast, undoAction]);

  const onUndoAll = useCallback(async (groupId: string) => {
    const pendingKey = `group:${groupId}`;
    let alreadyPending = false;
    setPendingActionIds((current) => {
      alreadyPending = current.has(pendingKey);
      return alreadyPending ? current : withId(current, pendingKey);
    });
    if (alreadyPending) return;
    try {
      const result = await undoGroup({ groupId }) as UndoGroupResult;
      const undone = result.results.filter((item) => item.status === "undone");
      const alreadyUndone = result.results.filter((item) => item.status === "already_undone");
      const skipped = result.results.filter((item) => item.status === "skipped");
      if (undone.length > 0) {
        const alreadyDetail = alreadyUndone.length > 0
          ? `; ${alreadyUndone.length} already undone`
          : "";
        toast.success("Undone", `${undone.length} saved item${undone.length === 1 ? " was" : "s were"} reversed${alreadyDetail}`);
        onSettled?.();
      } else if (alreadyUndone.length > 0) {
        toast.success(
          "Already undone",
          `${alreadyUndone.length} saved item${alreadyUndone.length === 1 ? " was" : "s were"} already reversed`,
        );
        onSettled?.();
      }
      if (skipped.length > 0 || undone.length + alreadyUndone.length === 0) {
        toast.error(
          "Couldn't undo",
          skipped.map((item) => item.reason).filter(Boolean).join("; ")
            || "No saved items were reversed",
        );
      }
      return result.turn;
    } catch (error) {
      toast.error("Couldn't undo", error instanceof Error ? error.message : "Try again");
    } finally {
      setPendingActionIds((current) => withoutId(current, pendingKey));
    }
  }, [onSettled, toast, undoGroup]);

  const onLogAnyway = useCallback(async (_groupId: string, item: DuplicateCardData["items"][number]) => {
    let alreadyPending = false;
    setPendingActionIds((current) => {
      alreadyPending = current.has(item.actionId);
      return alreadyPending ? current : withId(current, item.actionId);
    });
    if (alreadyPending) return;
    try {
      const result = await logAnywayForAction({ actionId: item.actionId }) as LogAnywayResult;
      toast.success("Saved", `${item.title} was logged`);
      onSettled?.();
      return result.turn;
    } catch (error) {
      toast.error("Couldn't save", error instanceof Error ? error.message : "Try again");
    } finally {
      setPendingActionIds((current) => withoutId(current, item.actionId));
    }
  }, [logAnywayForAction, onSettled, toast]);

  const handlers = useMemo<ChatCardHandlers>(() => ({
    onConfirm: (groupId, decisions) => void onConfirm(groupId, decisions),
    onClarify: (groupId, date) => void onClarify(groupId, date),
    onUndoItem: (groupId, actionId) => onUndoItem(groupId, actionId),
    onUndoAll: (groupId) => onUndoAll(groupId),
    onLogAnyway: (groupId, item) => onLogAnyway(groupId, item),
  }), [onClarify, onConfirm, onLogAnyway, onUndoAll, onUndoItem]);

  const state = useMemo<ChatCardState>(
    () => ({ pendingGroupIds, pendingActionIds }),
    [pendingActionIds, pendingGroupIds],
  );

  return { handlers, state };
}
