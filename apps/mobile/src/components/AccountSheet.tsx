import { Image, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useUser } from '@clerk/expo'
import { ListCard, ListRow } from '@/components/ListRow'
import { Sheet } from '@/components/Sheet'
import { font, themedStyles } from '@/theme'

// The Clerk photo in a circle, or the first initial of the name when there is no photo.
export function Avatar({ size, large = false }: { size: number; large?: boolean }) {
  const s = useStyles()
  const { user } = useUser()
  const circle = { width: size, height: size, borderRadius: size / 2 }
  if (user?.hasImage) return <Image source={{ uri: user.imageUrl }} style={circle} />
  const initial = (user?.firstName || user?.username || '?').charAt(0).toUpperCase()
  return (
    <View style={[s.initials, circle]}>
      <Text style={large ? s.initialLarge : s.initial}>{initial}</Text>
    </View>
  )
}

type Destination = '/profile' | '/settings'
const ROWS: { label: string; detail: string; path: Destination }[] = [
  { label: 'Profile', detail: 'Your answers and daily targets', path: '/profile' },
  { label: 'Settings', detail: 'Units, theme, data and account', path: '/settings' },
]

// Small sheet opened from the Today avatar, like the mock's You sheet. Each row closes the sheet, then opens its screen.
export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStyles()
  const { user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress
  return (
    <Sheet open={open} onClose={onClose}>
      <View style={s.head}>
        <Avatar size={52} />
        <View style={s.headText}>
          <Text style={s.name} numberOfLines={1}>
            {user?.fullName || user?.username || 'You'}
          </Text>
          {email ? (
            <Text style={s.email} numberOfLines={1}>
              {email}
            </Text>
          ) : null}
        </View>
      </View>
      <ListCard>
        {ROWS.map((row, i) => (
          <ListRow
            key={row.path}
            label={row.label}
            detail={row.detail}
            last={i === ROWS.length - 1}
            onPress={() => {
              onClose()
              router.push(row.path)
            }}
          />
        ))}
      </ListCard>
    </Sheet>
  )
}

const useStyles = themedStyles((t) => ({
  initials: { backgroundColor: t.c.card2, alignItems: 'center', justifyContent: 'center' },
  initial: { ...font('avatar'), color: t.c.ink },
  initialLarge: { ...font('greeting'), color: t.c.ink },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  headText: { flex: 1, minWidth: 0 },
  name: { ...font('cardTitle'), color: t.c.ink },
  email: { ...font('caption'), color: t.c.ink3, marginTop: 2 },
}))
