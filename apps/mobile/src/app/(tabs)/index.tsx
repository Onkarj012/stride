import { useEffect, useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated'
import { router } from 'expo-router'
import { useUser } from '@clerk/expo'
import { useMutation, useQuery } from 'convex/react'
import { inferSlot } from '@stride/core'
import { api } from 'stride-backend/convex/_generated/api'
import { layout, radii } from '@stride/ui-tokens'
import { AccountSheet, Avatar } from '@/components/AccountSheet'
import { DayBar, Macro, Odometer } from '@/components/Budget'
import { useBurnMilestone } from '@/components/BurnSheet'
import { Button, RoundButton } from '@/components/Controls'
import { useLog } from '@/components/useLog'
import { MealRow, NextMealRow, groupMeals } from '@/components/Meals'
import { Polo } from '@/components/Polo'
import { Screen, Section } from '@/components/Screen'
import { Tap } from '@/components/Tap'
import { formatDateline, formatNumber, greeting } from '@/lib/format'
import { SUMMARY_DAYS, plainError, targetsFor, type MealSlot } from '@/lib/log'
import { kgLabel, savedUnits, stepKg, weightNumber, weightToKg, weightUnit, type Units } from '@/lib/profile'
import { useLocalToday } from '@/lib/useLocalToday'
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
  const [accountOpen, setAccountOpen] = useState(false)
  const { compose, openMeal, openDraft } = useLog()
  const minutes = useClockMinutes()
  const today = useLocalToday()
  const totals = useQuery(api.day_totals.dayTotals, { localDate: today })
  const entries = useQuery(api.entries.entriesForDay, { localDate: today })
  const pendingDrafts = useQuery(api.pipeline.drafts.listPendingDrafts, {})
  const summary = useQuery(api.progress_v2.summary, { rangeDays: SUMMARY_DAYS, localDate: today })
  useBurnMilestone(summary?.snapshot != null)

  const name = user?.firstName || user?.username || 'there'
  const now = new Date()
  const night = isNight(now)
  const targets = targetsFor(summary?.target?.kcal ?? null)

  const header = (
    <View style={s.head}>
      <View style={s.headText}>
        <Text style={s.eyebrow}>{formatDateline(now)}</Text>
        <Text style={s.greet}>{greeting(minutes, name)}</Text>
      </View>
      <Tap style={s.avatar} scale={0.9} onPress={() => setAccountOpen(true)} accessibilityRole="button" accessibilityLabel="You">
        <Avatar size={layout.avatar} />
      </Tap>
    </View>
  )

  if (totals === undefined || entries === undefined)
    return (
      <>
        <Screen>
          {header}
          <View style={s.loading}>
            <Polo size={56} />
            <Text style={s.loadingText}>Getting today ready…</Text>
          </View>
        </Screen>
        <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
      </>
    )

  const eaten = totals.nutrients
  const left = Math.round(targets.kcal - eaten.kcal)
  const meals = groupMeals(entries)
  const slotNow = inferSlot(Math.floor(minutes / 60), minutes % 60)
  const showNext = !night && meals.length > 0 && !meals.some((m) => m.slot === slotNow)

  return (
    <>
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

        {!night ? <WeighCard key={today} today={today} trendKg={summary?.latestTrendKg ?? null} weeklyRateKg={summary?.weeklyRateKg ?? null} /> : null}

        {pendingDrafts?.map((draft) => (
          <Tap key={draft._id} style={[s.card, s.weighCard, s.weighSaved]} onPress={() => openDraft(draft._id)} accessibilityRole="button">
            <View style={s.grow}>
              <Text style={s.weighNote}>You have an unfinished log</Text>
              <Text style={s.faintSmall}>{draft.itemCount} item{draft.itemCount === 1 ? '' : 's'} · tap to resume</Text>
            </View>
          </Tap>
        ))}

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
              {showNext ? <NextMealRow slot={slotNow} around={AROUND[slotNow]} first={false} onPress={() => compose('text', slotNow)} /> : null}
            </>
          )}
        </View>
      </Screen>
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </>
  )
}

