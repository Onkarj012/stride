import { useEffect, useState } from 'react'
import { Alert, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useAuth, useUser } from '@clerk/expo'
import { useMutation, useQuery } from 'convex/react'
import { addDays, inferSlot } from '@stride/core'
import { api } from 'stride-backend/convex/_generated/api'
import { layout, radii } from '@stride/ui-tokens'
import { DayBar, Macro, Odometer } from '@/components/Budget'
import { Button, RoundButton } from '@/components/Controls'
import { useLog } from '@/components/LogProvider'
import { MealRow, NextMealRow, groupMeals } from '@/components/Meals'
import { Polo } from '@/components/Polo'
import { Screen, Section } from '@/components/Screen'
import { Tap } from '@/components/Tap'
import { formatDateline, formatNumber, greeting } from '@/lib/format'
import { DEFAULT_TARGETS, plainError, type MealSlot } from '@/lib/log'
import { font, themedStyles, useTheme } from '@/theme'

const AROUND: Record<MealSlot, string> = { breakfast: '8:30', lunch: '1:30', snack: '5:00', dinner: '8:30' }

// Late night (22:00 to 5:00) gets the sleepy Today: no weigh-in, a closing note instead of the next meal.
function isNight(now: Date): boolean {
  const h = now.getHours()
  return h >= 22 || h < 5
}

