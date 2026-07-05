import { useState } from 'react'
import { ScrollView, View, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { Icon, IconName } from '../components/Icon'
import { useTheme } from '../components/theme'
import { AppText, IconButton, ListRow, Toggle } from '../components/ui'

const GOALS = [
  { label: 'Primary goal',    value: 'Fat loss' },
  { label: 'Current weight',  value: '74 kg' },
  { label: 'Goal weight',     value: '68 kg' },
  { label: 'Daily calories',  value: '1 800 kcal' },
  { label: 'Protein target',  value: '130 g' },
  { label: 'Activity level',  value: 'Active · 4×/wk' },
]

const SETTINGS_INIT: { label: string; on: boolean; icon: IconName }[] = [
  { label: 'Daily morning insight', on: true,  icon: 'sun' },
  { label: 'Workout reminders',     on: true,  icon: 'bell' },
  { label: 'Water nudges',          on: false, icon: 'droplet' },
  { label: 'Weekly recap email',    on: true,  icon: 'mail' },
]

const SPRING = { stiffness: 220, damping: 26 } as const

function NotifRow({ label, initial, icon }: { label: string; initial: boolean; icon: IconName }) {
  const [on, setOn] = useState(initial)
  const t = useTheme()
  return (
    <ListRow
      icon={icon}
      label={label}
      iconBg={on ? `${t.accent}22` : t.dimBgMid}
      iconColor={on ? t.accent : t.textMuted}
      showChevron={false}
      right={<Toggle value={on} onChange={setOn} />}
    />
  )
}

export default function AccountScreen() {
  const router = useRouter()
  const t = useTheme()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24, paddingTop: 8 }}>
          <IconButton icon="back" onPress={() => router.back()} size={40} variant="ghost" iconSize={24} iconColor={t.textMuted} marginLeft={-8} />
          <AppText variant="h2" style={{ flex: 1 }}>Account</AppText>
          <IconButton icon="settings" onPress={() => router.push('/settings')} size={36} iconSize={18} />
        </View>

        {/* Profile card */}
        <Animated.View
          entering={FadeInDown.springify().stiffness(SPRING.stiffness).damping(SPRING.damping)}
          style={[{
            flexDirection: 'row', alignItems: 'center', gap: 16,
            backgroundColor: t.card, borderRadius: 20, padding: 20, marginBottom: 24,
          }, t.cardShadow]}
        >
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="h2" color={t.text} style={{ fontSize: 22 }}>O</AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title">Onkar</AppText>
            <AppText variant="small" color={t.textMuted} style={{ marginTop: 2 }}>leoeccentric@gmail.com</AppText>
          </View>
          <Icon name="chevronRight" size={18} color={t.textSubtle} />
        </Animated.View>

        {/* Goals */}
        <AppText variant="overline" style={{ marginBottom: 12 }}>Goals</AppText>
        <Animated.View
          entering={FadeInDown.delay(40).springify().stiffness(SPRING.stiffness).damping(SPRING.damping)}
          style={[{ backgroundColor: t.card, borderRadius: 20, paddingHorizontal: 20, marginBottom: 24 }, t.cardShadow]}
        >
          {GOALS.map((g, i) => (
            <View key={i} style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingVertical: 13,
              borderBottomWidth: i === GOALS.length - 1 ? 0 : 1,
              borderBottomColor: t.border,
            }}>
              <AppText variant="body" color={t.textMuted}>{g.label}</AppText>
              <AppText variant="label" style={{ fontSize: 14 }}>{g.value}</AppText>
            </View>
          ))}
        </Animated.View>

        {/* Notifications */}
        <AppText variant="overline" style={{ marginBottom: 12 }}>Notifications</AppText>
        <Animated.View
          entering={FadeInDown.delay(80).springify().stiffness(SPRING.stiffness).damping(SPRING.damping)}
          style={[{ backgroundColor: t.card, borderRadius: 20, paddingHorizontal: 16, marginBottom: 24 }, t.cardShadow]}
        >
          {SETTINGS_INIT.map((s, i) => (
            <NotifRow key={i} label={s.label} initial={s.on} icon={s.icon} />
          ))}
        </Animated.View>

        {/* Sign out */}
        <Animated.View entering={FadeInDown.delay(120).springify().stiffness(SPRING.stiffness).damping(SPRING.damping)}>
          <Pressable
            style={({ pressed }) => ({
              borderRadius: 16, padding: 16, backgroundColor: t.card,
              ...t.cardShadow, alignItems: 'center', opacity: pressed ? 0.7 : 1,
            })}
          >
            <AppText variant="label" color="#e05252">Sign out</AppText>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  )
}
