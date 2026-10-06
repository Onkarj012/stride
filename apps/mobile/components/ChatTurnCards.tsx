import { useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import {
  assertChatTurnCards,
  isChatTurnCard,
  type ChatTurnCard,
  type ConfirmationCardData,
  type DuplicateCardData,
  type ClarificationCardData,
  type FailureCardData,
  type ResultCardData,
  type UndoCardData,
} from '@stride/shared'
import { Icon } from './Icon'
import { useTheme, RADIUS, SPACE, TAP_MIN } from './theme'
import { Button } from './ui'

export type ConfirmationDecision = {
  ordinal: number
  action: 'confirm' | 'discard'
  edits?: { date?: string; description?: string }
}

export type PersistedChatMessage = {
  role: string
  content: string
  clientSubmissionId?: string
  actionGroupId?: string
  turnCards?: unknown
  turnOutcome?: string
}

export type ChatCardHandlers = {
  onConfirm?: (groupId: string, decisions: ConfirmationDecision[]) => void
  onClarify?: (groupId: string, date: string) => void
  onUndoItem?: (groupId: string, actionId: string) => void
  onUndoAll?: (groupId: string) => void
  onLogAnyway?: (groupId: string, item: DuplicateCardData['items'][number]) => void
}

export type DuplicateCardItem = DuplicateCardData['items'][number]

export type ChatCardState = {
  pendingGroupIds?: ReadonlySet<string>
  pendingActionIds?: ReadonlySet<string>
  resolvedGroupIds?: ReadonlySet<string>
  undoneActionIds?: ReadonlySet<string>
  undoneGroupIds?: ReadonlySet<string>
  now?: number
}

const EMPTY_SET: ReadonlySet<string> = new Set()

/** Drop malformed network data instead of rendering a half-formed card. */
export function parseChatTurnCards(value: unknown): ChatTurnCard[] {
  if (!Array.isArray(value)) return []
  return value.filter((card): card is ChatTurnCard => isChatTurnCard(card))
}

/** Throws when an action returns turn cards that fail the shared contract. */
export function assertReturnedTurnCards(value: unknown): asserts value is ChatTurnCard[] {
  assertChatTurnCards(value)
}

/** Joins an item's date and time for its meta line, or null when both are missing. */
function itemDateLine(item: { date?: string; time?: string }): string | null {
  if (!item.date && !item.time) return null
  return [item.date, item.time].filter(Boolean).join(' · ')
}

/** Renders an item's action type label and title. */
function ItemHeader({ actionType, title }: { actionType: string; title: string }) {
  const t = useTheme()
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.sm }}>
      <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.5 }}>{actionType}</Text>
      <Text style={{ flexShrink: 1, fontFamily: 'Manrope_700Bold', fontSize: 14, color: t.text }}>{title}</Text>
    </View>
  )
}

/** Renders secondary card text. */
function Meta({ children }: { children: string }) {
  const t = useTheme()
  return <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 13, color: t.textMuted, lineHeight: 19 }}>{children}</Text>
}

/** Renders the shared card container. */
function CardSurface({ children, borderColor }: { children: ReactNode; borderColor?: string }) {
  const t = useTheme()
  return <View style={[{ width: '100%', backgroundColor: t.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: borderColor ?? t.border, padding: SPACE.lg, gap: SPACE.md }, t.cardShadow]}>{children}</View>
}

