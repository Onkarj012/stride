import { useEffect, useState, type ReactElement } from 'react'
import { Alert, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from 'stride-backend/convex/_generated/api'
import { ChatRow } from '@/components/ChatRow'
import { Button, RoundButton } from '@/components/Controls'
import { Polo } from '@/components/Polo'
import { ListScreen, ScreenTitle } from '@/components/Screen'
import { Sheet } from '@/components/Sheet'
import { plainError } from '@/lib/log'
import { font, themedStyles, useTheme } from '@/theme'
import { radii } from '@stride/ui-tokens'

type ChatItem = FunctionReturnType<typeof api.chats.listChats>[number]
// One list row: a chat, or a search hit (which has no chat to rename or delete).
type Row = { key: string; chatId: string; title: string; preview?: string | null; time?: string; chat?: ChatItem }

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

  const now = Date.now()
  // Search hits while the query is non-empty, otherwise the chat list.
  const rows: Row[] =
    trimmed !== ''
      ? (hits ?? []).map((hit) => ({ key: hit.messageId, chatId: hit.chatId, title: hit.title, preview: hit.snippet }))
      : (chats ?? []).map((chat) => ({
          key: chat._id,
          chatId: chat._id,
          title: chat.title,
          preview: chat.lastMessage,
          time: ageLabel(chat.updatedAt, now),
          chat,
        }))

  // What the list shows when it has no rows: loading, empty, or no search hits.
  function emptyState(): ReactElement | null {
    if (trimmed !== '') {
      if (hits === undefined) return <Text style={s.note}>Searching…</Text>
      if (hits.length === 0)
        return (
          <View style={s.quiet}>
            <Polo size={44} mood="sleep" />
            <Text style={s.note}>Nothing matches "{trimmed}".</Text>
          </View>
        )
      return null
    }
    if (chats === undefined)
      return (
        <View style={s.quiet}>
          <Polo size={56} />
          <Text style={s.note}>Finding your chats…</Text>
        </View>
      )
    if (chats.length === 0)
      return (
        <View style={s.empty}>
          <Polo size={64} hop={1} />
          <Text style={s.emptyTitle}>No chats yet.</Text>
          <Text style={s.emptyBody}>Ask about protein, your burn, or what fits for dinner tonight.</Text>
          <Button label="Start a chat" size="sm" icon="plus" busy={busy} onPress={() => void newChat()} style={s.emptyButton} />
        </View>
      )
    return null
  }

  return (
    <ListScreen
      data={rows}
      keyExtractor={(row) => row.key}
      empty={emptyState()}
      header={
        <View style={s.head}>
          <ScreenTitle
            eyebrow="Coach"
            title="Chats"
            aside={<Button label="New chat" size="sm" icon="plus" busy={busy} onPress={() => void newChat()} />}
          />
          <Text style={s.intro}>Polo reads your logs and can fix them when you ask. Every change shows up with an undo.</Text>
          {chats && chats.length > 0 ? (
            <View style={s.search}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search chats"
                placeholderTextColor={t.c.ink3}
                style={s.searchInput}
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Search chats"
              />
              {query !== '' ? <RoundButton icon="x" label="Clear search" tone="plain" size={32} onPress={() => setQuery('')} /> : null}
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item }) => {
        const chat = item.chat
        return (
          <ChatRow
            title={item.title}
            preview={item.preview}
            time={item.time}
            onPress={() => router.push(`/chat/${item.chatId}`)}
            onLongPress={chat ? () => openSheet(chat) : undefined}
          />
        )
      }}
      overlay={
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
          {target ? (
            <>
              <Text style={s.sheetTitle} numberOfLines={1}>
                {target.title}
              </Text>
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
                  <Text style={s.confirmText}>Delete this chat? Changes it made to your log stay.</Text>
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
      }
    />
  )
}

const useStyles = themedStyles((t) => ({
  intro: { ...font('callout'), color: t.c.ink2, marginTop: 12 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.c.card2,
    borderRadius: radii.field,
    height: 46,
    paddingLeft: 16,
    paddingRight: 7,
    marginTop: 16,
  },
  searchInput: { ...font('input'), flex: 1, color: t.c.ink, padding: 0, height: '100%' },
  head: { paddingBottom: 6 },
  quiet: { alignItems: 'center', marginTop: 48, gap: 12 },
  note: { ...font('callout'), color: t.c.ink3, textAlign: 'center' },
  empty: {
    marginTop: 18,
    alignItems: 'center',
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: 18,
    backgroundColor: t.c.card,
    borderRadius: radii.card,
    boxShadow: t.shadow.card,
  },
  emptyTitle: { ...font('emptyTitle'), color: t.c.ink, marginTop: 12 },
  emptyBody: { ...font('callout'), color: t.c.ink2, marginTop: 6, textAlign: 'center' },
  emptyButton: { marginTop: 14 },
  sheetTitle: { ...font('section'), color: t.c.ink, marginBottom: 16 },
  sheetLabel: { ...font('eyebrow'), color: t.c.ink3, marginBottom: 8 },
  field: {
    ...font('input'),
    color: t.c.ink,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
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
