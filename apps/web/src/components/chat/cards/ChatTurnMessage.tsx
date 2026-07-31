import { useMemo, useState } from "react";
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
  const [resolvedTurn, setResolvedTurn] = useState<ChatTurnResolution | null>(null);
  const displayedMessage = resolvedTurn
    ? {
        ...message,
        content: resolvedTurn.content,
        turnOutcome: resolvedTurn.turnOutcome,
        turnCards: resolvedTurn.turnCards,
        actionGroupId: resolvedTurn.actionGroupId,
      }
    : message;
  const cards = useMemo(() => parseChatTurnCards(displayedMessage.turnCards), [displayedMessage.turnCards]);
  const cardHandlers = useMemo<ChatCardHandlers | undefined>(() => {
    if (!handlers?.onLogAnyway) return handlers;
    return {
      ...handlers,
      onLogAnyway: async (groupId, item) => {
        const turn = await handlers.onLogAnyway?.(groupId, item);
        if (turn) setResolvedTurn(turn);
        return turn;
      },
    };
  }, [handlers]);
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
