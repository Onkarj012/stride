/**
 * Durable chat-turn card contract shared by web, mobile, and the Convex backend.
 *
 * Cards contain presentation-ready labels plus stable links to the canonical
 * action group/action rows. They deliberately do not duplicate executable
 * action payloads; actionGroups/actions remain the source of truth.
 */
export const CHAT_TURN_CARD_VERSION = 1 as const

export type ChatTurnOutcome =
  | 'committed'
  | 'confirmation_required'
  | 'failed'
  | 'no_action'

export type ChatTurnActionType = 'meal' | 'workout' | 'recovery'

export type ChatTurnRecordRef = {
  table: string
  id: string
}

type CardItemBase = {
  ordinal: number
  actionType: ChatTurnActionType
  title: string
  description?: string
  date?: string
  time?: string
  /** Optional meal nutrition editing data. Older persisted cards omit this. */
  macros?: ConfirmationMacroData
}

export type ConfirmationMacroData = {
  calories: number
  protein: number
  carbs: number
  fat: number
  reported?: {
    calories: number
    protein: number
    carbs: number
    fat: number
  }
  estimate?: {
    calories: number
    protein: number
    carbs: number
    fat: number
  }
  conflict?: boolean
}

export type ConfirmationCardData = {
  groupId: string
  expiresAt: number
  items: Array<CardItemBase & {
    actionId: string
    confidence?: number
    validationMessages: string[]
  }>
}

export type ClarificationCardData = {
  groupId: string
  prompt: string
  items: Array<CardItemBase & {
    actionId: string
    reason: string
  }>
}

export type DuplicateCardData = {
  groupId: string
  items: Array<CardItemBase & {
    actionId: string
    reason: string
  }>
}

export type ResultCardItem =
  | (CardItemBase & {
      status: 'committed'
      actionId: string
      record: ChatTurnRecordRef
    })
  | (CardItemBase & {
      status: 'failed'
      actionId?: string
      reason: string
      retriable: boolean
    })

export type ResultCardData = {
  groupId: string
  items: ResultCardItem[]
}

export type FailureCardData = {
  groupId?: string
  code: string
  message: string
  retriable: boolean
  items: Array<CardItemBase & {
    actionId?: string
    reason: string
  }>
}

export type UndoCardData = {
  groupId: string
  items: Array<CardItemBase & {
    actionId: string
    record: ChatTurnRecordRef
    state: 'available' | 'undone' | 'expired'
  }>
}

export type ChatTurnCard =
  | { version: 1; kind: 'confirmation'; data: ConfirmationCardData }
  | { version: 1; kind: 'clarification'; data: ClarificationCardData }
  | { version: 1; kind: 'duplicate'; data: DuplicateCardData }
  | { version: 1; kind: 'result'; data: ResultCardData }
  | { version: 1; kind: 'failure'; data: FailureCardData }
  | { version: 1; kind: 'undo'; data: UndoCardData }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isMacroValues(value: unknown): value is ConfirmationMacroData {
  if (!isRecord(value)) return false
  const fields = ['calories', 'protein', 'carbs', 'fat']
  if (!fields.every((field) => typeof value[field] === 'number' && Number.isFinite(value[field]))) return false
  if (value.conflict !== undefined && typeof value.conflict !== 'boolean') return false
  if (value.reported !== undefined && !isMacroValues(value.reported)) return false
  if (value.estimate !== undefined) {
    if (!isRecord(value.estimate)) return false
    const estimate = value.estimate as Record<string, unknown>
    if (!fields.every((field) => typeof estimate[field] === 'number' && Number.isFinite(estimate[field]))) return false
  }
  return true
}

function isActionType(value: unknown): value is ChatTurnActionType {
  return value === 'meal' || value === 'workout' || value === 'recovery'
}

function isItemBase(value: unknown): value is CardItemBase {
  if (!isRecord(value)) return false
  return Number.isInteger(value.ordinal)
    && isActionType(value.actionType)
    && typeof value.title === 'string'
    && isOptionalString(value.description)
    && isOptionalString(value.date)
    && isOptionalString(value.time)
    && (value.macros === undefined || isMacroValues(value.macros))
}

function isRecordRef(value: unknown): value is ChatTurnRecordRef {
  return isRecord(value) && typeof value.table === 'string' && typeof value.id === 'string'
}

function everyItem(value: unknown, validate: (item: Record<string, unknown>) => boolean): boolean {
  return Array.isArray(value)
    && value.every((item) => isItemBase(item) && validate(item as Record<string, unknown>))
}

/** Runtime validator for persisted or network-loaded card data. */
export function isChatTurnCard(value: unknown): value is ChatTurnCard {
  if (!isRecord(value) || value.version !== CHAT_TURN_CARD_VERSION || !isRecord(value.data)) return false
  const data = value.data

  if (value.kind === 'confirmation') {
    return typeof data.groupId === 'string'
      && typeof data.expiresAt === 'number'
      && everyItem(data.items, (item) =>
        typeof item.actionId === 'string'
        && (item.confidence === undefined || typeof item.confidence === 'number')
        && Array.isArray(item.validationMessages)
        && item.validationMessages.every((message) => typeof message === 'string'))
  }
  if (value.kind === 'clarification') {
    return typeof data.groupId === 'string'
      && typeof data.prompt === 'string'
      && everyItem(data.items, (item) => typeof item.actionId === 'string' && typeof item.reason === 'string')
  }
  if (value.kind === 'duplicate') {
    return typeof data.groupId === 'string'
      && everyItem(data.items, (item) => typeof item.actionId === 'string' && typeof item.reason === 'string')
  }
  if (value.kind === 'result') {
    return typeof data.groupId === 'string'
      && everyItem(data.items, (item) =>
        item.status === 'committed'
          ? typeof item.actionId === 'string' && isRecordRef(item.record)
          : item.status === 'failed'
            && isOptionalString(item.actionId)
            && typeof item.reason === 'string'
            && typeof item.retriable === 'boolean')
  }
  if (value.kind === 'failure') {
    return isOptionalString(data.groupId)
      && typeof data.code === 'string'
      && typeof data.message === 'string'
      && typeof data.retriable === 'boolean'
      && everyItem(data.items, (item) => isOptionalString(item.actionId) && typeof item.reason === 'string')
  }
  if (value.kind === 'undo') {
    return typeof data.groupId === 'string'
      && everyItem(data.items, (item) =>
        typeof item.actionId === 'string'
        && isRecordRef(item.record)
        && (item.state === 'available' || item.state === 'undone' || item.state === 'expired'))
  }
  return false
}

export function assertChatTurnCard(value: unknown): asserts value is ChatTurnCard {
  if (!isChatTurnCard(value)) throw new Error('Invalid chat turn card')
}

export function assertChatTurnCards(value: unknown): asserts value is ChatTurnCard[] {
  if (!Array.isArray(value)) throw new Error('Invalid chat turn cards')
  for (const card of value) assertChatTurnCard(card)
}
