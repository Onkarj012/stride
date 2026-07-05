import { useState } from 'react'
import { ScrollView, View, Text, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { Icon } from '../components/Icon'
import { useTheme, LAVENDER, PEACH, MINT } from '../components/theme'
import { ListRow, Toggle, SegToggle } from '../components/ui'
import * as Haptics from '../lib/haptics'

const SPRING = { stiffness: 220, damping: 26 } as const

function Section({ title, children, delay = 0 }: { title: string; children: React.ReactNode; delay?: number }) {
  const t = useTheme()
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify().stiffness(SPRING.stiffness).damping(SPRING.damping)}>
      <Text style={{
        fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 2,
        color: t.textSubtle, textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
      }}>
        {title}
      </Text>
      <View style={[{ backgroundColor: t.card, borderRadius: 18, paddingHorizontal: 16, marginBottom: 24 }, t.cardShadow]}>
        {children}
      </View>
    </Animated.View>
  )
}

function ToggleListRow({ label, subtitle, initial, icon, onColor }: {
  label: string
  subtitle?: string
  initial: boolean
  icon: Parameters<typeof ListRow>[0]['icon']
  onColor?: string
}) {
  const [on, setOn] = useState(initial)
  const t = useTheme()

  function handleToggle() {
    const next = !on
    setOn(next)
    Haptics.selectionAsync()
  }

  return (
    <ListRow
      icon={icon}
      label={label}
      subtitle={subtitle}
      iconBg={on ? `${onColor ?? t.accent}22` : t.dimBgMid}
      iconColor={on ? (onColor ?? t.accent) : t.textMuted}
      showChevron={false}
      right={<Toggle value={on} onChange={handleToggle} onColor={onColor ?? t.accent} />}
    />
  )
}

export default function SettingsScreen() {
  const router = useRouter()
  const t = useTheme()
  const [waterUnit, setWaterUnit] = useState<'ml' | 'oz'>('ml')
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg')

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          entering={FadeInDown.springify().stiffness(SPRING.stiffness).damping(SPRING.damping)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 28, paddingTop: 8 }}
        >
          <Pressable
            onPress={() => { Haptics.impactAsync('light'); router.back() }}
            style={({ pressed }) => ({
              width: 40, height: 40, marginLeft: -8, borderRadius: 20,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon name="back" size={24} color={t.textMuted} />
          </Pressable>
          <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 22, color: t.text, letterSpacing: -0.5, flex: 1 }}>
            Settings
          </Text>
        </Animated.View>

        {/* Goals */}
        <Section title="Goals" delay={40}>
          <ListRow label="Primary goal" value="Fat loss" icon="target" />
          <ListRow label="Daily calories" value="1 800 kcal" icon="flame" />
          <ListRow label="Protein target" value="130 g" icon="protein" />
          <ListRow label="Activity level" value="Active · 4×/wk" icon="activity" />
          <ListRow label="Goal weight" value="68 kg" icon="weight" noBorder />
        </Section>

        {/* Units */}
        <Section title="Units" delay={80}>
          <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.border }}>
            <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 14, color: t.text, marginBottom: 10 }}>Weight</Text>
            <SegToggle
              value={weightUnit}
              options={[{ id: 'kg', label: 'kg' }, { id: 'lb', label: 'lb' }]}
              onChange={setWeightUnit}
            />
          </View>
          <View style={{ paddingVertical: 14 }}>
            <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 14, color: t.text, marginBottom: 10 }}>Water</Text>
            <SegToggle
              value={waterUnit}
              options={[{ id: 'ml', label: 'ml' }, { id: 'oz', label: 'oz' }]}
              onChange={setWaterUnit}
            />
          </View>
        </Section>

        {/* Notifications */}
        <Section title="Notifications" delay={120}>
          <ToggleListRow label="Morning insight" subtitle="Daily 9am summary" initial icon="sun" />
          <ToggleListRow label="Workout reminders" subtitle="30 min before session" initial icon="bell" />
          <ToggleListRow label="Water nudges" subtitle="Every 2 hours" initial={false} icon="droplet" onColor={MINT} />
          <ToggleListRow label="Weekly recap" subtitle="Every Sunday" initial icon="mail" onColor={PEACH} />
          <ToggleListRow label="Streak alerts" subtitle="Don't break your streak" initial={false} icon="flame" onColor={PEACH} />
        </Section>

        {/* AI */}
        <Section title="Stry AI" delay={160}>
          <ToggleListRow label="Proactive suggestions" subtitle="Stry flags issues before you ask" initial icon="sparkles" />
          <ToggleListRow label="Voice input" initial icon="mic" />
          <ListRow label="AI model" value="Stride 2.0" icon="chip" />
          <ListRow label="Memory & context" subtitle="What Stry remembers about you" icon="brain" noBorder />
        </Section>

        {/* Privacy */}
        <Section title="Privacy" delay={200}>
          <ListRow label="Data export" subtitle="Download your full history" icon="download" />
          <ListRow label="Connected apps" icon="link" />
          <ToggleListRow label="Analytics sharing" subtitle="Anonymous usage data" initial={false} icon="chart" />
          <ListRow label="Delete account" icon="trash" noBorder />
        </Section>

        {/* App */}
        <Section title="App" delay={240}>
          <ListRow label="Rate Stride" icon="star" />
          <ListRow label="Send feedback" icon="mail" />
          <ListRow label="Terms & Privacy" icon="shield" />
          <ListRow label="Version" value="1.0.0-beta" icon="info" noBorder />
        </Section>
      </ScrollView>
    </SafeAreaView>
  )
}
