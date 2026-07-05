import { View, Text } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import type { AgentType } from '../data'

const CONFIG: Record<AgentType, { label: string; bg: string; dot: string; text: string }> = {
  diet:      { label: 'Diet',      bg: '#fdb572', dot: 'rgba(13,16,27,0.25)', text: '#0d101b' },
  workout:   { label: 'Workout',   bg: '#b8e5c0', dot: 'rgba(13,16,27,0.25)', text: '#0d101b' },
  sleep:     { label: 'Sleep',     bg: '#a0c6ff', dot: 'rgba(13,16,27,0.25)', text: '#0d101b' },
  hydration: { label: 'Hydration', bg: '#a0c6ff', dot: 'rgba(13,16,27,0.25)', text: '#0d101b' },
  habits:    { label: 'Habits',    bg: '#b3a0ff', dot: 'rgba(13,16,27,0.25)', text: '#0d101b' },
  mental:    { label: 'Mental',    bg: '#f4b5d6', dot: 'rgba(13,16,27,0.25)', text: '#0d101b' },
  overall:   { label: 'Overall',   bg: '#0d101b', dot: 'rgba(255,255,255,0.4)', text: '#ffffff' },
}

export function AgentBadge({ type }: { type: AgentType }) {
  const c = CONFIG[type]
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: c.bg,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.dot }} />
      <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 11, color: c.text, letterSpacing: 0.3 }}>
        {c.label}
      </Text>
    </Animated.View>
  )
}
