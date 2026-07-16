import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { AgentType } from '../data'
import * as Haptics from '../lib/haptics'
import { AgentBadge } from './AgentBadge'
import { MealLogCard } from './MealLogCard'
import { MacroCard } from './MacroCard'
import { WorkoutSessionCard } from './WorkoutSessionCard'
import { Icon } from './Icon'
import { useTheme, SPACE } from './theme'
import { Button, IconBadge } from './ui'

type MacroData = { kcal: number; protein: number; carbs: number; fat: number }
type LoggedItem = { type: string; data: any }
type UndoEntry = { actionId: string; groupId: string; label: string; type: string; undone?: boolean }
type ClarificationPayload = { groupId: string; items: Array<{ actionType: string; description: string; reason: string; resolvedDate?: string; confidence?: number }>; question: string }
type ConfirmationItem = { actionType: string; description: string; resolvedDate?: string; confidence?: number; provenance: string; validation: { status: string; messages: string[] }; ordinal: number }
type ConfirmationPayload = { groupId: string; items: ConfirmationItem[] }
type ConfirmationResult = { status: string; results?: Array<{ ordinal: number; status: string; error?: string }> }

type Block =
  | { kind: 'text'; text: string }
  | { kind: 'meal'; data: MacroData & { meal: string; time: string } }
  | { kind: 'macro'; data: MacroData }
  | { kind: 'workout'; data: any }
  | { kind: 'record'; text: string }

type Message =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; agent: AgentType; typing: boolean; blocks: Block[] }
  | { id: string; role: 'undo'; groupId?: string; entries: UndoEntry[] }
  | { id: string; role: 'clarification'; payload: ClarificationPayload; resolved?: boolean }
  | { id: string; role: 'confirmation'; payload: ConfirmationPayload; result?: ConfirmationResult }

const GREETING: Message = {
  id: 'greeting', role: 'assistant', agent: 'overall', typing: false,
  blocks: [{ kind: 'text', text: "Hey — I'm Stry. Tell me what you ate, trained, or how you're feeling, and I'll keep the log canonical." }],
}

function localDateStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function coachToAgent(coachType?: string): AgentType {
  const map: Record<string, AgentType> = { overall: 'overall', general: 'overall', diet: 'diet', nutrition: 'diet', workout: 'workout', recovery: 'sleep', water: 'hydration', hydration: 'hydration', habit: 'habits', mindset: 'mental', wellness: 'mental' }
  return map[coachType ?? 'overall'] ?? 'overall'
}

function loggedItemsFrom(value: unknown): LoggedItem[] {
  if (!value || typeof value !== 'object') return []
  const item = value as LoggedItem
  const multipleItems = Array.isArray((item as any).items) ? (item as any).items : item.data?.items
  return item.type === 'multiple' && Array.isArray(multipleItems) ? multipleItems : [item]
}

function blocksFromLoggedItems(items: LoggedItem[]): Block[] {
  return items.flatMap((item): Block[] => {
    const data = item.data ?? {}
    if (item.type === 'meal') return [{ kind: 'meal' as const, data: { meal: data.name ?? 'Meal', time: data.time ?? 'Logged today', kcal: Math.round(data.calories ?? 0), protein: Math.round(data.protein ?? 0), carbs: Math.round(data.carbs ?? 0), fat: Math.round(data.fat ?? 0) } }]
    if (item.type === 'workout') return [{ kind: 'workout' as const, data }]
    if (item.type === 'water') return [{ kind: 'record' as const, text: `Water logged: ${data.ml ?? 0}ml.` }]
    if (item.type === 'sleep') return [{ kind: 'record' as const, text: `Sleep logged: ${data.hours ?? data.band ?? 'reported'}.` }]
    if (item.type === 'mood') return [{ kind: 'record' as const, text: `Mood logged: ${data.rating ?? 'reported'}/5.` }]
    if (item.type === 'steps') return [{ kind: 'record' as const, text: `Steps logged: ${data.count ?? 0}.` }]
    return []
  })
}

