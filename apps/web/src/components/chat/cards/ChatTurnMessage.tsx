import { useMemo } from "react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import type { Modality } from "@/components/ui-kit";
import { ChatTurnCards, parseChatTurnCards, type ChatCardHandlers, type ChatCardState } from "./ChatTurnCards";

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
  const cards = useMemo(() => parseChatTurnCards(message.turnCards), [message.turnCards]);
  const role = message.role === "user" ? "user" : "ai";
  return (
    <div className="space-y-3">
      {message.content.trim().length > 0 && (
        <MessageBubble
          role={role}
          content={message.content}
          fresh={fresh}
          entrance={entrance}
          badge={badge}
          modality={modality}
          chip={chip}
          onEdit={onEdit}
        />
      )}
      <ChatTurnCards cards={cards} handlers={handlers} state={state} />
    </div>
  );
}
