import { memo, useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Image, ScrollView, Text, TextInput, View, type ListRenderItemInfo } from 'react-native'
import Animated, { FadeIn, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { launchCameraAsync, launchImageLibraryAsync, requestCameraPermissionsAsync } from 'expo-image-picker'
import { useAuth } from '@clerk/expo'
import type { FunctionReturnType } from 'convex/server'
import { useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import type { Id } from 'stride-backend/convex/_generated/dataModel'
import { layout, motion, radii } from '@stride/ui-tokens'
import { Button, RoundButton, Tag } from '@/components/Controls'
import { ChatMessage, type ChatMessageView } from '@/components/ChatMessage'
import { Icon } from '@/components/Icon'
import { LogProvider } from '@/components/LogProvider'
import { Polo } from '@/components/Polo'
import { Sheet } from '@/components/Sheet'
import { Tap } from '@/components/Tap'
import { formatNumber } from '@/lib/format'
import { SUMMARY_DAYS, newSubmissionId, plainError, PlainError, targetsFor, uploadPhoto, type StorageId } from '@/lib/log'
import { useLocalToday } from '@/lib/useLocalToday'
import { font, themedStyles, useTheme } from '@/theme'

type ChatSummary = NonNullable<FunctionReturnType<typeof api.chats.getChat>>

// One send: the text and photo, with the submission id that keeps a retry from running twice.
type Attempt = { submissionId: string; text: string; photoUri?: string }

// What the starter prompts look at: today's intake against target, and the weight trend.
type DayContext = {
  entryCount: number
  kcalEaten: number
  kcalTarget: number
  proteinEaten: number
  proteinTarget: number
  weeklyRateKg: number | null
}

// Prompts that always fit, used to fill the list to four.
const FILLERS = ["How's my week going?", 'What should I eat before training?', 'What should I eat next?']
// Weekly trend gain that counts as "going up", the same cut-off Today uses for "heading up".
const RISING_KG_PER_WEEK = 0.05

// Four opening prompts for an empty chat: what the user's day suggests first, then the fillers.
function startersFor(day: DayContext): string[] {
  const prompts: string[] = []
  const left = Math.round(day.kcalTarget - day.kcalEaten)
  if (day.entryCount === 0) prompts.push("What's a good breakfast for me?")
  if (day.proteinEaten < 0.6 * day.proteinTarget) prompts.push('How do I hit my protein today?')
  if (left > 300) prompts.push(`Plan dinner for the ${formatNumber(left)} kcal I have left`)
  if (day.weeklyRateKg !== null && day.weeklyRateKg > RISING_KG_PER_WEEK) prompts.push('Why did my weight go up?')
  for (const fill of FILLERS) if (prompts.length < 4) prompts.push(fill)
  return prompts
}

// Returns a copy of the attempt map without one submission.
function withoutAttempt(attempts: Map<string, Attempt>, submissionId: string): Map<string, Attempt> {
  const next = new Map(attempts)
  next.delete(submissionId)
  return next
}

// Stable list key for a message.
function keyForMessage(message: ChatMessageView): string {
  return message._id
}

// Leaves the thread, falling back to Coach when it was opened directly.
function leave() {
  if (router.canGoBack()) router.back()
  else router.replace('/coach')
}

// Chat thread route (mock v5 #/thread, v7 #/thread-stream): streamed replies, stop, regenerate, photos and Log this.
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: Id<'chats'> }>()
  const chat = useQuery(api.chats.getChat, { chatId: id })

  // Logs from a reply open their own sheet, so the thread mounts its own LogProvider.
  return <LogProvider>{chat === undefined ? <Waiting /> : chat ? <Thread chat={chat} /> : <Gone />}</LogProvider>
}

// Header row (mock v5 .chat-head): back, the chat title and a "Sees logs" tag.
function Header({ title }: { title?: string }) {
  const s = useStyles()
  const insets = useSafeAreaInsets()
  return (
    <View style={[s.header, { paddingTop: insets.top + 8 }]}>
      <RoundButton icon="back" label="Back to chats" tone="plain" onPress={leave} />
      <Text style={s.title} numberOfLines={1} accessibilityRole="header">
        {title ?? ''}
      </Text>
      {title ? <Tag text="Sees logs" /> : null}
    </View>
  )
}

// Shown while the chat list loads, before the thread knows its title.
function Waiting() {
  const s = useStyles()
  return (
    <View style={s.flex}>
      <Header />
      <View style={s.center}>
        <Polo size={56} />
        <Text style={s.note}>Opening the chat…</Text>
      </View>
    </View>
  )
}