function undoEntriesFrom(items: LoggedItem[]): UndoEntry[] {
  return items.flatMap((item) => item.data?.actionId && item.data?.groupId && item.data?._id
    ? [{ actionId: String(item.data.actionId), groupId: String(item.data.groupId), type: item.type, label: item.data.name ?? `${item.type} entry` }]
    : [])
}

function TypingDots() {
  const t = useTheme()
  return <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 4, paddingVertical: 8 }}>{[0, 1, 2].map(i => <Animated.View key={i} entering={FadeInDown.delay(i * 120)} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.textMuted }} />)}</View>
}

function BlockView({ block }: { block: Block }) {
  const t = useTheme()
  if (block.kind === 'text' || block.kind === 'record') return <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 14, color: t.text, lineHeight: 21 }}>{block.text}</Text>
  if (block.kind === 'meal') return <MealLogCard meal={block.data.meal} time={block.data.time} macros={block.data} confirmed />
  if (block.kind === 'macro') return <MacroCard {...block.data} />
  const data = block.data
  let exercises: Array<{ name: string; sets: Array<{ weight: string; reps: number }> }> = []
  if (Array.isArray(data.exercises)) exercises = data.exercises
  return <WorkoutSessionCard session={{ title: data.name ?? 'Workout', date: data.date ?? 'Logged today', durationMin: Number.parseInt(data.duration ?? '', 10) || 0, burnKcal: data.caloriesBurned ?? 0, exercises }} />
}

function UserBubble({ message }: { message: Extract<Message, { role: 'user' }> }) {
  const t = useTheme()
  return <View style={{ alignItems: 'flex-end' }}><View style={{ maxWidth: '80%', backgroundColor: t.chatUserBg, borderRadius: 18, borderBottomRightRadius: 5, paddingHorizontal: 14, paddingVertical: 10 }}><Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 14, color: t.chatUserText, lineHeight: 21 }}>{message.text}</Text></View></View>
}

function UndoCard({ message, onUndo, onUndoGroup, pending }: { message: Extract<Message, { role: 'undo' }>; onUndo: (entry: UndoEntry) => void; onUndoGroup: () => void; pending: Set<string> }) {
  const t = useTheme()
  const groupPending = message.groupId ? pending.has(`group:${message.groupId}`) : false
  return <View style={{ backgroundColor: t.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: t.border, gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: t.text }}>Saved entries</Text>{message.entries.length > 1 && message.groupId ? <Button label={groupPending ? 'Undoing all' : 'Undo all'} size="sm" variant="secondary" disabled={groupPending} onPress={onUndoGroup} /> : null}</View>
    {message.entries.map(entry => <Pressable key={entry.actionId} disabled={entry.undone || pending.has(entry.actionId)} onPress={() => onUndo(entry)} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border, opacity: entry.undone ? 0.5 : 1 }}><Text style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: entry.undone ? t.textMuted : t.accent }}>{entry.undone ? `${entry.label} reversed` : pending.has(entry.actionId) ? `Undoing ${entry.label}` : `Undo ${entry.label}`}</Text></Pressable>)}
  </View>
}

function ClarificationCard({ message, pending, onResolve }: { message: Extract<Message, { role: 'clarification' }>; pending: boolean; onResolve: (date: string) => void }) {
  const t = useTheme()
  const [date, setDate] = useState(message.payload.items[0]?.resolvedDate ?? '')
  return <View style={{ backgroundColor: t.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: t.border, gap: 10, opacity: message.resolved ? 0.6 : 1 }}>
    <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: t.text }}>{message.resolved ? 'Date clarified' : message.payload.question}</Text>
    {!message.resolved && <><Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 12, color: t.textMuted }}>{message.payload.items.map(item => item.description).join(' · ')}</Text><TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={t.textSubtle} style={{ borderWidth: 1, borderColor: t.borderMid, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: t.text, fontFamily: 'Manrope_500Medium' }} /><Button label={pending ? 'Saving…' : 'Use this date'} disabled={pending || !/^\d{4}-\d{2}-\d{2}$/.test(date)} onPress={() => onResolve(date)} /></>}
  </View>
}

