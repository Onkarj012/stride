import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { useTheme, PEACH, LAVENDER } from './theme'
import { AppText } from './ui'

interface NarrativeCardProps {
  type: 'daily' | 'weekly'
  narrative: string
  date: string
}

export function NarrativeCard({ type, narrative, date }: NarrativeCardProps) {
  const [displayed, setDisplayed] = useState('')
  const t = useTheme()

  useEffect(() => {
    setDisplayed('')
    let i = 0
    const id = setInterval(() => {
      if (i >= narrative.length) { clearInterval(id); return }
      setDisplayed(narrative.slice(0, ++i))
    }, 20)
    return () => clearInterval(id)
  }, [narrative])

  const eyebrow = type === 'daily' ? 'Morning insight' : 'Weekly recap'
  const accent = type === 'daily' ? PEACH : LAVENDER

  return (
    <View style={[{ backgroundColor: t.card, borderRadius: 20, padding: 20 }, t.cardShadow]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
        <AppText variant="overline" style={{ flex: 1 }}>{eyebrow}</AppText>
        <AppText variant="caption">{date}</AppText>
      </View>
      <View style={{ minHeight: 68 }}>
        <AppText variant="body" style={{ fontSize: 16, lineHeight: 24 }}>
          {displayed}
          {displayed.length < narrative.length && (
            <AppText variant="body" color={accent} style={{ fontSize: 16, lineHeight: 24 }}>|</AppText>
          )}
        </AppText>
      </View>
    </View>
  )
}