// Morning weigh-in (mock #/weigh). Type or step the weight in the user's unit, save with logWeight in kg; a second save the same day replaces it.
function WeighCard({ today, trendKg, weeklyRateKg }: { today: string; trendKg: number | null; weeklyRateKg: number | null }) {
  const t = useTheme()
  const s = useStyles()
  const { toast } = useLog()
  const profile = useQuery(api.progress_v2.profile, {})
  const weight = useQuery(api.weights.todayWeight, { localDate: today })
  const logWeight = useMutation(api.weights.logWeight)
  // The draft is kg, so changing units only changes how it is shown.
  const [draftKg, setDraftKg] = useState<number | null>(null)
  // Raw text as typed, tagged with its unit so a units change cannot reread it.
  const [typed, setTyped] = useState<{ text: string; units: Units } | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  if (weight === undefined)
    return (
      <View style={[s.card, s.weighCard, s.weighSaved]}>
        <View style={s.grow}>
          <Text style={s.eyebrow}>Morning weight</Text>
          <Text style={[s.weighNote, { color: t.c.ink3 }]}>Checking today's weigh-in…</Text>
        </View>
      </View>
    )
  const units = savedUnits(profile?.units)
  // Start from today's or the latest weigh-in; 70 is only a starting point for the very first one.
  const start = weight.kg ?? weight.latestKg ?? 70
  const typing = typed?.units === units ? typed.text : null
  const typedValue = typing === null ? null : Number(typing.replace(',', '.'))
  const valid = typedValue === null || (Number.isFinite(typedValue) && typedValue > 0)
  const kg = valid && typedValue !== null ? weightToKg(typedValue, units) : (draftKg ?? start)
  const text = typing ?? weightNumber(kg, units)
  const step = (dir: -1 | 1) => {
    setDraftKg(stepKg(kg, dir, units))
    setTyped(null)
  }

  // Stores the weight for today and folds the card.
  async function save() {
    if (!valid) return
    setBusy(true)
    try {
      await logWeight({ kg, localDate: today })
      setEditing(false)
      setDraftKg(null)
      setTyped(null)
      toast({ title: `Weight saved · ${kgLabel(kg, units)}`, sub: "Trend barely moves on one day. That's the point." })
    } catch (err) {
      toast({ title: "Couldn't save your weight.", sub: plainError(err) })
    } finally {
      setBusy(false)
    }
  }

  if (weight.kg !== null && !editing) {
    const direction =
      weeklyRateKg === null ? '' : weeklyRateKg < -0.05 ? ', heading down' : weeklyRateKg > 0.05 ? ', heading up' : ', steady'
    return (
      <Animated.View entering={FadeIn} layout={LinearTransition.springify()} style={[s.card, s.weighCard, s.weighSaved]}>
        <View style={s.grow}>
          <Text style={s.eyebrow}>Weighed in</Text>
          <Text style={s.weighNote}>
            <Text style={s.weighValueInline}>{kgLabel(weight.kg, units)}</Text>
            {trendKg !== null ? `  trend ${kgLabel(trendKg, units)}${direction}` : '  feeds your burn estimate'}
          </Text>
        </View>
        <Button label="Edit" size="sm" variant="ghost" onPress={() => setEditing(true)} />
      </Animated.View>
    )
  }

  return (
    <Animated.View entering={FadeIn} layout={LinearTransition.springify()} style={[s.card, s.weighCard]}>
      <Text style={s.eyebrow}>Morning weight</Text>
      <Text style={[s.faintSmall, s.weighHint]}>Optional. Feeds your burn estimate.</Text>
      <View style={s.weighRow}>
        <RoundButton icon="minus" label="Less" onPress={() => step(-1)} />
        <View style={s.weighField}>
          <TextInput
            value={text}
            onChangeText={(next) => setTyped({ text: next, units })}
            onSubmitEditing={() => void save()}
            keyboardType="decimal-pad"
            returnKeyType="done"
            selectTextOnFocus
            maxLength={5}
            style={s.weighValue}
            accessibilityLabel={`Weight in ${weightUnit(units)}`}
          />
          <Text style={[s.weighUnit, { color: t.c.ink3 }]}>{weightUnit(units)}</Text>
        </View>
        <RoundButton icon="plus" label="More" onPress={() => step(1)} />
        <View style={s.grow} />
        <Button label="Save" size="sm" busy={busy} disabled={!valid} onPress={() => void save()} />
      </View>
    </Animated.View>
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
  weighField: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', minWidth: 92 },
  weighValue: { ...font('stepper'), color: t.c.ink, padding: 0, minWidth: 58, textAlign: 'center', fontVariant: ['tabular-nums'] },
  weighUnit: { ...font('unit'), marginLeft: 3 },
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
