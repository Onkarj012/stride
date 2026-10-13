import { useEffect, useState } from 'react'
import { Image, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Markdown from 'react-native-markdown-display'
import type { FunctionReturnType } from 'convex/server'
import { radii } from '@stride/ui-tokens'
import type { api } from 'stride-backend/convex/_generated/api'
import type { EntryId } from '@/lib/log'
import { font, themedStyles } from '@/theme'
import { Button } from './Controls'
import { DraftCard } from './DraftCard'
import { useLog } from './LogProvider'
import { Polo } from './Polo'
import { Tap } from './Tap'

export type ChatMessageView = FunctionReturnType<typeof api.chats.listMessages>['page'][number]

// How often Polo hops while a reply is still streaming in.
const STREAM_HOP_MS = 1600

type Props = {
  message: ChatMessageView
  // Set only on the newest reply, so only it offers a regenerate.
  onRegenerate?: () => void
  regenerating?: boolean
  // Set only when the failed attempt is still known, so only then Retry shows.
  onRetry?: () => void
}

// One message in the thread: a bubble for the user, a reply with its cards and actions for the coach.
export function ChatMessage({ message, onRegenerate, regenerating, onRetry }: Props) {
  if (message.role === 'user') return <UserBubble message={message} />
  return <Reply message={message} onRegenerate={onRegenerate} regenerating={regenerating} onRetry={onRetry} />
}

// The user's line (mock v5 .msg.me), with the sent photo as a rounded thumbnail above it.
function UserBubble({ message }: { message: ChatMessageView }) {
  const s = useStyles()
  const hasPhoto = message.attachments.some((a) => a.kind === 'image')
  return (
    <Animated.View entering={FadeIn.duration(220)} style={s.me}>
      {message.imageUrl ? (
        <Image
          source={{ uri: message.imageUrl }}
          style={[s.thumb, message.text ? null : s.thumbAlone]}
          accessibilityRole="image"
          accessibilityLabel="Photo you sent"
        />
      ) : hasPhoto ? (
        <View style={s.photoChip}>
          <Text style={s.photoChipText}>Photo</Text>
        </View>
      ) : null}
      {message.text ? (
        <View style={s.bubble}>
          <Text style={s.bubbleText}>{message.text}</Text>
        </View>
      ) : null}
    </Animated.View>
  )
}

// Hops Polo every so often while `active`, so a streaming reply looks like Polo is busy writing.
function useStreamHop(active: boolean): number {
  const [hops, setHops] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setHops((n) => n + 1), STREAM_HOP_MS)
    return () => clearInterval(timer)
  }, [active])
  return hops
}

// The coach's reply (mock v5 .msg.ai): markdown text, how it ended, undo and draft cards, and its actions.
function Reply({ message, onRegenerate, regenerating, onRetry }: Props) {
  const s = useStyles()
  const md = useMarkdownStyles()
  const { compose } = useLog()
  const streaming = message.status === 'streaming'
  const failed = message.status === 'failed'
  const stopped = message.status === 'stopped'
  const logAction = message.logAction
  const hops = useStreamHop(streaming)

  return (
    <Animated.View entering={FadeIn.duration(220)} style={s.reply}>
      <View style={s.polo}>
        <Polo size={26} hop={hops} mood={failed ? 'wow' : 'idle'} />
      </View>
      <View style={s.replyBody}>
        {message.text ? (
          <View style={failed ? s.dim : undefined}>
            <Markdown style={md}>{message.text}</Markdown>
          </View>
        ) : streaming ? (
          <TypingDots />
        ) : null}

        {failed ? (
          <View style={s.row}>
            <Text style={s.caption}>{message.text ? "Didn't finish." : "Couldn't answer that."}</Text>
            {onRetry ? (
              <Tap onPress={onRetry} scale={0.94} hitSlop={8} accessibilityRole="button" accessibilityLabel="Try again">
                <Text style={s.link}>Try again</Text>
              </Tap>
            ) : null}
          </View>
        ) : null}
        {stopped ? <Text style={s.caption}>Stopped.</Text> : null}

        {message.entryIds.map((entryId) => (
          <UndoCard key={entryId} entryId={entryId} />
        ))}
        {message.draftIds.map((draftId) => (
          <DraftCard key={draftId} draftId={draftId} onCommitted={() => undefined} onDiscarded={() => undefined} />
        ))}

        {!streaming && (logAction || onRegenerate) ? (
          <View style={[s.row, s.actions]}>
            {logAction ? (
              <Button
                label="Log this"
                size="sm"
                icon="plus"
                onPress={() => compose('text', undefined, { text: logAction.text, storageId: logAction.storageId })}
              />
            ) : null}
            {onRegenerate ? (
              <Tap
                onPress={onRegenerate}
                disabled={regenerating}
                scale={0.94}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Regenerate this reply"
                accessibilityState={{ disabled: regenerating, busy: regenerating }}
              >
                <Text style={[s.link, regenerating && s.dim]}>{regenerating ? 'Regenerating…' : 'Regenerate'}</Text>
              </Tap>
            ) : null}
          </View>
        ) : null}
      </View>
    </Animated.View>
  )
}

