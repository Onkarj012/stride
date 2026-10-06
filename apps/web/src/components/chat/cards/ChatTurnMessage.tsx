import { useEffect, useMemo, useState } from "react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import type { Modality } from "@/components/ui-kit";
import {
  ChatTurnCards,
  parseChatTurnCards,
  type ChatCardHandlers,
  type ChatCardState,
  type ChatTurnResolution,
} from "./ChatTurnCards";

/** The persisted shape both chat surfaces read back from Convex. */
export type PersistedChatMessage = {
  role: string;
  content: string;
  turnCards?: unknown;
  turnOutcome?: string;
  actionGroupId?: string;
  clientSubmissionId?: string;
};

type Props = {
  message: PersistedChatMessage;
  handlers?: ChatCardHandlers;
  state?: ChatCardState;
  fresh?: boolean;
  entrance?: boolean;
  badge?: React.ReactNode;
  modality?: Modality;
  chip?: string;
  onEdit?: () => void;
};

/**
 * One persisted chat message: its text bubble plus every card the turn
 * resolved to. Home and Coach both render messages through this component, so
 * a card looks and behaves identically wherever the conversation happens.
 */
export function ChatTurnMessage({ message, handlers, state, fresh, entrance, badge, modality, chip, onEdit }: Props) {
  const messageSignature = JSON.stringify([message.content, message.turnOutcome, message.turnCards, message.actionGroupId]);
  const [resolvedTurn, setResolvedTurn] = useState<{ turn: ChatTurnResolution; baseline: string } | null>(null);
  const activeOverride = resolvedTurn?.baseline === messageSignature ? resolvedTurn.turn : null;
  useEffect(() => {
    if (resolvedTurn && resolvedTurn.baseline !== messageSignature) setResolvedTurn(null);
  }, [messageSignature, resolvedTurn]);
  const displayedMessage = activeOverride
    ? {
        ...message,
        content: activeOverride.content,
        turnOutcome: activeOverride.turnOutcome,
        turnCards: activeOverride.turnCards,
        actionGroupId: activeOverride.actionGroupId,
      }
    : message;
  const cards = useMemo(() => parseChatTurnCards(displayedMessage.turnCards), [displayedMessage.turnCards]);
  const cardHandlers = useMemo<ChatCardHandlers | undefined>(() => {
    if (!handlers) return handlers;
    const applyTurn = (turn: ChatTurnResolution | void) => {
      if (turn) setResolvedTurn({ turn, baseline: messageSignature });
      return turn;
    };
    return {
      ...handlers,
      ...(handlers.onLogAnyway ? { onLogAnyway: async (groupId: string, item: Parameters<NonNullable<ChatCardHandlers["onLogAnyway"]>>[1]) => {
        const turn = await handlers.onLogAnyway?.(groupId, item);
        return applyTurn(turn);
      } } : {}),
      ...(handlers.onUndoItem ? { onUndoItem: async (groupId: string, actionId: string) => {
        const turn = await handlers.onUndoItem?.(groupId, actionId);
        return applyTurn(turn);
      } } : {}),
      ...(handlers.onUndoAll ? { onUndoAll: async (groupId: string) => {
        const turn = await handlers.onUndoAll?.(groupId);
        return applyTurn(turn);
      } } : {}),
    };
  }, [handlers, messageSignature]);
  const role = displayedMessage.role === "user" ? "user" : "ai";
  return (
    <div className="space-y-3">
      {displayedMessage.content.trim().length > 0 && (
        <MessageBubble
          role={role}
          content={displayedMessage.content}
          fresh={fresh}
          entrance={entrance}
          badge={badge}
          modality={modality}
          chip={chip}
          onEdit={onEdit}
        />
      )}
      <ChatTurnCards cards={cards} handlers={cardHandlers} state={state} />
    </div>
  );
}