// Shown when the chat id matches no chat the user still has.
function Gone() {
  const s = useStyles()
  return (
    <View style={s.flex}>
      <Header />
      <View style={s.center}>
        <Polo size={56} mood="sleep" />
        <Text style={s.note}>This chat is gone.</Text>
        <Button label="Back to chats" size="sm" variant="ghost" onPress={leave} />
      </View>
    </View>
  )
}

// The thread itself: messages newest first, starters when empty, and the composer.
function Thread({ chat }: { chat: ChatSummary }) {
  const s = useStyles()
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const keyboard = useAnimatedKeyboard()
  const { getToken } = useAuth()
  const page = usePaginatedQuery(api.chats.listMessages, { chatId: chat._id }, { initialNumItems: 30 })
  const sendMessage = useAction(api.chats.sendMessage)
  const regenerate = useAction(api.chats.regenerate)
  const stopMessage = useMutation(api.chats.stopMessage)
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl)
  const [sending, setSending] = useState(false)
  // Sends that threw, by submission id, so each failed reply can resend its own message with the same id.
  const [attempts, setAttempts] = useState<Map<string, Attempt>>(new Map())
  const [problem, setProblem] = useState<{ text: string; retry?: Attempt } | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  const messages = useMemo(() => page.results.filter((m) => m.role !== 'tool'), [page.results])
  const latestIndex = messages.findIndex((m) => m.role === 'assistant')
  const latestReply = latestIndex === -1 ? undefined : messages[latestIndex]
  const latestReplyId = latestReply?._id
  // The backend can't regenerate a photo reply yet, so the control hides for those.
  const askedWithPhoto = messages.slice(latestIndex + 1).find((m) => m.role === 'user')?.attachments.some((a) => a.kind === 'image') ?? false
  const streaming = latestReply?.status === 'streaming'
  const failedAttempt = problem?.retry

  // Lifts the whole thread above the keyboard so the list shrinks and the composer stays in view.
  const lift = useAnimatedStyle(() => ({ paddingBottom: Math.max(insets.bottom, keyboard.height.value) }))

  // Uploads a picked photo and returns its storage id.
  const uploadAttachment = useCallback(
    async (uri: string): Promise<StorageId> => {
      const token = await getToken({ template: 'convex' })
      if (!token) throw new PlainError('You are signed out. Sign in again.')
      return uploadPhoto(await generateUploadUrl({}), uri, token)
    },
    [getToken, generateUploadUrl],
  )

  // Sends one attempt. Its submission id is reused on retry, so the server runs the turn once.
  const send = useCallback(
    async (attempt: Attempt) => {
      setProblem(null)
      setSending(true)
      try {
        const imageStorageId = attempt.photoUri ? await uploadAttachment(attempt.photoUri) : undefined
        await sendMessage({ chatId: chat._id, submissionId: attempt.submissionId, text: attempt.text || undefined, imageStorageId })
        setAttempts((prev) => withoutAttempt(prev, attempt.submissionId))
      } catch (err) {
        setAttempts((prev) => new Map(prev).set(attempt.submissionId, attempt))
        setProblem({ text: plainError(err), retry: attempt })
      } finally {
        setSending(false)
      }
    },
    [chat._id, sendMessage, uploadAttachment],
  )

  // Sends what the composer holds as a new message.
  const submitTyped = useCallback((text: string, photoUri?: string) => void send({ submissionId: newSubmissionId(), text, photoUri }), [send])

  // Shows a problem line above the composer.
  const reportProblem = useCallback((text: string) => setProblem({ text }), [])

  // Stops the reply that is streaming now. The partial text stays.
  const stop = useCallback(() => {
    if (!latestReplyId) return
    void stopMessage({ messageId: latestReplyId }).catch((err: unknown) => setProblem({ text: plainError(err) }))
  }, [latestReplyId, stopMessage])

  // Replaces the newest reply.
  const regenerateReply = useCallback(() => {
    setRegenerating(true)
    setProblem(null)
    void regenerate({ chatId: chat._id })
      .catch((err: unknown) => setProblem({ text: plainError(err) }))
      .finally(() => setRegenerating(false))
  }, [chat._id, regenerate])

  // Resends the failed attempt that a reply answers, if it is still known.
  const retry = useCallback(
    (submissionId: string) => {
      const attempt = attempts.get(submissionId)
      if (attempt) void send(attempt)
    },
    [attempts, send],
  )

  // One row of the inverted list: a message, with regenerate only on the newest reply.
  const renderMessage = useCallback(
    ({ item }: ListRenderItemInfo<ChatMessageView>) => {
      const isLatest = item._id === latestReplyId
      const retryId = item.status === 'failed' ? item.retrySubmissionId : null
      return (
        <ChatMessage
          message={item}
          canRegenerate={isLatest && !askedWithPhoto}
          regenerating={isLatest && regenerating}
          canRetry={retryId !== null && attempts.has(retryId)}
          onRegenerate={regenerateReply}
          onRetry={retry}
        />
      )
    },
    [latestReplyId, askedWithPhoto, regenerating, attempts, regenerateReply, retry],
  )

  return (
    <Animated.View style={[s.flex, lift]}>
      <Header title={chat.title} />

      {page.status === 'LoadingFirstPage' ? (
        <View style={s.center}>
          <Polo size={56} />
          <Text style={s.note}>Opening the chat…</Text>
        </View>
      ) : messages.length === 0 ? (
        <NewChat disabled={sending} onPick={(prompt) => void send({ submissionId: newSubmissionId(), text: prompt })} />
      ) : (
        <FlatList
          inverted
          data={messages}
          keyExtractor={keyForMessage}
          renderItem={renderMessage}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.3}
          onEndReached={() => {
            if (page.status === 'CanLoadMore') page.loadMore(20)
          }}
          ListFooterComponent={page.status === 'LoadingMore' ? <ActivityIndicator color={t.c.ink3} style={s.more} /> : null}
        />
      )}

      {problem ? (
        <Animated.View entering={FadeIn} style={s.problemRow}>
          <Text style={s.problem}>{problem.text}</Text>
          {failedAttempt ? <Button label="Try again" size="sm" variant="ghost" onPress={() => void send(failedAttempt)} /> : null}
        </Animated.View>
      ) : null}

      <Composer streaming={streaming} sending={sending} onSubmit={submitTyped} onStop={stop} onProblem={reportProblem} />
    </Animated.View>
  )
}

