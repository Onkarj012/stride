import { Text, View } from 'react-native'
import { motion } from '@stride/ui-tokens'
import { font, themedStyles } from '@/theme'
import { Tap } from './Tap'

type ChatRowProps = {
  title: string
  preview?: string | null
  time?: string
  onPress: () => void
  onLongPress?: () => void
}

// One chat in a list: title, one-line preview and a short age label. Long-press is optional.
export function ChatRow({ title, preview, time, onPress, onLongPress }: ChatRowProps) {
  const s = useStyles()
  return (
    <Tap
      onPress={onPress}
      onLongPress={onLongPress}
      scale={motion.press.rowScale}
      style={s.row}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={s.body}>
        <Text style={s.title} numberOfLines={1}>
          {title}
        </Text>
        {preview ? (
          <Text style={s.preview} numberOfLines={1}>
            {preview}
          </Text>
        ) : null}
      </View>
      {time ? <Text style={s.time}>{time}</Text> : null}
    </Tap>
  )
}

const useStyles = themedStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: t.c.line,
  },
  body: { flex: 1, minWidth: 0 },
  title: { ...font('bodyStrong'), color: t.c.ink },
  preview: { ...font('secondary'), color: t.c.ink2, marginTop: 3 },
  time: { ...font('caption'), color: t.c.ink3 },
}))
