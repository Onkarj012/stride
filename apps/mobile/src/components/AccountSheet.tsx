import { Image, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useUser } from '@clerk/expo'
import { motion } from '@stride/ui-tokens'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/Sheet'
import { Tap } from '@/components/Tap'
import { font, themedStyles, useTheme } from '@/theme'

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
const ROWS: { label: string; path: Destination }[] = [
  { label: 'Profile', path: '/profile' },
  { label: 'Settings', path: '/settings' },
]

// Small sheet opened from the Today avatar. Each row closes the sheet, then opens its screen.
export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme()
  const s = useStyles()
  return (
    <Sheet open={open} onClose={onClose}>
      <View style={s.list}>
        {ROWS.map((row, i) => (
          <Tap
            key={row.path}
            onPress={() => {
              onClose()
              router.push(row.path)
            }}
            scale={motion.press.rowScale}
            style={[s.row, i > 0 && s.divider]}
            accessibilityRole="button"
            accessibilityLabel={row.label}
          >
            <Text style={s.label}>{row.label}</Text>
            <Icon name="chevron" size={18} color={t.c.ink3} />
          </Tap>
        ))}
      </View>
    </Sheet>
  )
}

const useStyles = themedStyles((t) => ({
  initials: { backgroundColor: t.c.card2, alignItems: 'center', justifyContent: 'center' },
  initial: { ...font('avatar'), color: t.c.ink },
  initialLarge: { ...font('greeting'), color: t.c.ink },
  list: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  divider: { borderTopWidth: 1, borderColor: t.c.line },
  label: { ...font('callout'), color: t.c.ink },
}))
