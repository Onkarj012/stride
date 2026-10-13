import type { ReactNode } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { motion, radii } from '@stride/ui-tokens'
import { font, themedStyles, useTheme } from '@/theme'
import { Icon } from './Icon'
import { Tap } from './Tap'

type ListRowProps = {
  label: string
  detail?: string
  value?: string
  // Shows the value in the display face, for numbers that matter (targets).
  strong?: boolean
  onPress?: () => void
  // Destructive action: warning-colored label and a trash icon instead of the chevron.
  danger?: boolean
  busy?: boolean
  last?: boolean
}

// Rounded card that holds a run of list rows.
export function ListCard({ children }: { children: ReactNode }) {
  const s = useStyles()
  return <View style={s.card}>{children}</View>
}

// v5 list row: bold label with an optional small detail, a value on the right, and a chevron when tappable.
export function ListRow({ label, detail, value, strong = false, onPress, danger = false, busy = false, last = false }: ListRowProps) {
  const t = useTheme()
  const s = useStyles()
  const tappable = onPress !== undefined && !busy
  return (
    <Tap
      onPress={onPress}
      disabled={!tappable}
      scale={motion.press.rowScale}
      style={[s.row, !last && s.line]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityState={onPress ? { disabled: !tappable, busy } : undefined}
    >
      <View style={s.text}>
        <Text style={[s.label, danger && s.danger]}>{label}</Text>
        {detail ? <Text style={s.detail}>{detail}</Text> : null}
      </View>
      {value !== undefined ? (
        <Text style={strong ? s.valueStrong : s.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {busy ? <ActivityIndicator size="small" color={t.c.ink3} /> : null}
      {!busy && onPress && danger ? <Icon name="trash" size={18} color={t.c.poloInk} /> : null}
      {!busy && onPress && !danger ? <Icon name="chevron" size={18} color={t.c.ink3} /> : null}
    </Tap>
  )
}

const useStyles = themedStyles((t) => ({
  card: { backgroundColor: t.c.card, borderRadius: radii.card, boxShadow: t.shadow.card, paddingHorizontal: 16, paddingVertical: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 12 },
  line: { borderBottomWidth: 1, borderBottomColor: t.c.line },
  text: { flex: 1, minWidth: 0 },
  label: { ...font('bodyStrong'), color: t.c.ink },
  danger: { color: t.c.poloInk },
  detail: { ...font('caption'), color: t.c.ink3, marginTop: 2 },
  value: { ...font('callout'), color: t.c.ink2, maxWidth: '60%', textAlign: 'right' },
  valueStrong: { ...font('value'), color: t.c.ink, fontVariant: ['tabular-nums'] },
}))