// One bouncing dot of the typing indicator.
function Dot({ index }: { index: number }) {
  const s = useStyles()
  const y = useSharedValue(0)
  useEffect(() => {
    y.value = withDelay(index * 150, withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0, { duration: 600 })), -1))
  }, [index, y])
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -4 * y.value }], opacity: 1 - 0.6 * y.value }))
  return <Animated.View style={[s.dot, style]} />
}

// Three dots beside Polo while the reply has no text yet (mock v5 typing row).
function TypingDots() {
  const s = useStyles()
  return (
    <View style={s.dots} accessibilityLabel="Polo is typing" accessibilityLiveRegion="polite">
      <Dot index={0} />
      <Dot index={1} />
      <Dot index={2} />
    </View>
  )
}

// Undo for one entry the reply changed (mock v5 .acard). Once pressed it stays undone, so a second press can't undo an older revision.
function UndoCard({ entryId }: { entryId: EntryId }) {
  const s = useStyles()
  const { undoFor } = useLog()
  const [undone, setUndone] = useState(false)

  // Runs the undo and disables the card.
  function undo() {
    setUndone(true)
    undoFor([entryId])()
  }

  return (
    <View style={[s.card, undone && s.cardDone]}>
      <View style={s.grow}>
        <Text style={s.eyebrow}>{undone ? 'Undone' : 'Log changed'}</Text>
        <Text style={s.cardTitle}>{undone ? 'Back the way it was.' : 'Undo puts back the version from before.'}</Text>
      </View>
      <Button label={undone ? 'Undone' : 'Undo'} size="sm" variant={undone ? 'ghost' : 'ink'} disabled={undone} onPress={undo} />
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  grow: { flex: 1 },
  me: { alignItems: 'flex-end', marginTop: 18, gap: 6 },
  bubble: {
    maxWidth: '82%',
    backgroundColor: t.c.ink,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingVertical: 11,
    paddingHorizontal: 15,
  },
  bubbleText: { ...font('body'), color: t.c.bg },
  thumb: { width: 176, height: 176, borderRadius: radii.md, backgroundColor: t.c.card2 },
  thumbAlone: { borderBottomRightRadius: 6 },
  photoChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: t.c.card2 },
  photoChipText: { ...font('label'), color: t.c.ink2 },
  reply: { flexDirection: 'row', gap: 10, marginTop: 18, alignItems: 'flex-start' },
  polo: { width: 28, marginTop: 1 },
  replyBody: { flex: 1, minWidth: 0, gap: 10 },
  dim: { opacity: 0.55 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  actions: { marginTop: 2 },
  caption: { ...font('caption'), color: t.c.ink3 },
  link: { ...font('link'), color: t.c.ink2, paddingVertical: 4 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 24 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.c.ink3 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: t.c.line2,
  },
  cardDone: { borderStyle: 'dashed' },
  eyebrow: { ...font('tag'), color: t.c.ink3 },
  cardTitle: { ...font('calloutStrong'), color: t.c.ink, marginTop: 3 },
}))

// Markdown look for coach replies (mock v5 .msg.ai .tx), in the theme's type roles and ink colours.
const useMarkdownStyles = themedStyles((t) => ({
  body: { ...font('lead'), color: t.c.ink, gap: 10 },
  paragraph: { marginTop: 0, marginBottom: 0 },
  strong: { fontFamily: font('bodyStrong').fontFamily },
  em: { fontStyle: 'italic' },
  link: { color: t.c.ink, textDecorationLine: 'underline' },
  heading1: { ...font('section'), color: t.c.ink },
  heading2: { ...font('section'), color: t.c.ink },
  heading3: { ...font('value'), color: t.c.ink },
  heading4: { ...font('bodyStrong'), color: t.c.ink },
  bullet_list: { marginTop: -2 },
  ordered_list: { marginTop: -2 },
  list_item: { paddingVertical: 7, borderBottomWidth: 1, borderColor: t.c.line },
  bullet_list_icon: { color: t.c.polo, fontFamily: font('bodyStrong').fontFamily, marginLeft: 0, marginRight: 10 },
  ordered_list_icon: { color: t.c.ink3, fontFamily: font('bodyStrong').fontFamily, marginLeft: 0, marginRight: 10 },
  blockquote: { backgroundColor: 'transparent', borderLeftWidth: 3, borderColor: t.c.polo, paddingHorizontal: 12, marginLeft: 0 },
  hr: { backgroundColor: t.c.line, height: 1 },
  code_inline: { color: t.c.ink, backgroundColor: t.c.card2, borderWidth: 0, borderRadius: 6, padding: 0, paddingHorizontal: 4 },
  code_block: { ...font('secondary'), color: t.c.ink, backgroundColor: t.c.card2, borderWidth: 0, borderRadius: radii.sm, padding: 12 },
  fence: { ...font('secondary'), color: t.c.ink, backgroundColor: t.c.card2, borderWidth: 0, borderRadius: radii.sm, padding: 12 },
  table: { borderWidth: 1, borderColor: t.c.line2, borderRadius: radii.sm, overflow: 'hidden' },
  thead: { backgroundColor: t.c.card2 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: t.c.line },
  th: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, ...font('calloutStrong'), color: t.c.ink },
  td: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, ...font('callout'), color: t.c.ink2 },
}))