/** Renders one bordered item row, tinted when it needs attention. */
function ItemRow({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  const t = useTheme()
  return <View style={{ borderWidth: 1, borderColor: warning ? 'rgba(244,181,214,0.45)' : t.border, borderRadius: RADIUS.md, padding: SPACE.md, gap: SPACE.xs }}>{children}</View>
}

/** Shows which items were saved, failed, discarded, or expired. */
function ResultCard({ data }: { data: ResultCardData }) {
  const t = useTheme()
  const committed = data.items.filter(item => item.status === 'committed').length
  const failed = data.items.filter(item => item.status === 'failed').length
  const discarded = data.items.filter(item => item.status === 'discarded').length
  const expired = data.items.filter(item => item.status === 'expired').length
  const title = committed > 0 ? `Logged ${committed} item${committed === 1 ? '' : 's'}` : failed === 0 && discarded > 0 && expired === 0 ? 'Discarded' : failed === 0 && expired > 0 && discarded === 0 ? 'Confirmation expired' : 'Nothing was logged'
  const detail = [failed > 0 ? `${failed} item${failed === 1 ? '' : 's'} could not be saved.` : '', discarded > 0 ? `${discarded} discarded.` : '', expired > 0 ? `${expired} expired.` : ''].filter(Boolean).join(' ') || 'Saved to your log.'
  const badge = committed > 0 ? 'SAVED' : data.reason === 'expired' ? 'EXPIRED' : data.reason === 'discarded' ? 'DISCARDED' : 'RESOLVED'
  return (
    <CardSurface>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md }}>
        <View style={{ flex: 1, gap: SPACE.xs }}>
          <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: t.text }}>{title}</Text>
          <Meta>{detail}</Meta>
        </View>
        {(committed > 0 || data.reason) && <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>{committed > 0 && <Icon name="check" size={16} color={t.accent} sw={3} />}<Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: t.accent }}>{badge}</Text></View>}
      </View>
      {data.items.map(item => {
        const dateLine = itemDateLine(item)
        return <ItemRow key={`${item.ordinal}-${item.status}`} warning={item.status === 'failed'}>
          <ItemHeader actionType={item.actionType} title={item.title} />
          {item.description && item.description !== item.title && <Meta>{item.description}</Meta>}
          <Meta>{item.status === 'committed' ? [dateLine, `saved to ${item.record.table} · ${item.record.id}`].filter(Boolean).join(' · ') : [dateLine, item.reason].filter(Boolean).join(' · ')}</Meta>
        </ItemRow>
      })}
    </CardSurface>
  )
}

/** Lets the user undo saved items one at a time or all at once. */
function UndoCard({ data, handlers, state }: { data: UndoCardData; handlers: ChatCardHandlers; state: ChatCardState }) {
  const t = useTheme()
  const pending = state.pendingActionIds ?? EMPTY_SET
  const undoneActions = state.undoneActionIds ?? EMPTY_SET
  const undoneGroups = state.undoneGroupIds ?? EMPTY_SET
  const available = data.items.filter(item => item.state === 'available' && !undoneActions.has(item.actionId) && !undoneGroups.has(data.groupId))
  const allResolved = available.length === 0
  const groupPending = pending.has(`group:${data.groupId}`)
  return (
    <CardSurface>
      <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: t.text }}>{allResolved ? 'Undo history' : 'Undo this log'}</Text>
      <Meta>{allResolved ? 'These entries are no longer active.' : 'Reverses the entry in your log.'}</Meta>
      {!allResolved && data.items.length > 1 && handlers.onUndoAll && <Button label={groupPending ? 'Undoing all…' : 'Undo all'} size="sm" variant="secondary" icon="back" disabled={groupPending} onPress={() => handlers.onUndoAll?.(data.groupId)} />}
      {data.items.map(item => {
        const locallyUndone = item.state !== 'available' || undoneActions.has(item.actionId) || undoneGroups.has(data.groupId)
        const isPending = pending.has(item.actionId)
        const label = item.state === 'undone' || locallyUndone ? `${item.title} reversed` : item.state === 'expired' ? `${item.title} — undo expired` : isPending ? `Undoing ${item.title}…` : `Undo ${item.title}`
        return <Button key={item.actionId} label={label} size="sm" variant="ghost" disabled={locallyUndone || isPending || !handlers.onUndoItem} icon="back" onPress={() => handlers.onUndoItem?.(data.groupId, item.actionId)} />
      })}
    </CardSurface>
  )
}

/** Asks for the missing date before pending items can be saved. */
function ClarificationCard({ data, handlers, state }: { data: ClarificationCardData; handlers: ChatCardHandlers; state: ChatCardState }) {
  const t = useTheme()
  const [date, setDate] = useState(data.items[0]?.date ?? '')
  const pending = (state.pendingGroupIds ?? EMPTY_SET).has(data.groupId)
  const resolved = (state.resolvedGroupIds ?? EMPTY_SET).has(data.groupId)
  const readOnly = resolved || !handlers.onClarify
  return (
    <CardSurface>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md }}>
        <Text style={{ flex: 1, fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: t.text }}>{readOnly ? 'Date clarified' : 'Needs one more detail'}</Text>
        {readOnly && <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: t.textMuted }}>RESOLVED</Text>}
      </View>
      {data.items.map(item => <ItemRow key={item.actionId}><ItemHeader actionType={item.actionType} title={item.title} /><Meta>{item.reason}</Meta></ItemRow>)}
      <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 14, color: t.text, lineHeight: 21 }}>{data.prompt}</Text>
      {!readOnly && <><TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={t.textSubtle} editable={!pending} style={{ minHeight: TAP_MIN, borderWidth: 1, borderColor: t.borderMid, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, color: t.text, fontFamily: 'Manrope_500Medium', fontSize: 14 }} /><Button label={pending ? 'Saving…' : 'Save with this date'} icon="check" disabled={pending || !date} onPress={() => handlers.onClarify?.(data.groupId, date)} /><Meta>Or tell me the date in chat.</Meta></>}
    </CardSurface>
  )
}

