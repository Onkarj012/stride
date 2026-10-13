import { useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, Text, TextInput, View, type ListRenderItemInfo } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { launchImageLibraryAsync } from 'expo-image-picker'
import { useAuth } from '@clerk/expo'
import type { FunctionReturnType } from 'convex/server'
import { useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { layout, radii } from '@stride/ui-tokens'
import { Button, RoundButton, Thinking } from '@/components/Controls'
import { ChatMessage, type ChatMessageView } from '@/components/ChatMessage'
import { LogProvider } from '@/components/LogProvider'
import { Tap } from '@/components/Tap'
import { newSubmissionId, plainError, PlainError, uploadPhoto, type StorageId } from '@/lib/log'
import { font, themedStyles, useTheme } from '@/theme'

type ChatSummary = FunctionReturnType<typeof api.chats.listChats>[number]

// Opening lines for an empty chat, tapped to send.
const STARTERS = ["How's my protein today?", "Plan dinner for what's left", 'Why did my weight go up?', 'What should I eat before training?']

// One send: the text and photo, with the submission id that keeps a retry from running twice.
type Attempt = { submissionId: string; text: string; photoUri?: string }

// Leaves the thread, falling back to Coach when it was opened directly.
function leave() {
  if (router.canGoBack()) router.back()
  else router.replace('/coach')
}

// Chat thread route (mock v5 #/thread, v7 #/thread-stream): streamed replies, stop, regenerate, photos and Log this.
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const chats = useQuery(api.chats.listChats, {})
  const chat = chats?.find((c) => c._id === id)

  // Logs from a reply open their own sheet, so the thread mounts its own LogProvider.
  return (
    <LogProvider>
      {chats === undefined ? <Thinking label="Opening the chat…" /> : chat ? <Thread chat={chat} /> : <Gone />}
    </LogProvider>
  )
}

// Shown when the chat id matches no chat the user still has.
function Gone() {
  const s = useStyles()
  const insets = useSafeAreaInsets()
  return (
    <View style={[s.flex, { paddingTop: insets.top + 8 }]}>
      <View style={s.header}>
        <RoundButton icon="back" label="Back" onPress={leave} />
      </View>
      <Text style={s.note}>This chat is gone.</Text>
    </View>
  )
}