type ComposerProps = {
  streaming: boolean
  sending: boolean
  onSubmit: (text: string, photoUri?: string) => void
  onStop: () => void
  onProblem: (text: string) => void
}

// The message box: text, an optional photo picked from the + menu, and send or stop. It keeps its own text and menu state, so typing doesn't re-render the thread.
const Composer = memo(function Composer({ streaming, sending, onSubmit, onStop, onProblem }: ComposerProps) {
  const s = useStyles()
  const t = useTheme()
  const [text, setText] = useState('')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const canSend = (text.trim() !== '' || photoUri !== null) && !sending

  // Sends what is in the box and clears it.
  function submitTyped() {
    if (!canSend) return
    const trimmed = text.trim()
    setText('')
    setPhotoUri(null)
    onSubmit(trimmed, photoUri ?? undefined)
  }

  // Asks the user's library for one photo to send with the next message.
  async function attach() {
    try {
      const picked = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 })
      const asset = picked.canceled ? undefined : picked.assets[0]
      if (asset) setPhotoUri(asset.uri)
    } catch {
      onProblem("Couldn't open the gallery. Try again.")
    }
  }

  // Takes a new photo with the camera for the next message, after asking for camera access.
  async function takePhoto() {
    try {
      const permission = await requestCameraPermissionsAsync()
      if (!permission.granted) {
        onProblem('Camera is off. Allow it in Settings, or pick from the gallery.')
        return
      }
      const picked = await launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 })
      const asset = picked.canceled ? undefined : picked.assets[0]
      if (asset) setPhotoUri(asset.uri)
    } catch {
      onProblem("Couldn't open the camera. Try again.")
    }
  }

  // Closes the + menu, then runs one of its photo picks.
  function pick(choose: () => Promise<void>) {
    setMenuOpen(false)
    void choose()
  }

  return (
    <>
      <View style={s.composer}>
        {photoUri ? (
          <Animated.View entering={FadeIn} style={s.pendingPhoto}>
            <Image source={{ uri: photoUri }} style={s.pendingThumb} accessibilityLabel="Photo to send" />
            <View style={s.removePhoto}>
              <RoundButton icon="x" label="Remove photo" tone="card" size={26} onPress={() => setPhotoUri(null)} />
            </View>
          </Animated.View>
        ) : null}
        <View style={s.inputRow}>
          <RoundButton icon="plus" label="Add a photo" tone="card" size={46} onPress={() => setMenuOpen(true)} />
          <View style={s.field}>
            <TextInput
              style={s.input}
              value={text}
              onChangeText={setText}
              placeholder="Message Polo"
              placeholderTextColor={t.c.ink3}
              multiline
              accessibilityLabel="Message"
            />
            {streaming ? (
              <Tap style={[s.send, s.stopButton]} scale={motion.press.iconScale} onPress={onStop} accessibilityRole="button" accessibilityLabel="Stop the reply">
                <View style={s.stopGlyph} />
              </Tap>
            ) : (
              <Tap
                style={[s.send, canSend ? s.sendOn : s.sendOff]}
                scale={motion.press.iconScale}
                disabled={!canSend}
                onPress={submitTyped}
                accessibilityRole="button"
                accessibilityLabel="Send"
                accessibilityState={{ disabled: !canSend, busy: sending }}
              >
                {sending ? <ActivityIndicator size="small" color={t.c.ink3} /> : <Icon name="up" size={18} color={canSend ? t.c.onPolo : t.c.ink3} />}
              </Tap>
            )}
          </View>
        </View>
      </View>
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        <View style={s.menu}>
          <Button label="Take photo" icon="cam" variant="ghost" size="block" onPress={() => pick(takePhoto)} />
          <Button label="Choose photo" icon="image" variant="ghost" size="block" onPress={() => pick(attach)} />
        </View>
      </Sheet>
    </>
  )
})