// Minutes since local midnight, refreshed every minute so the greeting and next meal follow the clock.
function useClockMinutes(): number {
  const read = () => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  }
  const [minutes, setMinutes] = useState(read)
  useEffect(() => {
    const timer = setInterval(() => setMinutes(read()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return minutes
}

// Today: kcal left, macros, weigh-in and meals from the ledger. Tap a meal to edit it.
export default function TodayScreen() {
  const t = useTheme()
  const s = useStyles()
  const { user } = useUser()
  const { signOut } = useAuth()
  const { compose, openMeal } = useLog()
  const minutes = useClockMinutes()
  const totals = useQuery(api.day_totals.dayTotals, {})
  const entries = useQuery(api.entries.entriesForDay, {})
  const today = totals?.localDate

  const name = user?.firstName || user?.username || 'there'
  const now = new Date()
  const night = isNight(now)
  const targets = DEFAULT_TARGETS

  // Account sheet for now: shows who is signed in and offers sign out.
  function openAccount() {
    Alert.alert(name, user?.primaryEmailAddress?.emailAddress ?? '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ])
  }

  const header = (
    <View style={s.head}>
      <View style={s.headText}>
        <Text style={s.eyebrow}>{formatDateline(now)}</Text>
        <Text style={s.greet}>{greeting(minutes, name)}</Text>
      </View>
      <Tap style={s.avatar} scale={0.9} onPress={openAccount} accessibilityRole="button" accessibilityLabel="You">
        <Text style={s.avatarText}>{name.charAt(0).toUpperCase()}</Text>
      </Tap>
    </View>
  )

  if (totals === undefined || entries === undefined)
    return (
      <Screen>
        {header}
        <View style={s.loading}>
          <Polo size={56} />
          <Text style={s.loadingText}>Getting today ready…</Text>
        </View>
      </Screen>
    )

  const eaten = totals.nutrients
  const left = Math.round(targets.kcal - eaten.kcal)
  const meals = groupMeals(entries)
  const slotNow = inferSlot(Math.floor(minutes / 60), minutes % 60)
  const showNext = !night && meals.length > 0 && !meals.some((m) => m.slot === slotNow)

  return (
    <Screen>
      {header}

      <View style={s.hero}>
        <View style={s.heroLabel}>
          <Text style={s.eyebrow}>Left today</Text>
          <Text style={s.faintSmall}>{formatNumber(eaten.kcal)} eaten</Text>
        </View>
        <View style={s.bignum}>
          <Odometer value={Math.abs(left)} />
          <Text style={s.of}>
            {left >= 0 ? `of ${formatNumber(targets.kcal)}\nkcal` : `over\n${formatNumber(targets.kcal)} kcal`}
          </Text>
        </View>
        <DayBar meals={meals.map((m) => ({ key: m.slot, kcal: m.kcal }))} target={targets.kcal} />
        <View style={s.macros}>
          <Macro name="Protein" eaten={eaten.protein} target={targets.proteinG} color={t.c.protein} />
          <Macro name="Carbs" eaten={eaten.carbs} target={targets.carbsG} color={t.c.carbs} />
          <Macro name="Fat" eaten={eaten.fat} target={targets.fatG} color={t.c.fat} />
        </View>
        {night ? (
          <View style={s.nightNote}>
            <Text style={s.nightText}>
              {left >= 0 ? (
                <>
                  <Text style={s.nightStrong}>{formatNumber(left)} left</Text> and the kitchen's closing. If you're
                  hungry, something light fits. If not, that's a good day. Sleep well.
                </>
              ) : (
                <>
                  <Text style={s.nightStrong}>{formatNumber(-left)} over</Text> today. That's fine, one day doesn't move the
                  trend. Sleep well.
                </>
              )}
            </Text>
          </View>
        ) : null}
      </View>

      {!night && today ? <WeighCard today={today} /> : null}

      <Section title="Meals" link="History" onLink={() => router.navigate('/log')} />
      <View style={s.mealsCard}>
        {meals.length === 0 ? (
          <View style={s.empty}>
            <Polo size={64} hop={1} mood={night ? 'sleep' : 'idle'} />
            <Text style={s.emptyTitle}>Clean slate.</Text>
            <Text style={s.emptyBody}>Nothing logged yet. Tell me what you had, in any words.</Text>
            <Button label="Log something" size="sm" onPress={() => compose('text')} style={s.emptyButton} />
          </View>
        ) : (
          <>
            {meals.map((m, i) => (
              <MealRow key={m.slot} meal={m} first={i === 0} onPress={() => today && openMeal(today, m.slot)} />
            ))}
            {showNext ? <NextMealRow slot={slotNow} around={AROUND[slotNow]} first={false} onPress={() => compose('text')} /> : null}
          </>
        )}
      </View>
    </Screen>
  )
}

// Morning weigh-in. Saves with logWeight; one weigh-in per day, a second one replaces it.
function WeighCard({ today }: { today: string }) {
  const t = useTheme()
  const s = useStyles()
  const { toast } = useLog()
  const recent = useQuery(api.weights.weightsInRange, { from: addDays(today, -30), to: today })
  const logWeight = useMutation(api.weights.logWeight)
  const [draft, setDraft] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  if (recent === undefined) return null
  const todays = recent.find((w) => w.localDate === today)
  const last = recent.at(-1)
  const kg = draft ?? todays?.kg ?? last?.kg ?? 70
  const step = (d: number) => setDraft(Math.round((kg + d) * 10) / 10)

  // Stores the weight for today and folds the card.
  async function save() {
    setBusy(true)
    try {
      await logWeight({ kg })
      setEditing(false)
      setDraft(null)
      toast({ title: `Weight saved · ${kg.toFixed(1)} kg`, sub: "Trend barely moves on one day. That's the point." })
    } catch (err) {
      toast({ title: "Couldn't save your weight.", sub: plainError(err) })
    } finally {
      setBusy(false)
    }
  }

  if (todays && !editing)
    return (
      <View style={[s.card, s.weighCard, s.weighSaved]}>
        <View style={s.grow}>
          <Text style={s.eyebrow}>Weighed in</Text>
          <Text style={s.weighNote}>
            <Text style={s.weighValueInline}>{todays.kg.toFixed(1)} kg</Text>  feeds your burn estimate
          </Text>
        </View>
        <Button label="Edit" size="sm" variant="ghost" onPress={() => setEditing(true)} />
      </View>
    )

  return (
    <View style={[s.card, s.weighCard]}>
      <Text style={s.eyebrow}>Morning weight</Text>
      <Text style={[s.faintSmall, s.weighHint]}>Optional. Feeds your burn estimate.</Text>
      <View style={s.weighRow}>
        <RoundButton icon="minus" label="Less" onPress={() => step(-0.1)} />
        <Text style={s.weighValue}>
          {kg.toFixed(1)}
          <Text style={[s.weighUnit, { color: t.c.ink3 }]}> kg</Text>
        </Text>
        <RoundButton icon="plus" label="More" onPress={() => step(0.1)} />
        <View style={s.grow} />
        <Button label="Save" size="sm" busy={busy} onPress={() => void save()} />
      </View>
    </View>
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
  loading: { alignItems: 'center', marginTop: 80, gap: 12 },
  loadingText: { ...font('callout'), color: t.c.ink3 },
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
  weighUnit: { ...font('unit') },
  weighNote: { ...font('callout'), color: t.c.ink2, marginTop: 6 },
  weighValueInline: { ...font('cardTitle'), color: t.c.ink },
  mealsCard: {
    backgroundColor: t.c.card,
    borderRadius: radii.card,
    boxShadow: t.shadow.card,
    paddingVertical: 4,
    paddingHorizontal: 14,
  },
  empty: { alignItems: 'center', paddingTop: 26, paddingBottom: 22, paddingHorizontal: 10 },
  emptyTitle: { ...font('emptyTitle'), color: t.c.ink, marginTop: 12 },
  emptyBody: { ...font('callout'), color: t.c.ink2, marginTop: 6, textAlign: 'center' },
  emptyButton: { marginTop: 14 },
}))
