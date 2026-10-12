import { useEffect, useRef } from 'react'
import { Text, View } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { useUser } from '@clerk/expo'
import { useQuery } from 'convex/react'
import { KCAL_PER_KG } from '@stride/core'
import { api } from 'stride-backend/convex/_generated/api'
import { formatNumber } from '@/lib/format'
import { font, themedStyles } from '@/theme'
import { Button, Thinking } from './Controls'
import { useLog } from './LogProvider'
import { Polo } from './Polo'

// Same range as Today and the Progress default, so Convex shares one subscription.
export const SUMMARY_DAYS = 14

// "−0.40 kg a week" with a real minus sign.
export function formatRate(kgPerWeek: number): string {
  const sign = kgPerWeek < -0.005 ? '−' : kgPerWeek > 0.005 ? '+' : ''
  return `${sign}${Math.abs(kgPerWeek).toFixed(2)} kg a week`
}

// How the daily burn is worked out (mock #/tdee), or the one-time "burn estimate ready" milestone (mock #/milestone).
export function BurnSheet({ milestone, onClose }: { milestone: boolean; onClose: () => void }) {
  const s = useStyles()
  const summary = useQuery(api.progress_v2.summary, { rangeDays: SUMMARY_DAYS })
  if (summary === undefined) return <Thinking label="Opening your burn…" />
  const { snapshot, weeklyRateKg, target } = summary
  if (snapshot === null)
    return (
      <View>
        <Text style={s.title}>Not ready yet.</Text>
        <Text style={s.p}>Your burn shows up after two weeks of weigh-ins and logged days.</Text>
        <Button label="Got it" size="block" onPress={onClose} style={s.ok} />
      </View>
    )

  const logged = Math.round(snapshot.confidence * 100)
  return (
    <View>
      {milestone ? (
        <View style={s.polo}>
          <Polo size={72} mood="happy" hop={1} />
        </View>
      ) : null}
      <Text style={[s.eyebrow, milestone && s.center]}>{milestone ? 'Two weeks of data' : 'How your burn is worked out'}</Text>
      <Text style={[s.title, milestone && s.center]}>
        {milestone ? `Your real burn is ready: ${formatNumber(snapshot.estimate)} a day` : "It's just your own numbers"}
      </Text>

      <View style={s.boxes}>
        <View style={s.box}>
          <Text style={s.boxValue}>{snapshot.windowDays}</Text>
          <Text style={s.boxLabel}>days of data</Text>
        </View>
        <View style={s.box}>
          <Text style={s.boxValue}>{logged}%</Text>
          <Text style={s.boxLabel}>of days logged</Text>
        </View>
        <View style={[s.box, s.boxResult]}>
          <Text style={[s.boxValue, s.resultText]}>{formatNumber(snapshot.estimate)}</Text>
          <Text style={[s.boxLabel, s.resultText, s.resultLabel]}>what you burn</Text>
        </View>
      </View>

      <Text style={s.p}>
        Stride compares what you ate with how your trend weight moved over the last{' '}
        <Text style={s.strong}>{snapshot.windowDays} days</Text>. A kilo of body weight is about{' '}
        {formatNumber(KCAL_PER_KG)} kcal, so the gap between the two is what your body burned.
      </Text>
      {weeklyRateKg !== null ? (
        <Text style={s.p}>
          Your trend is at <Text style={s.strong}>{snapshot.trendKg.toFixed(1)} kg</Text>, moving{' '}
          <Text style={s.strong}>{formatRate(weeklyRateKg)}</Text>.
        </Text>
      ) : null}
      {target ? (
        <Text style={s.p}>
          Your daily target is <Text style={s.strong}>{formatNumber(target.kcal)}</Text>
          {target.source === 'adaptive'
            ? ', set from this burn and your goal.'
            : '. It still comes from the formula and switches to your real burn at the next weekly update.'}
        </Text>
      ) : null}
      <Text style={s.faint}>
        Missed days are skipped, not guessed. Your burn is recalculated every morning. Targets change once a week so they
        don't wobble.
      </Text>
      <Button label="Got it" size="block" onPress={onClose} style={s.ok} />
    </View>
  )
}

// Opens the milestone sheet once per user on this device, the first time a burn snapshot exists.
export function useBurnMilestone(ready: boolean) {
  const { user } = useUser()
  const { openBurn, sheetOpen } = useLog()
  const checked = useRef(false)
  const userId = user?.id

  useEffect(() => {
    if (!ready || !userId || sheetOpen || checked.current) return
    checked.current = true
    const key = `burn_ready_seen_${userId}`
    SecureStore.getItemAsync(key)
      .then(async (seen) => {
        if (seen) return
        await SecureStore.setItemAsync(key, '1')
        openBurn(true)
      })
      // If the store fails the milestone is skipped; the burn card still shows the number.
      .catch(() => undefined)
  }, [ready, userId, sheetOpen, openBurn])
}

const useStyles = themedStyles((t) => ({
  polo: { alignItems: 'center', paddingTop: 8 },
  center: { textAlign: 'center' },
  eyebrow: { ...font('eyebrow'), color: t.c.ink3, marginTop: 10 },
  title: { ...font('screenTitle'), fontSize: 26, lineHeight: 28, color: t.c.ink, marginTop: 6 },
  boxes: { flexDirection: 'row', gap: 8, marginTop: 20 },
  box: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 16,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  boxResult: { backgroundColor: t.c.ink },
  boxValue: { ...font('cardTitle'), color: t.c.ink, fontVariant: ['tabular-nums'] },
  boxLabel: { ...font('caption'), fontSize: 11.5, lineHeight: 14, color: t.c.ink3, marginTop: 3, textAlign: 'center' },
  resultText: { color: t.c.bg },
  resultLabel: { opacity: 0.65 },
  p: { ...font('body'), fontSize: 14.5, lineHeight: 22, color: t.c.ink2, marginTop: 14 },
  strong: { fontFamily: font('bodyStrong').fontFamily, color: t.c.ink },
  faint: { ...font('caption'), fontSize: 13, lineHeight: 19, color: t.c.ink3, marginTop: 14 },
  ok: { marginTop: 20 },
}))
