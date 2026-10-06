import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { router } from 'expo-router'
import { useAuth, useUser } from '@clerk/expo'
import { layout, motion, radii } from '@stride/ui-tokens'
import { Odometer, DayBar, Macro } from '@/components/Budget'
import { Icon } from '@/components/Icon'
import { Polo } from '@/components/Polo'
import { Screen, Section } from '@/components/Screen'
import { Tap } from '@/components/Tap'
import { dayFixtures, fixtureForNow, type DayVariant, type Entry, type Usual, type Workout } from '@/fixtures'
import { formatClock, formatDateline, formatNumber, greeting, quantitySuffix } from '@/lib/format'
import { font, themedStyles, useTheme } from '@/theme'

const VARIANTS: DayVariant[] = ['midday', 'empty', 'night']
const SLOT_NAMES = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' } as const

type Meal = { key: string; slot: Entry['slot']; time: string; entries: Entry[]; kcal: number }

// Groups ledger entries into meal rows: same slot logged at the same time.
function toMeals(entries: Entry[]): Meal[] {
  const meals: Meal[] = []
  for (const e of entries) {
    const key = `${e.slot}-${e.loggedAt}`
    const meal = meals.find((m) => m.key === key)
    if (meal) {
      meal.entries.push(e)
      meal.kcal += e.kcal
    } else meals.push({ key, slot: e.slot, time: e.loggedAt, entries: [e], kcal: e.kcal })
  }
  return meals
}

// Day totals from unrounded entry values; callers round once at display.
function sumDay(entries: Entry[]) {
  return entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      proteinG: acc.proteinG + e.proteinG,
      carbsG: acc.carbsG + e.carbsG,
      fatG: acc.fatG + e.fatG,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  )
}

// Today: kcal left, macros, usuals, meals and training, on fixture data until slice 6.
export default function TodayScreen() {
  const t = useTheme()
  const s = useStyles()
  const { user } = useUser()
  const { signOut } = useAuth()
  const [variant, setVariant] = useState<DayVariant>(() => fixtureForNow(new Date()))
  const day = dayFixtures[variant]

  const name = user?.firstName || user?.username || 'there'
  const total = useMemo(() => sumDay(day.entries), [day])
  const meals = useMemo(() => toMeals(day.entries), [day])
  const left = Math.round(day.targets.kcal - total.kcal)

  // Account sheet for now: shows who is signed in and offers sign out.
  function openAccount() {
    Alert.alert(name, user?.primaryEmailAddress?.emailAddress ?? '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ])
  }

  return (
    <Screen>
      <View style={s.head}>
        <View style={s.headText}>
          <Text style={s.eyebrow}>{formatDateline(new Date())}</Text>
          <Text style={s.greet}>{greeting(day.clockMinutes, name)}</Text>
        </View>
        <Tap
          style={s.avatar}
          scale={0.9}
          onPress={openAccount}
          onLongPress={() => setVariant((v) => VARIANTS[(VARIANTS.indexOf(v) + 1) % VARIANTS.length] ?? 'midday')}
          accessibilityRole="button"
          accessibilityLabel="You"
        >
          <Text style={s.avatarText}>{name.charAt(0).toUpperCase()}</Text>
        </Tap>
      </View>

      <View style={s.hero} key={variant}>
        <View style={s.heroLabel}>
          <Text style={s.eyebrow}>Left today</Text>
          <Text style={s.faintSmall}>{formatNumber(total.kcal)} eaten</Text>
        </View>
        <View style={s.bignum}>
          <Odometer value={Math.abs(left)} />
          <Text style={s.of}>
            {left >= 0 ? `of ${formatNumber(day.targets.kcal)}\nkcal` : `over\n${formatNumber(day.targets.kcal)} kcal`}
          </Text>
        </View>
        <DayBar meals={meals.map((m) => ({ key: m.key, kcal: m.kcal }))} target={day.targets.kcal} />
        <View style={s.macros}>
          <Macro name="Protein" eaten={total.proteinG} target={day.targets.proteinG} color={t.c.protein} />
          <Macro name="Carbs" eaten={total.carbsG} target={day.targets.carbsG} color={t.c.carbs} />
          <Macro name="Fat" eaten={total.fatG} target={day.targets.fatG} color={t.c.fat} />
        </View>
        {day.nightNote ? (
          <View style={s.nightNote}>
            <Text style={s.nightText}>
              <Text style={s.nightStrong}>{formatNumber(Math.max(0, left))} left</Text> {day.nightNote}
            </Text>
          </View>
        ) : null}
      </View>

      {day.weighIn ? <WeighCard key={variant} draftKg={day.weighIn.draftKg} trendNote={day.weighIn.trendNote} /> : null}

      <Section title={day.usuals.title} link="One tap logs" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chips} contentContainerStyle={s.chipsInner}>
        {day.usuals.items.map((u) => (
          <UsualCard key={`${variant}-${u.label}`} usual={u} />
        ))}
      </ScrollView>

      <Section title="Meals" link="History" onLink={() => router.navigate('/log')} />
      <View style={s.mealsCard}>
        {meals.length === 0 ? (
          <View style={s.empty}>
            <Polo size={64} hop={1} />
            <Text style={s.emptyTitle}>Clean slate.</Text>
            <Text style={s.emptyBody}>Nothing logged yet. Tap a usual above, or tell me what you had.</Text>
          </View>
        ) : (
          <>
            {meals.map((m, i) => (
              <MealRow key={m.key} meal={m} first={i === 0} />
            ))}
            {day.next ? <NextMealRow slot={SLOT_NAMES[day.next.slot]} around={formatClock(day.next.around)} /> : null}
          </>
        )}
      </View>

      <Section title="Training" link="Strength" onLink={() => router.navigate('/progress')} />
      <TrainingCard workout={day.workout} />
    </Screen>
  )
}