/** Shows items blocked as possible duplicates, with a log-anyway option. */
function DuplicateCard({ data, handlers, state }: { data: DuplicateCardData; handlers: ChatCardHandlers; state: ChatCardState }) {
  const t = useTheme()
  const pending = state.pendingActionIds ?? EMPTY_SET
  return (
    <CardSurface>
      <View style={{ flexDirection: 'row', gap: SPACE.sm }}><Icon name="info" size={19} color={t.accent} /><View style={{ flex: 1, gap: SPACE.xs }}><Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: t.text }}>Possible duplicate</Text><Meta>These look like entries you already have. Log them anyway if they are separate.</Meta></View></View>
      {data.items.map(item => {
        const isPending = pending.has(item.actionId)
        return <ItemRow key={item.actionId}><ItemHeader actionType={item.actionType} title={item.title} /><Meta>{[itemDateLine(item), item.reason].filter(Boolean).join(' · ')}</Meta>{handlers.onLogAnyway && <Button label={isPending ? 'Logging…' : 'Log anyway'} size="sm" variant="secondary" disabled={isPending} onPress={() => handlers.onLogAnyway?.(data.groupId, item)} />}</ItemRow>
      })}
    </CardSurface>
  )
}

/** Shows that nothing was saved and why. */
function FailureCard({ data }: { data: FailureCardData }) {
  const t = useTheme()
  return <CardSurface borderColor="rgba(244,181,214,0.55)"><View style={{ flexDirection: 'row', gap: SPACE.sm }}><Icon name="info" size={19} color={t.accent} /><View style={{ flex: 1, gap: SPACE.xs }}><Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: t.text }}>Nothing was logged</Text><Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 14, color: t.text, lineHeight: 21 }}>{data.message}</Text><Meta>{data.retriable ? "Send it again — retries are safe and won't double-log." : 'Please re-enter this one.'}</Meta></View></View>{data.items.map((item, index) => <ItemRow key={item.actionId ?? `${item.ordinal}-${index}`}><ItemHeader actionType={item.actionType} title={item.title} /><Meta>{item.reason}</Meta></ItemRow>)}</CardSurface>
}