function ConfirmationCard({ message, pending, onConfirm }: { message: Extract<Message, { role: 'confirmation' }>; pending: boolean; onConfirm: (decisions: Array<{ ordinal: number; action: 'confirm' | 'discard'; edits?: { date?: string; description?: string } }>) => void }) {
  const t = useTheme()
  const [selected, setSelected] = useState<Record<number, boolean>>(() => Object.fromEntries(message.payload.items.map(item => [item.ordinal, true])))
  const [drafts, setDrafts] = useState<Record<number, { date: string; description: string }>>(() => Object.fromEntries(message.payload.items.map(item => [item.ordinal, { date: item.resolvedDate ?? '', description: item.description }])))
  const disabled = pending || message.result?.status === 'expired'
  function decisions(mode: 'all' | 'selected' | 'discard') {
    onConfirm(message.payload.items.map(item => {
      const keep = mode === 'all' || (mode === 'selected' && selected[item.ordinal])
      const draft = drafts[item.ordinal]
      return { ordinal: item.ordinal, action: keep ? 'confirm' as const : 'discard' as const, ...(keep ? { edits: { date: draft.date || undefined, description: draft.description !== item.description ? draft.description : undefined } } : {}) }
    }))
  }
  return <View style={{ backgroundColor: t.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: t.border, gap: 10 }}>
    <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: t.text }}>{message.result?.status === 'expired' ? 'Confirmation expired' : 'Review these actions'}</Text>
    {message.payload.items.map(item => <View key={item.ordinal} style={{ borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 10, gap: 7, opacity: selected[item.ordinal] ? 1 : 0.55 }}>
      <Pressable disabled={disabled} onPress={() => setSelected(current => ({ ...current, [item.ordinal]: !current[item.ordinal] }))}><Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 12, color: t.text }}>{selected[item.ordinal] ? '✓ ' : '○ '}{item.actionType} · {item.provenance} {item.confidence != null ? `· ${Math.round(item.confidence * 100)}%` : ''}</Text></Pressable>
      <TextInput value={drafts[item.ordinal]?.description} editable={!disabled} onChangeText={description => setDrafts(current => ({ ...current, [item.ordinal]: { ...current[item.ordinal], description } }))} style={{ borderWidth: 1, borderColor: t.borderMid, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, color: t.text, fontFamily: 'Manrope_500Medium', fontSize: 12 }} />
      <TextInput value={drafts[item.ordinal]?.date} editable={!disabled} onChangeText={date => setDrafts(current => ({ ...current, [item.ordinal]: { ...current[item.ordinal], date } }))} placeholder="YYYY-MM-DD" placeholderTextColor={t.textSubtle} style={{ borderWidth: 1, borderColor: t.borderMid, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, color: t.text, fontFamily: 'Manrope_500Medium', fontSize: 12 }} />
      {item.validation.messages.length > 0 && <Text style={{ color: t.textMuted, fontSize: 11 }}>{item.validation.messages.join(' · ')}</Text>}
    </View>)}
    {!message.result?.status || message.result.status === 'pending' ? <View style={{ gap: 8 }}><Button label={pending ? 'Saving…' : 'Confirm all'} disabled={disabled} onPress={() => decisions('all')} /><Button label="Confirm selected" variant="secondary" disabled={disabled} onPress={() => decisions('selected')} /><Button label="Discard all" variant="ghost" disabled={disabled} onPress={() => decisions('discard')} /></View> : <Text style={{ color: t.textMuted, fontSize: 11 }}>Group status: {message.result.status}</Text>}
  </View>
}