// One logged meal: time, slot, item line, kcal.
function MealRow({ meal, first }: { meal: Meal; first: boolean }) {
  const s = useStyles()
  const items = meal.entries.map((e) => `${e.food}${quantitySuffix(e.quantity)}`).join(' · ')
  return (
    <Pressable style={({ pressed }) => [s.meal, !first && s.mealDivider, pressed && s.mealPressed]}>
      <Text style={s.mealTime}>{formatClock(meal.time)}</Text>
      <View style={s.mealMain}>
        <Text style={s.mealName}>{SLOT_NAMES[meal.slot]}</Text>
        <Text style={s.mealItems}>{items}</Text>
      </View>
      <Text style={s.mealKcal}>{formatNumber(meal.kcal)}</Text>
    </Pressable>
  )
}

// Ghost row inviting the next meal of the day.
function NextMealRow({ slot, around }: { slot: string; around: string }) {
  const t = useTheme()
  const s = useStyles()
  return (
    <Pressable
      style={({ pressed }) => [s.meal, s.mealDivider, pressed && s.mealPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Log ${slot}`}
    >
      <Text style={s.mealTime}>~{around}</Text>
      <View style={s.mealMain}>
        <Text style={[s.mealName, { color: t.c.ink3 }]}>{slot}</Text>
        <Text style={[s.mealItems, { color: t.c.ink3 }]}>Tap to log</Text>
      </View>
      <View style={s.ghostPlus}>
        <Icon name="plus" size={16} color={t.c.ink2} />
      </View>
    </Pressable>
  )
}

// A one-tap usual. Flashes "done" for a moment; logging arrives in slice 6.
function UsualCard({ usual }: { usual: Usual }) {
  const t = useTheme()
  const s = useStyles()
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 1600)
    return () => clearTimeout(timer)
  }, [done])

  return (
    <Tap style={[s.usual, done && s.usualDone]} scale={0.94} onPress={() => setDone(true)} accessibilityRole="button">
      <Text style={[s.usualLabel, done && { color: t.c.bg }]} numberOfLines={2}>
        {usual.label}
      </Text>
      <View style={s.usualFoot}>
        <Text style={[s.usualKcal, done && { color: t.c.bg, opacity: 0.7 }]}>{formatNumber(usual.kcal)} kcal</Text>
        <View style={s.usualPlus}>
          <Icon name={done ? 'check' : 'plus'} size={15} color={t.c.ink} />
        </View>
      </View>
    </Tap>
  )
}

// Morning weigh-in stepper. Local only until slice 7 stores weights.
function WeighCard({ draftKg, trendNote }: { draftKg: number; trendNote: string }) {
  const t = useTheme()
  const s = useStyles()
  const [kg, setKg] = useState(draftKg)
  const [saved, setSaved] = useState(false)
  const step = (d: number) => setKg((v) => Math.round((v + d) * 10) / 10)

  if (saved)
    return (
      <View style={[s.card, s.weighCard, s.weighSaved]}>
        <View style={s.grow}>
          <Text style={s.eyebrow}>Weighed in</Text>
          <Text style={s.weighNote}>
            <Text style={s.weighValueInline}>{kg.toFixed(1)} kg</Text>  {trendNote}
          </Text>
        </View>
        <Tap style={[s.btnSm, s.btnGhost]} onPress={() => setSaved(false)} accessibilityRole="button">
          <Text style={[s.btnText, { color: t.c.ink }]}>Edit</Text>
        </Tap>
      </View>
    )

  return (
    <View style={[s.card, s.weighCard]}>
      <Text style={s.eyebrow}>Morning weight</Text>
      <Text style={[s.faintSmall, s.weighHint]}>Optional. Feeds your burn estimate.</Text>
      <View style={s.weighRow}>
        <Tap style={s.iconBtn} scale={0.88} onPress={() => step(-0.1)} accessibilityLabel="Less">
          <Icon name="minus" color={t.c.ink} />
        </Tap>
        <Text style={s.weighValue}>
          {kg.toFixed(1)}
          <Text style={s.weighUnit}> kg</Text>
        </Text>
        <Tap style={s.iconBtn} scale={0.88} onPress={() => step(0.1)} accessibilityLabel="More">
          <Icon name="plus" color={t.c.ink} />
        </Tap>
        <View style={s.grow} />
        <Tap style={s.btnSm} onPress={() => setSaved(true)} accessibilityRole="button">
          <Text style={[s.btnText, { color: t.c.bg }]}>Save</Text>
        </Tap>
      </View>
    </View>
  )
}

// Today's planned or finished session.
function TrainingCard({ workout }: { workout: Workout }) {
  const t = useTheme()
  const s = useStyles()
  const done = workout.status === 'done'
  const go = useSharedValue(1)
  const goStyle = useAnimatedStyle(() => ({ transform: [{ scale: go.value }] }))
  return (
    <Pressable
      style={s.card}
      onPressIn={() => (go.value = withSpring(0.9, motion.spring.bouncy))}
      onPressOut={() => (go.value = withSpring(1, motion.spring.bouncy))}
      accessibilityRole="button"
    >
      <View style={s.wTop}>
        <View style={s.grow}>
          <Text style={s.eyebrow}>
            {done ? `Done · ${formatClock(workout.doneAt, true)}` : `Planned · ~${workout.minutes} min`}
          </Text>
          <Text style={s.wName}>{workout.name}</Text>
          {done ? <Text style={s.wSummary}>{workout.summary}</Text> : null}
        </View>
        <Animated.View style={[s.go, done && { backgroundColor: t.c.card2 }, goStyle]}>
          <Icon name={done ? 'check' : 'play'} size={done ? 22 : 20} color={done ? t.c.ink : t.c.onPolo} />
        </Animated.View>
      </View>
      {workout.status === 'planned' ? (
        <View style={s.exercises}>
          {workout.exercises.map((e) => (
            <Text key={e} style={s.exercise}>
              {e}
            </Text>
          ))}
        </View>
      ) : null}
    </Pressable>
  )
}

const useStyles = themedStyles((t) => ({
  grow: { flex: 1 },
  eyebrow: { ...font('eyebrow'), color: t.c.ink3 },
  faintSmall: { ...font('caption'), color: t.c.ink3 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8 },
  headText: { flex: 1, paddingRight: 12 },
  greet: { ...font('greeting'), color: t.c.ink, marginTop: 6 },
  avatar: {
    width: layout.avatar,
    height: layout.avatar,
    borderRadius: radii.pill,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...font('avatar'), color: t.c.ink },
  hero: { marginTop: 26 },
  heroLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bignum: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 },
  of: { ...font('heroUnit'), color: t.c.ink3, marginLeft: 12, marginBottom: 10 },
  macros: { flexDirection: 'row', gap: 14, marginTop: 24 },
  nightNote: {
    marginTop: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.sm,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  nightText: { ...font('callout'), color: t.c.ink },
  nightStrong: { ...font('calloutStrong'), lineHeight: undefined },
  card: { backgroundColor: t.c.card, borderRadius: radii.card, boxShadow: t.shadow.card, padding: layout.cardPadding },
  weighCard: { marginTop: 22 },
  weighSaved: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  weighHint: { marginTop: 4 },
  weighRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  weighValue: { ...font('stepper'), color: t.c.ink, minWidth: 92, textAlign: 'center' },
  weighUnit: { ...font('unit'), color: t.c.ink3 },
  weighNote: { ...font('callout'), color: t.c.ink2, marginTop: 6 },
  weighValueInline: { ...font('cardTitle'), color: t.c.ink },
  iconBtn: {
    width: layout.iconButton,
    height: layout.iconButton,
    borderRadius: radii.pill,
    backgroundColor: t.c.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSm: {
    height: 34,
    paddingHorizontal: 13,
    borderRadius: radii.pill,
    backgroundColor: t.c.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: t.c.card2 },
  btnText: { ...font('buttonSmall') },
  chips: { marginHorizontal: -layout.screenX },
  chipsInner: { gap: 8, paddingHorizontal: layout.screenX, paddingTop: 2, paddingBottom: 6 },
  usual: {
    width: 150,
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  usualDone: { backgroundColor: t.c.ink },
  usualLabel: { ...font('calloutStrong'), color: t.c.ink, minHeight: 36 },
  usualFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  usualKcal: { ...font('caption'), color: t.c.ink3 },
  usualPlus: {
    width: 26,
    height: 26,
    borderRadius: radii.pill,
    backgroundColor: t.c.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealsCard: {
    backgroundColor: t.c.card,
    borderRadius: radii.card,
    boxShadow: t.shadow.card,
    paddingVertical: 4,
    paddingHorizontal: 14,
  },
  meal: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 14, paddingHorizontal: 4 },
  mealDivider: { borderTopWidth: 1, borderTopColor: t.c.line },
  mealPressed: { backgroundColor: t.c.card2, borderRadius: radii.sm },
  mealTime: { ...font('caption'), color: t.c.ink3, width: 48, paddingTop: 2, fontVariant: ['tabular-nums'] },
  mealMain: { flex: 1 },
  mealName: { ...font('bodyStrong'), color: t.c.ink },
  mealItems: { ...font('secondary'), color: t.c.ink2, marginTop: 3 },
  mealKcal: { ...font('value'), color: t.c.ink, paddingTop: 1 },
  ghostPlus: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: t.c.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingTop: 26, paddingBottom: 22, paddingHorizontal: 10 },
  emptyTitle: { ...font('emptyTitle'), color: t.c.ink, marginTop: 12 },
  emptyBody: { ...font('callout'), color: t.c.ink2, marginTop: 6, textAlign: 'center' },
  wTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  wName: { ...font('cardTitle'), color: t.c.ink, marginTop: 4 },
  wSummary: { ...font('secondary'), color: t.c.ink2, marginTop: 6 },
  go: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: t.c.polo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exercises: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  exercise: {
    ...font('caption'),
    color: t.c.ink2,
    backgroundColor: t.c.card2,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
}))
