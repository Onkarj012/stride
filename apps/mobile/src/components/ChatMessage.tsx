import { useState } from 'react'
import { Text, View } from 'react-native'
import Markdown from 'react-native-markdown-display'
import type { FunctionReturnType } from 'convex/server'
import { radii } from '@stride/ui-tokens'
import type { api } from 'stride-backend/convex/_generated/api'
import type { EntryId } from '@/lib/log'
import { font, themedStyles, useTheme } from '@/theme'
import { Button, Thinking } from './Controls'
import { DraftCard } from './DraftCard'
import { useLog } from './LogProvider'
import { Polo } from './Polo'

export type ChatMessageView = FunctionReturnType<typeof api.chats.listMessages>['page'][number]

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

// The user's line, with a "Photo" chip when an image was sent.
function UserBubble({ message }: { message: ChatMessageView }) {
  const s = useStyles()
  const hasPhoto = message.attachments.some((a) => a.kind === 'image')
  return (
    <View style={s.me}>
      <View style={s.bubble}>
        {hasPhoto ? <Text style={s.chip}>Photo</Text> : null}
        {message.text ? <Text style={s.bubbleText}>{message.text}</Text> : null}
      </View>
    </View>
  )
}

// The coach's reply: markdown text, how it ended, undo and draft cards, and its actions.
function Reply({ message, onRegenerate, regenerating, onRetry }: Props) {
  const s = useStyles()
  const md = useMarkdownStyles()
  const { compose } = useLog()
  const streaming = message.status === 'streaming'
  const failed = message.status === 'failed'
  const logAction = message.logAction

  return (
    <View style={s.reply}>
      <Polo size={26} />
      <View style={s.replyBody}>
        {message.text ? (
          <View style={failed ? s.dim : undefined}>
            <Markdown style={md}>{message.text}</Markdown>
          </View>
        ) : streaming ? (
          <Thinking label="Thinking…" />
        ) : null}

        {failed ? (
          <View style={s.row}>
            <Text style={s.caption}>Didn't finish.</Text>
            {onRetry ? <Text style={s.link} onPress={onRetry} accessibilityRole="button">Retry</Text> : null}
          </View>
        ) : null}
        {message.status === 'stopped' ? <Text style={s.caption}>Stopped</Text> : null}

        {message.entryIds.map((entryId) => (
          <UndoCard key={entryId} entryId={entryId} />
        ))}
        {message.draftIds.map((draftId) => (
          <DraftCard key={draftId} draftId={draftId} onCommitted={() => undefined} onDiscarded={() => undefined} />
        ))}

        {!streaming && (logAction || onRegenerate) ? (
          <View style={s.row}>
            {logAction ? (
              <Button
                label="Log this"
                size="sm"
                variant="ghost"
                onPress={() => compose('text', undefined, { text: logAction.text, storageId: logAction.storageId })}
              />
            ) : null}
            {onRegenerate ? <Button label="Regenerate" size="sm" variant="ghost" busy={regenerating} onPress={onRegenerate} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  )
}

// Undo for one entry the reply changed. Once pressed it stays undone, so a second press can't undo an older revision.
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
    <View style={s.card}>
      <View style={s.grow}>
        <Text style={s.eyebrow}>{undone ? 'Undone' : 'Log changed'}</Text>
        <Text style={s.cardTitle}>{undone ? 'Back the way it was.' : 'Put back the version from before.'}</Text>
      </View>
      <Button label={undone ? 'Undone' : 'Undo'} size="sm" variant="ghost" disabled={undone} onPress={undo} />
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  grow: { flex: 1 },
  me: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 18 },
  bubble: { maxWidth: '82%', backgroundColor: t.c.ink, borderRadius: 20, borderBottomRightRadius: 6, paddingVertical: 11, paddingHorizontal: 15, gap: 6 },
  bubbleText: { ...font('body'), color: t.c.bg },
  chip: { ...font('caption'), color: t.c.bg, opacity: 0.7 },
  reply: { flexDirection: 'row', gap: 10, marginTop: 18, alignItems: 'flex-start' },
  replyBody: { flex: 1, gap: 10 },
  dim: { opacity: 0.55 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  caption: { ...font('caption'), color: t.c.ink3 },
  link: { ...font('link'), color: t.c.ink2, paddingVertical: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    paddingLeft: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.c.line2,
  },
  eyebrow: { ...font('eyebrow'), color: t.c.ink3 },
  cardTitle: { ...font('callout'), color: t.c.ink, marginTop: 2 },
}))

// Markdown look for coach replies, in the theme's type roles and ink colours.
const useMarkdownStyles = themedStyles((t) => ({
  body: { ...font('body'), color: t.c.ink },
  paragraph: { marginTop: 0, marginBottom: 0 },
  strong: { ...font('bodyStrong'), color: t.c.ink },
  heading2: { ...font('section'), color: t.c.ink, marginTop: 6 },
  heading3: { ...font('bodyStrong'), color: t.c.ink, marginTop: 4 },
  bullet_list: { marginTop: 4 },
  ordered_list: { marginTop: 4 },
  list_item: { marginTop: 4 },
  bullet_list_icon: { ...font('body'), color: t.c.ink2, marginRight: 8 },
  ordered_list_icon: { ...font('body'), color: t.c.ink2, marginRight: 8 },
  code_inline: { ...font('body'), color: t.c.ink, backgroundColor: t.c.card2, borderRadius: 6, paddingHorizontal: 4 },
  fence: { backgroundColor: t.c.card2, borderRadius: radii.sm, padding: 10, marginTop: 4 },
  code_block: { ...font('body'), color: t.c.ink, backgroundColor: t.c.card2, borderRadius: radii.sm, padding: 10 },
  table: { borderWidth: 1, borderColor: t.c.line2, borderRadius: radii.sm, marginTop: 6 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: t.c.line },
  th: { flex: 1, padding: 6, ...font('bodyStrong'), color: t.c.ink },
  td: { flex: 1, padding: 6, ...font('caption'), color: t.c.ink2 },
}))