// Empty chat (mock v5 #/thread-new): Polo, a short line, and starter prompts from the user's day.
function NewChat({ disabled, onPick }: { disabled: boolean; onPick: (prompt: string) => void }) {
  const s = useStyles()
  const today = useLocalToday()
  const totals = useQuery(api.day_totals.dayTotals, { localDate: today })
  const summary = useQuery(api.progress_v2.summary, { rangeDays: SUMMARY_DAYS, localDate: today })
  const targets = targetsFor(summary?.target?.kcal ?? null)
  const starters =
    totals === undefined || summary === undefined
      ? []
      : startersFor({
          entryCount: totals.entryCount,
          kcalEaten: totals.nutrients.kcal,
          kcalTarget: targets.kcal,
          proteinEaten: totals.nutrients.protein,
          proteinTarget: targets.proteinG,
          weeklyRateKg: summary.weeklyRateKg,
        })

  return (
    <ScrollView contentContainerStyle={s.newChat} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={s.hello}>
        <Polo size={72} hop={1} />
        <Text style={s.helloTitle}>What's on your mind?</Text>
        <Text style={s.helloBody}>I can see your logs, workouts and weight. Ask me to fix a log and I will.</Text>
      </View>
      <View style={s.starters}>
        {starters.map((prompt) => (
          <Animated.View key={prompt} entering={FadeIn}>
            <Tap
              style={[s.starter, disabled && s.dim]}
              scale={motion.press.rowScale}
              disabled={disabled}
              onPress={() => onPick(prompt)}
              accessibilityRole="button"
              accessibilityLabel={`Ask: ${prompt}`}
            >
              <Text style={s.starterText}>{prompt}</Text>
            </Tap>
          </Animated.View>
        ))}
      </View>
    </ScrollView>
  )
}

const useStyles = themedStyles((t) => ({
  flex: { flex: 1, backgroundColor: t.c.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: t.c.line,
    backgroundColor: t.c.bg,
  },
  title: { ...font('section'), fontSize: 18, color: t.c.ink, flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: layout.screenX, paddingBottom: 60 },
  note: { ...font('callout'), color: t.c.ink3, textAlign: 'center' },
  list: { paddingHorizontal: layout.screenX, paddingTop: 12, paddingBottom: 6 },
  more: { marginVertical: 12 },
  newChat: { paddingHorizontal: layout.screenX, paddingTop: 40, paddingBottom: 24 },
  hello: { alignItems: 'center' },
  helloTitle: { ...font('cardTitle'), color: t.c.ink, marginTop: 14, textAlign: 'center' },
  helloBody: { ...font('callout'), color: t.c.ink2, marginTop: 6, textAlign: 'center', maxWidth: 300 },
  starters: { gap: 8, marginTop: 22 },
  starter: {
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: 16,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  starterText: { ...font('input'), color: t.c.ink },
  dim: { opacity: 0.5 },
  problemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layout.screenX, paddingTop: 8 },
  problem: { ...font('caption'), color: t.c.poloInk, flex: 1 },
  composer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, backgroundColor: t.c.bg },
  menu: { gap: 8 },
  pendingPhoto: { alignSelf: 'flex-start', marginLeft: 54, marginBottom: 8 },
  pendingThumb: { width: 64, height: 64, borderRadius: radii.sm, backgroundColor: t.c.card2 },
  removePhoto: { position: 'absolute', top: -8, right: -8 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  field: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: radii.field,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
    paddingLeft: 16,
    paddingRight: 5,
  },
  input: {
    ...font('input'),
    flex: 1,
    maxHeight: 120,
    color: t.c.ink,
    paddingTop: 13,
    paddingBottom: 13,
    paddingHorizontal: 0,
  },
  send: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 5, marginLeft: 6 },
  sendOn: { backgroundColor: t.c.polo },
  sendOff: { backgroundColor: t.c.card2 },
  stopButton: { backgroundColor: t.c.ink },
  stopGlyph: { width: 11, height: 11, borderRadius: 3, backgroundColor: t.c.bg },
}))

export { RouteError as ErrorBoundary } from '@/components/RouteError'