function AssistantMessage({ message }: { message: Extract<Message, { role: 'assistant' }> }) {
  const t = useTheme()
  return <View style={{ maxWidth: '94%', gap: 8 }}><AgentBadge type={message.agent} />{message.typing ? <View style={{ backgroundColor: t.card, borderRadius: 18, paddingHorizontal: 12, alignSelf: 'flex-start' }}><TypingDots /></View> : message.blocks.map((block, index) => <Animated.View key={index} entering={FadeInDown.delay(index * 70)}><BlockView block={block} /></Animated.View>)}</View>
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [activeSessionId, setActiveSessionId] = useState<any>(null)
  const [activeClarificationGroupId, setActiveClarificationGroupId] = useState<string | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  const insets = useSafeAreaInsets()
  const t = useTheme()
  const createSession = useMutation(api.chat.createSession)
  const sendToAI = useAction(api.ai.chat)
  const undoAction = useMutation((api as any).actions_undo.undoAction)
  const undoGroup = useMutation((api as any).actions_undo.undoGroup)
  const resolveClarification = useAction(api.ai.resolveClarification)
  const confirmGroup = useAction((api as any).ai.confirmGroup)
  const persistedMessages = useQuery(api.chat.getMessages, activeSessionId ? { sessionId: activeSessionId } : 'skip') as Array<{ role: string; content: string }> | undefined

  useEffect(() => { if (!activeSessionId || !persistedMessages || messages.length > 1) return; const restored = persistedMessages.map((message, index): Message => message.role === 'user' ? { id: `persisted-user-${index}`, role: 'user', text: message.content } : { id: `persisted-ai-${index}`, role: 'assistant', agent: 'overall', typing: false, blocks: [{ kind: 'text', text: message.content }] }); if (restored.length) setMessages(restored) }, [activeSessionId, persistedMessages, messages.length])
  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50) }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || running) return
    setInput('')
    const botId = `assistant-${Date.now()}`
    setMessages(current => [...current, { id: `user-${Date.now()}`, role: 'user', text }, { id: botId, role: 'assistant', agent: 'overall', typing: true, blocks: [] }])
    setRunning(true)
    try {
      let sessionId = activeSessionId
      if (!sessionId) { const session = await createSession({ title: text.slice(0, 40) }); sessionId = session.id; setActiveSessionId(sessionId) }
      const result = await sendToAI({ message: text, sessionId, coachType: 'auto', today: localDateStr(), clarificationGroupId: activeClarificationGroupId ?? undefined }) as any
      const loggedItems = loggedItemsFrom(result.loggedItem)
      const blocks: Block[] = [{ kind: 'text', text: typeof result.reply === 'string' ? result.reply : 'Saved.' }, ...blocksFromLoggedItems(loggedItems)]
      setMessages(current => current.map(message => message.id === botId && message.role === 'assistant' ? { ...message, agent: coachToAgent(result.coachType), typing: false, blocks } : message))
      const undoEntries = undoEntriesFrom(loggedItems)
      if (undoEntries.length) setMessages(current => [...current, { id: `undo-${Date.now()}`, role: 'undo', groupId: undoEntries[0].groupId, entries: undoEntries }])
      if (result.clarification?.groupId) { setActiveClarificationGroupId(result.clarification.groupId); setMessages(current => [...current, { id: `clarify-${Date.now()}`, role: 'clarification', payload: result.clarification }]) }
      if (result.confirmation?.groupId) setMessages(current => [...current, { id: `confirm-${Date.now()}`, role: 'confirmation', payload: result.confirmation }])
    } catch (error) {
      setMessages(current => current.map(message => message.id === botId && message.role === 'assistant' ? { ...message, typing: false, blocks: [{ kind: 'text', text: error instanceof Error ? error.message : 'Could not reach Stry right now.' }] } : message))
    } finally { setRunning(false) }
  }

  async function undoOne(messageId: string, entry: UndoEntry) {
    if (entry.undone || pending.has(entry.actionId)) return
    setPending(current => new Set(current).add(entry.actionId))
    try { await undoAction({ actionId: entry.actionId as never }); setMessages(current => current.map(message => message.id === messageId && message.role === 'undo' ? { ...message, entries: message.entries.map(item => item.actionId === entry.actionId ? { ...item, undone: true } : item) } : message)) } finally { setPending(current => { const next = new Set(current); next.delete(entry.actionId); return next }) }
  }

  async function undoAll(messageId: string, groupId: string) {
    const key = `group:${groupId}`
    if (pending.has(key)) return
    setPending(current => new Set(current).add(key))
    try { const result = await undoGroup({ groupId: groupId as never }) as { results?: Array<{ actionId: string; status: string }> }; const undone = new Set((result.results ?? []).filter(item => item.status === 'undone' || item.status === 'already_undone').map(item => item.actionId)); setMessages(current => current.map(message => message.id === messageId && message.role === 'undo' ? { ...message, entries: message.entries.map(entry => undone.has(entry.actionId) ? { ...entry, undone: true } : entry) } : message)) } finally { setPending(current => { const next = new Set(current); next.delete(key); return next }) }
  }

  async function resolve(messageId: string, groupId: string, date: string) {
    const key = `clarify:${groupId}`
    setPending(current => new Set(current).add(key))
    try { const result = await resolveClarification({ groupId: groupId as never, date }) as any; setActiveClarificationGroupId(null); setMessages(current => current.map(message => message.id === messageId && message.role === 'clarification' ? { ...message, resolved: true } : message)); const items = loggedItemsFrom(result.loggedItems?.length === 1 ? result.loggedItems[0] : { type: 'multiple', data: { items: result.loggedItems ?? [] } }); const entries = undoEntriesFrom(items); if (entries.length) setMessages(current => [...current, { id: `undo-${Date.now()}`, role: 'undo', groupId: entries[0].groupId, entries }]) } finally { setPending(current => { const next = new Set(current); next.delete(key); return next }) }
  }

  async function confirm(messageId: string, groupId: string, decisions: Array<{ ordinal: number; action: 'confirm' | 'discard'; edits?: { date?: string; description?: string } }>) {
    const key = `confirm:${groupId}`
    setPending(current => new Set(current).add(key))
    try { const result = await confirmGroup({ groupId: groupId as never, decisions }) as ConfirmationResult & { loggedItems?: LoggedItem[] }; setMessages(current => current.map(message => message.id === messageId && message.role === 'confirmation' ? { ...message, result } : message)); const items = loggedItemsFrom(result.loggedItems?.length === 1 ? result.loggedItems[0] : { type: 'multiple', data: { items: result.loggedItems ?? [] } }); const entries = undoEntriesFrom(items); if (entries.length) setMessages(current => [...current, { id: `undo-${Date.now()}`, role: 'undo', groupId: entries[0].groupId, entries }]) } finally { setPending(current => { const next = new Set(current); next.delete(key); return next }) }
  }

  const composerBottom = Math.max(insets.bottom, 12)
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><View style={{ flex: 1, backgroundColor: t.bg }}><ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16, gap: 16 }} showsVerticalScrollIndicator={false}>{messages.map(message => message.role === 'user' ? <UserBubble key={message.id} message={message} /> : message.role === 'assistant' ? <AssistantMessage key={message.id} message={message} /> : message.role === 'undo' ? <UndoCard key={message.id} message={message} pending={pending} onUndo={entry => { void undoOne(message.id, entry) }} onUndoGroup={() => { if (message.groupId) void undoAll(message.id, message.groupId) }} /> : message.role === 'clarification' ? <ClarificationCard key={message.id} message={message} pending={pending.has(`clarify:${message.payload.groupId}`)} onResolve={date => { void resolve(message.id, message.payload.groupId, date) }} /> : <ConfirmationCard key={message.id} message={message} pending={pending.has(`confirm:${message.payload.groupId}`)} onConfirm={decisions => { void confirm(message.id, message.payload.groupId, decisions) }} />)}</ScrollView><View style={{ paddingHorizontal: 12, paddingBottom: composerBottom, paddingTop: 8 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.card, borderRadius: 28, paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderColor: t.border }}><IconBadge icon="chat" size={18} badgeSize={40} bg={t.dimBgMid} color={t.textMuted} /><TextInput value={input} onChangeText={setInput} onSubmitEditing={send} placeholder="Message Stry…" placeholderTextColor={t.textSubtle} editable={!running} style={{ flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 15, color: t.text, paddingHorizontal: 4, minHeight: 40 }} returnKeyType="send" /><Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); void send() }} disabled={running || !input.trim()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: !running && input.trim() ? t.buttonPrimaryBg : t.dimBgMid, alignItems: 'center', justifyContent: 'center' }}><Icon name="send" size={17} color={!running && input.trim() ? t.buttonPrimaryText : t.textSubtle} /></Pressable></View></View></View></KeyboardAvoidingView>
}