// The thread itself: messages newest first, starters when empty, and the composer.
function Thread({ chat }: { chat: ChatSummary }) {
  const s = useStyles()
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { getToken } = useAuth()
  const page = usePaginatedQuery(api.chats.listMessages, { chatId: chat._id }, { initialNumItems: 30 })
  const sendMessage = useAction(api.chats.sendMessage)
  const regenerate = useAction(api.chats.regenerate)
  const stopMessage = useMutation(api.chats.stopMessage)
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl)
  const [text, setText] = useState('')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  // The last send, kept until one succeeds, so a failed reply can resend it with the same submission id.
  const [pending, setPending] = useState<Attempt | null>(null)
  const [problem, setProblem] = useState<{ text: string; retry: boolean } | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  const messages = page.results.filter((m) => m.role !== 'tool')
  const latestReply = messages.find((m) => m.role === 'assistant')
  const streaming = latestReply?.status === 'streaming'
  const canSend = (text.trim() !== '' || photoUri !== null) && !sending

  // Uploads a picked photo and returns its storage id.
  async function uploadAttachment(uri: string): Promise<StorageId> {
    const token = await getToken({ template: 'convex' })
    if (!token) throw new PlainError('You are signed out. Sign in again.')
    return uploadPhoto(await generateUploadUrl({}), uri, token)
  }

  // Sends one attempt. Its submission id is reused on retry, so the server runs the turn once.
  async function send(attempt: Attempt) {
    setPending(attempt)
    setProblem(null)
    setSending(true)
    try {
      const imageStorageId = attempt.photoUri ? await uploadAttachment(attempt.photoUri) : undefined
      await sendMessage({ chatId: chat._id, submissionId: attempt.submissionId, text: attempt.text || undefined, imageStorageId })
      setPending(null)
    } catch (err) {
      setProblem({ text: plainError(err), retry: true })
    } finally {
      setSending(false)
    }
  }

  // Sends what is in the composer and clears it.
  function submitTyped() {
    const trimmed = text.trim()
    if (!canSend) return
    setText('')
    setPhotoUri(null)
    void send({ submissionId: newSubmissionId(), text: trimmed, photoUri: photoUri ?? undefined })
  }

  // Asks the user's library for one photo to send with the next message.
  async function attach() {
    try {
      const picked = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 })
      const asset = picked.canceled ? undefined : picked.assets[0]
      if (asset) setPhotoUri(asset.uri)
    } catch {
      setProblem({ text: "Couldn't open the gallery. Try again.", retry: false })
    }
  }

  // Stops the reply that is streaming now. The partial text stays.
  async function stop() {
    if (!latestReply) return
    try {
      await stopMessage({ messageId: latestReply._id })
    } catch (err) {
      setProblem({ text: plainError(err), retry: false })
    }
  }

  // Replaces the newest reply.
  async function regenerateReply() {
    setRegenerating(true)
    setProblem(null)
    try {
      await regenerate({ chatId: chat._id })
    } catch (err) {
      setProblem({ text: plainError(err), retry: false })
    } finally {
      setRegenerating(false)
    }
  }

  // One row of the inverted list: a message, with regenerate only on the newest reply.
  function renderMessage({ item }: ListRenderItemInfo<ChatMessageView>) {
    const isLatest = item._id === latestReply?._id
    return (
      <ChatMessage
        message={item}
        onRegenerate={isLatest ? () => void regenerateReply() : undefined}
        regenerating={isLatest && regenerating}
        onRetry={pending ? () => void send(pending) : undefined}
      />
    )
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <RoundButton icon="back" label="Back" onPress={leave} />
        <Text style={s.title} numberOfLines={1}>
          {chat.title}
        </Text>
      </View>

      {page.status === 'LoadingFirstPage' ? (
        <Thinking label="Opening the chat…" />
      ) : messages.length === 0 ? (
        <View style={s.starters}>
          <Text style={s.startersText}>Ask me about your day. I can see your logs, workouts and weight.</Text>
          {STARTERS.map((prompt) => (
            <Tap
              key={prompt}
              style={s.starter}
              scale={0.97}
              accessibilityRole="button"
              onPress={() => void send({ submissionId: newSubmissionId(), text: prompt })}
            >
              <Text style={s.starterText}>{prompt}</Text>
            </Tap>
          ))}
        </View>
      ) : (
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m._id}
          renderItem={renderMessage}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          onEndReachedThreshold={0.3}
          onEndReached={() => {
            if (page.status === 'CanLoadMore') page.loadMore(20)
          }}
        />
      )}

      {problem ? (
        <View style={s.problemRow}>
          <Text style={s.problem}>{problem.text}</Text>
          {problem.retry && pending ? <Button label="Try again" size="sm" variant="ghost" onPress={() => void send(pending)} /> : null}
        </View>
      ) : null}

      <View style={[s.composer, { paddingBottom: insets.bottom + 10 }]}>
        {photoUri ? (
          <View style={s.photoChip}>
            <Text style={s.photoText}>Photo ready</Text>
            <RoundButton icon="x" label="Remove photo" tone="plain" size={28} onPress={() => setPhotoUri(null)} />
          </View>
        ) : null}
        <View style={s.inputRow}>
          <RoundButton icon="image" label="Attach a photo" tone="card" size={44} onPress={() => void attach()} />
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="Ask about your day"
            placeholderTextColor={t.c.ink3}
            multiline
            accessibilityLabel="Message"
          />
          {streaming ? (
            <Button label="Stop" icon="x" variant="ghost" onPress={() => void stop()} />
          ) : (
            <Button label="Send" variant="coral" busy={sending} disabled={!canSend} onPress={submitTyped} />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const useStyles = themedStyles((t) => ({
  flex: { flex: 1, backgroundColor: t.c.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: layout.screenX,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: t.c.line,
    backgroundColor: t.c.bg,
  },
  title: { ...font('section'), fontSize: 18, color: t.c.ink, flex: 1 },
  note: { ...font('callout'), color: t.c.ink2, marginTop: 24, paddingHorizontal: layout.screenX },
  list: { paddingHorizontal: layout.screenX, paddingVertical: 12 },
  starters: { flex: 1, paddingHorizontal: layout.screenX, paddingTop: 40, gap: 8 },
  startersText: { ...font('callout'), color: t.c.ink2, marginBottom: 12 },
  starter: {
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: 16,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  starterText: { ...font('callout'), color: t.c.ink },
  problemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layout.screenX, paddingTop: 6 },
  problem: { ...font('caption'), color: t.c.poloInk, flex: 1 },
  composer: { paddingHorizontal: layout.screenX, paddingTop: 10, borderTopWidth: 1, borderColor: t.c.line, backgroundColor: t.c.bg },
  photoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingLeft: 12,
    borderRadius: 99,
    backgroundColor: t.c.card2,
    marginBottom: 8,
  },
  photoText: { ...font('caption'), color: t.c.ink2 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    ...font('input'),
    flex: 1,
    maxHeight: 120,
    color: t.c.ink,
    backgroundColor: t.c.card2,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
}))
