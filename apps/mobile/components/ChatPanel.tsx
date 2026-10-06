import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import * as Haptics from '../lib/haptics'
import { useSubmissionId } from '../lib/submissionId'
import { AgentBadge } from './AgentBadge'
import { ChatTurnCards, assertReturnedTurnCards, parseChatTurnCards, type ChatCardState, type ConfirmationDecision, type DuplicateCardItem, type PersistedChatMessage } from './ChatTurnCards'
import type { ChatTurnCard } from '@stride/shared'
import { Icon } from './Icon'
import { useTheme, SPACE } from './theme'
import { Button, IconBadge } from './ui'

type CanonicalTurn = {
  content: string
  turnOutcome?: unknown
  turnCards: unknown
}

type TurnOverride = CanonicalTurn & { baseline: string }

const GREETING = "Hey — I'm Stry. Tell me what you ate, trained, or how you're feeling, and I'll keep the log canonical."

function groupIdForCard(card: ChatTurnCard): string | undefined {
  return 'groupId' in card.data ? card.data.groupId : undefined
}

function messageSignature(message: PersistedChatMessage): string {
  return JSON.stringify([message.content, message.turnOutcome, message.turnCards, message.actionGroupId])
}

function messageGroupId(message: PersistedChatMessage): string | undefined {
  return message.actionGroupId ?? parseChatTurnCards(message.turnCards).map(groupIdForCard).find(Boolean)
}

function localDateStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function TypingDots() {
  const t = useTheme()
  return <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 4, paddingVertical: 8 }}>{[0, 1, 2].map(i => <Animated.View key={i} entering={FadeInDown.delay(i * 120)} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.textMuted }} />)}</View>
}

function UserBubble({ text }: { text: string }) {
  const t = useTheme()
  return <View style={{ alignItems: 'flex-end' }}><View style={{ maxWidth: '80%', backgroundColor: t.chatUserBg, borderRadius: 18, borderBottomRightRadius: 5, paddingHorizontal: 14, paddingVertical: 10 }}><Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 14, color: t.chatUserText, lineHeight: 21 }}>{text}</Text></View></View>
}

function AssistantMessage({ message, cards, state, onConfirm, onClarify, onUndoItem, onUndoAll, onLogAnyway }: {
  message: PersistedChatMessage
  cards: ReturnType<typeof parseChatTurnCards>
  state: ChatCardState
  onConfirm: (groupId: string, decisions: ConfirmationDecision[]) => void
  onClarify: (groupId: string, date: string) => void
  onUndoItem: (groupId: string, actionId: string) => void
  onUndoAll: (groupId: string) => void
  onLogAnyway: (groupId: string, item: DuplicateCardItem) => void
}) {
  const t = useTheme()
  return <View style={{ maxWidth: '96%', gap: SPACE.md }}><AgentBadge type="overall" />{message.content.trim().length > 0 && <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 14, color: t.text, lineHeight: 21 }}>{message.content}</Text>}<ChatTurnCards cards={cards} state={state} handlers={{ onConfirm, onClarify, onUndoItem, onUndoAll, onLogAnyway }} /></View>
}

type PendingSend = { submissionId: string; text: string }