/** Lets the user edit, confirm, or discard a batch of pending items. */
function ConfirmationCard({ data, handlers, state }: { data: ConfirmationCardData; handlers: ChatCardHandlers; state: ChatCardState }) {
  const t = useTheme()
  const [drafts, setDrafts] = useState(() => data.items.map(item => ({ ordinal: item.ordinal, selected: true, date: item.date ?? '', description: item.description ?? item.title })))
  const pending = (state.pendingGroupIds ?? EMPTY_SET).has(data.groupId)
  const expired = data.state !== 'resolved' && data.expiresAt <= (state.now ?? Date.now())
  const readOnly = expired || data.state === 'resolved' || (state.resolvedGroupIds ?? EMPTY_SET).has(data.groupId) || !handlers.onConfirm
  const resolutionLabel = data.state === 'resolved' ? data.reason === 'expired' ? 'EXPIRED' : data.reason === 'discarded' ? 'DISCARDED' : 'RESOLVED' : expired ? 'EXPIRED' : 'RESOLVED'
  const resolutionTitle = data.state === 'resolved' ? data.reason === 'expired' ? 'Confirmation expired' : data.reason === 'discarded' ? 'Discarded' : 'Review resolved' : 'Review these actions'
  // Updates one item's local draft.
  const patch = (ordinal: number, value: Partial<(typeof drafts)[number]>) => setDrafts(current => current.map(draft => draft.ordinal === ordinal ? { ...draft, ...value } : draft))
  /** Sends confirm or discard decisions for the batch. */
  function submit(mode: 'all' | 'selected' | 'discard') {
    if (!handlers.onConfirm) return
    handlers.onConfirm(data.groupId, drafts.map(draft => {
      const item = data.items.find(candidate => candidate.ordinal === draft.ordinal)
      const include = mode === 'all' || (mode === 'selected' && draft.selected)
      if (!include) return { ordinal: draft.ordinal, action: 'discard' as const }
      return { ordinal: draft.ordinal, action: 'confirm' as const, edits: { date: draft.date || undefined, description: draft.description !== (item?.description ?? item?.title) ? draft.description : undefined } }
    }))
  }
  return <CardSurface><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.md }}><View style={{ flex: 1, gap: SPACE.xs }}><Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: t.text }}>{resolutionTitle}</Text><Meta>{readOnly ? 'This batch is closed — nothing here is waiting on you.' : 'Edit details or remove anything you do not want to save.'}</Meta></View>{readOnly && <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: t.textMuted }}>{resolutionLabel}</Text>}</View>{data.items.map(item => { const draft = drafts.find(candidate => candidate.ordinal === item.ordinal); const resolutionCopy = item.resolution === 'expired' ? 'Confirmation expired' : item.resolution === 'discarded' ? 'Discarded by you' : null; return <ItemRow key={item.ordinal}><View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm }}>{!readOnly && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft?.selected ?? true }} disabled={pending} onPress={() => patch(item.ordinal, { selected: !(draft?.selected ?? true) })} style={{ minWidth: TAP_MIN, minHeight: TAP_MIN, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: draft?.selected ? t.accent : t.borderMid, backgroundColor: draft?.selected ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{draft?.selected && <Icon name="check" size={15} color={t.textOnInk} sw={3} />}</View></Pressable>}<View style={{ flex: 1, gap: SPACE.xs }}><ItemHeader actionType={item.actionType} title={item.title} />{readOnly ? <><Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 14, color: t.text }}>{item.description ?? item.title}</Text>{resolutionCopy && <Meta>{resolutionCopy}</Meta>}</> : <TextInput value={draft?.description} onChangeText={description => patch(item.ordinal, { description })} editable={!pending} style={{ minHeight: TAP_MIN, borderWidth: 1, borderColor: t.borderMid, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, color: t.text, fontFamily: 'Manrope_500Medium', fontSize: 14 }} />}{readOnly ? item.date && <Meta>{item.date}</Meta> : <TextInput value={draft?.date} onChangeText={date => patch(item.ordinal, { date })} placeholder="YYYY-MM-DD" placeholderTextColor={t.textSubtle} editable={!pending} style={{ minHeight: TAP_MIN, borderWidth: 1, borderColor: t.borderMid, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, color: t.text, fontFamily: 'Manrope_500Medium', fontSize: 14 }} />}{item.validationMessages.length > 0 && <Meta>{item.validationMessages.join(' · ')}</Meta>}</View></View></ItemRow>})}{!readOnly && <View style={{ gap: SPACE.sm }}><Button label={pending ? 'Saving…' : 'Confirm all'} icon="check" disabled={pending} onPress={() => submit('all')} /><Button label="Confirm selected" variant="secondary" icon="check" disabled={pending} onPress={() => submit('selected')} /><Button label="Discard all" variant="ghost" icon="back" disabled={pending} onPress={() => submit('discard')} /></View>}</CardSurface>
}

/** Renders every card for one assistant turn. */
export function ChatTurnCards({ cards, handlers = {}, state = {} }: { cards: ChatTurnCard[]; handlers?: ChatCardHandlers; state?: ChatCardState }) {
  if (cards.length === 0) return null
  return <View style={{ width: '100%', gap: SPACE.md }}>{cards.map((card, index) => <ChatTurnCardView key={`${card.kind}-${index}`} card={card} handlers={handlers} state={state} />)}</View>
}

/** Renders one card by its kind. */
function ChatTurnCardView({ card, handlers, state }: { card: ChatTurnCard; handlers: ChatCardHandlers; state: ChatCardState }) {
  switch (card.kind) {
    case 'confirmation': return <ConfirmationCard data={card.data} handlers={handlers} state={state} />
    case 'clarification': return <ClarificationCard data={card.data} handlers={handlers} state={state} />
    case 'duplicate': return <DuplicateCard data={card.data} handlers={handlers} state={state} />
    case 'result': return <ResultCard data={card.data} />
    case 'failure': return <FailureCard data={card.data} />
    case 'undo': return <UndoCard data={card.data} handlers={handlers} state={state} />
  }
}
