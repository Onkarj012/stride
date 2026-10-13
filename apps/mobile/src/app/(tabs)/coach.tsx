import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from 'stride-backend/convex/_generated/api'
import { ChatRow } from '@/components/ChatRow'
import { Button } from '@/components/Controls'
import { Placeholder, Screen, ScreenTitle } from '@/components/Screen'
import { Sheet } from '@/components/Sheet'
import { plainError } from '@/lib/log'
import { font, themedStyles, useTheme } from '@/theme'
import { radii } from '@stride/ui-tokens'

type ChatItem = FunctionReturnType<typeof api.chats.listChats>[number]

const SEARCH_DEBOUNCE_MS = 250
const TITLE_MAX = 60
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Short age label for a chat row: "now", "5m", "3h", a weekday within a week, else "12 Oct".
function ageLabel(updatedAt: number, now: number): string {
  const minutes = Math.floor((now - updatedAt) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const date = new Date(updatedAt)
  if (hours < 24 * 7) return DAY_NAMES[date.getDay()] ?? ''
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()] ?? ''}`
}

// Coach tab: search and the list of chats. Tap opens a chat, long-press renames or deletes it.
export default function CoachScreen() {
  const t = useTheme()
  const s = useStyles()
  const chats = useQuery(api.chats.listChats, {})
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [target, setTarget] = useState<ChatItem | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const trimmed = query.trim()
  const hits = useQuery(api.chats.searchChats, debounced ? { query: debounced } : 'skip')
  const createChat = useMutation(api.chats.createChat)
  const renameChat = useMutation(api.chats.renameChat)
  const deleteChat = useMutation(api.chats.deleteChat)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(trimmed), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmed])

  // Creates an empty chat and opens it.
  async function newChat() {
    setBusy(true)
    try {
      const id = await createChat({})
      router.push(`/chat/${id}`)
    } catch (err) {
      Alert.alert('Coach', plainError(err))
    } finally {
      setBusy(false)
    }
  }

  // Opens the rename and delete sheet for one chat.
  function openSheet(chat: ChatItem) {
    setTarget(chat)
    setDraft(chat.title)
    setConfirming(false)
    setSheetOpen(true)
  }

  // Saves the typed title and closes the sheet.
  async function rename(chat: ChatItem) {
    const title = draft.trim()
    if (!title) return
    setBusy(true)
    try {
      await renameChat({ chatId: chat._id, title })
      setSheetOpen(false)
    } catch (err) {
      Alert.alert('Rename', plainError(err))
    } finally {
      setBusy(false)
    }
  }

  // Deletes the chat and closes the sheet.
  async function remove(chat: ChatItem) {
    setBusy(true)
    try {
      await deleteChat({ chatId: chat._id })
      setSheetOpen(false)
    } catch (err) {
      Alert.alert('Delete', plainError(err))
    } finally {
      setBusy(false)
    }
  }

  // Search hits while the query is non-empty, otherwise the chat list.
  function renderBody(): ReactNode {
    if (trimmed !== '') {
      if (hits === undefined) return <Text style={s.note}>Searching…</Text>
      if (hits.length === 0) return <Text style={s.note}>No chats match "{trimmed}".</Text>
      return hits.map((hit) => (
        <ChatRow key={hit.messageId} title={hit.title} preview={hit.snippet} onPress={() => router.push(`/chat/${hit.chatId}`)} />
      ))
    }
    if (chats === undefined) return <Text style={s.note}>Loading chats…</Text>
    if (chats.length === 0)
      return (
        <>
          <Text style={s.intro}>Polo reads your logs and can fix them when you ask. Every change shows up with an undo.</Text>
          <Placeholder title="No chats yet." body="Ask about protein, your burn, or tonight's dinner. Chats open here soon." />
          <Button label="New chat" icon="plus" busy={busy} onPress={() => void newChat()} style={s.cta} />
        </>
      )
    const now = Date.now()
    return chats.map((chat) => (
      <ChatRow
        key={chat._id}
        title={chat.title}
        preview={chat.lastMessage}
        time={ageLabel(chat.updatedAt, now)}
        onPress={() => router.push(`/chat/${chat._id}`)}
        onLongPress={() => openSheet(chat)}
      />
    ))
  }

  return (
    <Screen>
      <ScreenTitle
        eyebrow="Coach"
        title="Chats"
        aside={<Button label="New chat" size="sm" icon="plus" busy={busy} onPress={() => void newChat()} />}
      />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search chats"
        placeholderTextColor={t.c.ink3}
        style={s.search}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search chats"
      />
      <View style={s.list}>{renderBody()}</View>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        {target ? (
          <>
            <Text style={s.sheetLabel}>Rename</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              maxLength={TITLE_MAX}
              placeholder="Chat title"
              placeholderTextColor={t.c.ink3}
              style={s.field}
              accessibilityLabel="Chat title"
            />
            <Button
              label="Save"
              size="block"
              disabled={!draft.trim() || draft.trim() === target.title}
              busy={busy}
              onPress={() => void rename(target)}
              style={s.gap}
            />
            <View style={s.divider} />
            {confirming ? (
              <>
                <Text style={s.confirmText}>Delete this chat? Entries it changed stay in your log.</Text>
                <View style={s.row}>
                  <Button label="Cancel" variant="ghost" size="block" onPress={() => setConfirming(false)} style={s.flex} />
                  <Button label="Delete" variant="coral" size="block" busy={busy} onPress={() => void remove(target)} style={s.flex} />
                </View>
              </>
            ) : (
              <Button label="Delete chat" variant="ghost" icon="trash" size="block" onPress={() => setConfirming(true)} />
            )}
          </>
        ) : null}
      </Sheet>
    </Screen>
  )
}

const useStyles = themedStyles((t) => ({
  search: {
    ...font('input'),
    color: t.c.ink,
    backgroundColor: t.c.card2,
    borderRadius: radii.field,
    height: 48,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  list: { marginTop: 8 },
  intro: { ...font('callout'), color: t.c.ink2, marginTop: 12 },
  note: { ...font('callout'), color: t.c.ink3, marginTop: 24, textAlign: 'center' },
  cta: { marginTop: 14, alignSelf: 'center' },
  sheetLabel: { ...font('eyebrow'), color: t.c.ink3, marginBottom: 8 },
  field: {
    ...font('input'),
    color: t.c.ink,
    backgroundColor: t.c.card2,
    borderRadius: radii.md,
    height: 48,
    paddingHorizontal: 16,
  },
  gap: { marginTop: 12 },
  divider: { height: 1, backgroundColor: t.c.line, marginVertical: 18 },
  confirmText: { ...font('callout'), color: t.c.ink2, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
}))