export function ChatPanel({ initialSessionId }: { initialSessionId?: string }) {
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingGroups, setPendingGroups] = useState<ReadonlySet<string>>(() => new Set())
  const [pendingActions, setPendingActions] = useState<ReadonlySet<string>>(() => new Set())
  const [undoneActions, setUndoneActions] = useState<ReadonlySet<string>>(() => new Set())
  const [turnOverrides, setTurnOverrides] = useState<Record<string, TurnOverride>>({})
  const [activeSessionId, setActiveSessionId] = useState<any>(initialSessionId ?? null)
  const scrollRef = useRef<ScrollView>(null)
  const insets = useSafeAreaInsets()
  const t = useTheme()
  const submissionIds = useSubmissionId()
  const createSession = useMutation(api.chat.createSession)
  const sendToAI = useAction(api.ai.chat)
  const confirmGroup = useAction((api as any).ai.confirmGroup)
  const resolveClarification = useAction(api.ai.resolveClarification)
  const undoAction = useMutation((api as any).actions_undo.undoAction)
  const undoGroup = useMutation((api as any).actions_undo.undoGroup)
  const logAnywayForAction = useAction((api as any).ai.logAnywayForAction)
  const persistedMessages = useQuery(api.chat.getMessages, activeSessionId ? { sessionId: activeSessionId } : 'skip') as PersistedChatMessage[] | undefined
  const messages = persistedMessages ?? []

  const activeClarificationGroupId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const cards = parseChatTurnCards(messages[index].turnCards)
      const clarification = cards.find(card => card.kind === 'clarification')
      if (clarification?.kind === 'clarification') return clarification.data.groupId
      if (cards.length > 0) return null
    }
    return null
  }, [messages])

  const cardState: ChatCardState = {
    pendingGroupIds: pendingGroups,
    pendingActionIds: pendingActions,
    undoneActionIds: undoneActions,
  }

  const addPending = (setter: Dispatch<SetStateAction<ReadonlySet<string>>>, key: string) => setter(current => new Set(current).add(key))
  const removePending = (setter: Dispatch<SetStateAction<ReadonlySet<string>>>, key: string) => setter(current => { const next = new Set(current); next.delete(key); return next })
  const applyTurnOverride = (groupId: string, turn: CanonicalTurn | undefined) => {
    if (!turn || typeof turn.content !== 'string') return
    assertReturnedTurnCards(turn.turnCards)
    const currentMessage = messages.find(message => message.role === 'ai' && messageGroupId(message) === groupId)
    if (!currentMessage) return
    setTurnOverrides(current => ({ ...current, [groupId]: { ...turn, baseline: messageSignature(currentMessage) } }))
  }

  useEffect(() => {
    if (!pendingSend) return
    const landed = messages.some(message => message.role === 'ai' && message.clientSubmissionId === pendingSend.submissionId)
    if (landed) setPendingSend(null)
  }, [messages, pendingSend])

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
    return () => clearTimeout(timer)
  }, [messages, pendingSend, running, notice])

  async function submit(rawText: string, clarificationGroupId?: string) {
    const text = rawText.trim()
    if (!text || running) return
    const submissionKey = clarificationGroupId ? `clarification:${clarificationGroupId}:${text}` : text
    const clientSubmissionId = submissionIds.idFor(submissionKey)
    setInput('')
    setNotice(null)
    setPendingSend({ submissionId: clientSubmissionId, text })
    setRunning(true)
    try {
      let sessionId = activeSessionId
      if (!sessionId) {
        const session = await createSession({ title: text.slice(0, 40) })
        sessionId = session.id
        setActiveSessionId(sessionId)
      }
      await sendToAI({
        message: text,
        sessionId,
        coachType: 'auto',
        today: localDateStr(),
        clarificationGroupId: clarificationGroupId ?? undefined,
        clientSubmissionId,
      })
      submissionIds.clear()
    } catch (error) {
      setPendingSend(null)
      setInput(text)
      setNotice(error instanceof Error ? error.message : 'Could not reach Stry right now. Try sending again.')
    } finally {
      setRunning(false)
    }
  }

  function handleConfirm(groupId: string, decisions: ConfirmationDecision[]) {
    if (pendingGroups.has(groupId)) return
    addPending(setPendingGroups, groupId)
    void (async () => {
      try {
        const result = await confirmGroup({ groupId, decisions }) as {
          status?: string
          results?: Array<{ status?: string }>
          unresolvedItems?: unknown[]
          turn?: CanonicalTurn
        }
        applyTurnOverride(groupId, result.turn)
        if (result.status === 'expired') {
          setNotice('Confirmation expired — this batch can no longer be saved.')
        } else if (result.unresolvedItems?.length) {
          setNotice('Some items need attention — saved items remain available to undo.')
        } else if (result.status === 'discarded') {
          setNotice('Discarded — no items were saved.')
        } else if (result.turn?.turnOutcome === 'no_action' || result.results?.length === 0) {
          setNotice('Nothing was saved — no changes were made.')
        } else if (result.status === 'committed') {
          setNotice('Saved — confirmed items were logged.')
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'That action failed — please try again.')
      } finally {
        removePending(setPendingGroups, groupId)
      }
    })()
  }

  function handleClarify(groupId: string, date: string) {
    if (pendingGroups.has(groupId)) return
    addPending(setPendingGroups, groupId)
    void (async () => {
      try {
        await resolveClarification({ groupId: groupId as never, date })
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'That clarification could not be saved.')
      } finally {
        removePending(setPendingGroups, groupId)
      }
    })()
  }

  function handleUndoItem(groupId: string, actionId: string) {
    if (pendingActions.has(actionId)) return
    addPending(setPendingActions, actionId)
    void (async () => {
      try {
        const result = await undoAction({ actionId: actionId as never }) as {
          status: 'undone' | 'already_undone' | 'skipped'
          reason?: string
          turn?: CanonicalTurn
        }
        applyTurnOverride(groupId, result.turn)
        if (result.status === 'undone' || result.status === 'already_undone') {
          setUndoneActions(current => new Set(current).add(actionId))
          setNotice(null)
        } else setNotice(result.reason ?? 'That entry was not reversed.')
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'That action failed — please try again.')
      } finally {
        removePending(setPendingActions, actionId)
      }
    })()
  }

  function handleUndoAll(groupId: string) {
    const key = `group:${groupId}`
    if (pendingActions.has(key)) return
    addPending(setPendingActions, key)
    void (async () => {
      try {
        const result = await undoGroup({ groupId: groupId as never }) as {
          results: Array<{ actionId: string; status: 'undone' | 'already_undone' | 'skipped'; reason?: string }>
          turn?: CanonicalTurn
        }
        applyTurnOverride(groupId, result.turn)
        const undone = result.results.filter(item => item.status === 'undone')
        const alreadyUndone = result.results.filter(item => item.status === 'already_undone')
        const successful = [...undone, ...alreadyUndone]
        if (successful.length > 0) {
          setUndoneActions(current => {
            const next = new Set(current)
            successful.forEach(item => next.add(item.actionId))
            return next
          })
        }
        const skipped = result.results.filter(item => item.status === 'skipped')
        if (skipped.length > 0) {
          const acknowledgements = [
            undone.length > 0 ? `${undone.length} item${undone.length === 1 ? '' : 's'} reversed.` : '',
            alreadyUndone.length > 0 ? `${alreadyUndone.length} already undone.` : '',
          ].filter(Boolean).join(' ')
          const skippedDetail = skipped.map(item => item.reason).filter(Boolean).join('; ') || `${skipped.length} item${skipped.length === 1 ? ' was' : 's were'} not reversed.`
          setNotice([acknowledgements, skippedDetail].filter(Boolean).join(' '))
        } else if (successful.length === 0) {
          setNotice('No saved items were reversed.')
        } else setNotice(null)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'That action failed — please try again.')
      } finally {
        removePending(setPendingActions, key)
      }
    })()
  }

  function handleLogAnyway(groupId: string, item: DuplicateCardItem) {
    if (pendingActions.has(item.actionId)) return
    addPending(setPendingActions, item.actionId)
    void (async () => {
      try {
        const result = await logAnywayForAction({ actionId: item.actionId as never }) as { turn?: CanonicalTurn }
        if (!result.turn || result.turn.turnOutcome !== 'committed' || typeof result.turn.content !== 'string') throw new Error('The log completed without a resolved result.')
        applyTurnOverride(groupId, result.turn)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'That log could not be completed. Nothing was marked as committed.')
      } finally {
        removePending(setPendingActions, item.actionId)
      }
    })()
  }

  const pendingUserPersisted = pendingSend ? messages.some(message => message.role === 'user' && message.clientSubmissionId === pendingSend.submissionId) : false
  const showGreeting = messages.length === 0 && !pendingSend
  const composerBottom = Math.max(insets.bottom, 12)

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><View style={{ flex: 1, backgroundColor: t.bg }}><ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
    {showGreeting && <View style={{ maxWidth: '96%' }}><AgentBadge type="overall" /><Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 14, color: t.text, lineHeight: 21, marginTop: SPACE.md }}>{GREETING}</Text></View>}
    {messages.map((message, index) => {
      if (message.role === 'user') return <UserBubble key={`${message.clientSubmissionId ?? 'user'}-${index}`} text={message.content} />
      const groupId = messageGroupId(message)
      const storedOverride = groupId ? turnOverrides[groupId] : undefined
      const override = storedOverride?.baseline === messageSignature(message) ? storedOverride : undefined
      const cards = parseChatTurnCards(override?.turnCards ?? message.turnCards)
      return <AssistantMessage key={`${message.clientSubmissionId ?? 'assistant'}-${index}`} message={{ ...message, content: override?.content ?? message.content }} cards={cards} state={cardState} onConfirm={handleConfirm} onClarify={handleClarify} onUndoItem={handleUndoItem} onUndoAll={handleUndoAll} onLogAnyway={handleLogAnyway} />
    })}
    {pendingSend && !pendingUserPersisted && <UserBubble text={pendingSend.text} />}
    {pendingSend && <View style={{ maxWidth: '96%', backgroundColor: t.card, borderRadius: 18, paddingHorizontal: 12, alignSelf: 'flex-start' }}><TypingDots /></View>}
    {notice && <View style={{ maxWidth: '96%', gap: SPACE.sm }}><Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 14, color: t.textMuted, lineHeight: 21 }}>{notice}</Text><Button label="Try again" size="sm" variant="secondary" disabled={running || !input.trim()} onPress={() => void submit(input, activeClarificationGroupId ?? undefined)} /></View>}
  </ScrollView><View style={{ paddingHorizontal: 12, paddingBottom: composerBottom, paddingTop: 8 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.card, borderRadius: 28, paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderColor: t.border }}><IconBadge icon="chat" size={18} badgeSize={40} bg={t.dimBgMid} color={t.textMuted} /><TextInput value={input} onChangeText={value => { setInput(value); setNotice(null) }} onSubmitEditing={() => void submit(input, activeClarificationGroupId ?? undefined)} placeholder="Message Stry…" placeholderTextColor={t.textSubtle} editable={!running} style={{ flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 15, color: t.text, paddingHorizontal: 4, minHeight: 40 }} returnKeyType="send" /><Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); void submit(input, activeClarificationGroupId ?? undefined) }} disabled={running || !input.trim()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: !running && input.trim() ? t.buttonPrimaryBg : t.dimBgMid, alignItems: 'center', justifyContent: 'center' }}><Icon name="send" size={17} color={!running && input.trim() ? t.buttonPrimaryText : t.textSubtle} /></Pressable></View></View></View></KeyboardAvoidingView>
}
