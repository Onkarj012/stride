import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { useQuery } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { radii } from '@stride/ui-tokens'
import { dateOf, daysIn, shiftMonth, weekdayOf, type Month } from '@stride/core'
import { Button, RoundButton, Thinking } from '@/components/Controls'
import { useLog } from '@/components/LogProvider'
import { MealRow, groupMeals } from '@/components/Meals'
import { Polo } from '@/components/Polo'
import { Screen, ScreenTitle } from '@/components/Screen'
import { Tap } from '@/components/Tap'
import { MONTHS_LONG, formatDayTitle, formatNumber } from '@/lib/format'
import { DEFAULT_TARGETS } from '@/lib/log'
import { useLocalToday } from '@/lib/useLocalToday'
import { font, themedStyles, useTheme } from '@/theme'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const RING = 2 * Math.PI * 10

// Log tab (mock #/week): a month of day rings, then the chosen day's meals and totals.
export default function LogScreen() {
  const today = useLocalToday()
  return <History today={today} />
}

// Calendar and day detail once today's date (in the user's zone) is known.
function History({ today }: { today: string }) {
  const t = useTheme()
  const s = useStyles()
  const [y, m] = today.split('-').map(Number)
  const current: Month = { year: y ?? 1970, month: m ?? 1 }
  const [month, setMonth] = useState<Month>(current)
  const [selected, setSelected] = useState(today)
  const selectedDate = useRef(selected)
  selectedDate.current = selected
  const previousToday = useRef(today)
  useEffect(() => {
    const previous = previousToday.current
    previousToday.current = today
    if (previous === today) return
    if (selectedDate.current !== previous) return
    setSelected((date) => date === previous ? today : date)
    const [year, monthNumber] = today.split('-').map(Number)
    if (year !== undefined && monthNumber !== undefined) {
      setMonth((shown) => dateOf(shown, 1) === `${previous.slice(0, 7)}-01` ? { year, month: monthNumber } : shown)
    }
  }, [today])
  const total = daysIn(month)
  const from = dateOf(month, 1)
  const to = dateOf(month, total)
  const days = useQuery(api.day_totals.dayTotalsInRange, { from, to })
  const isCurrent = month.year === current.year && month.month === current.month
  const daysSoFar = isCurrent ? Number(today.slice(8)) : total
  const logged = new Map((days ?? []).map((d) => [d.localDate, d]))
  const lead = (weekdayOf(from) + 6) % 7 // Monday-first grid

  return (
    <Screen>
      <ScreenTitle
        eyebrow="Log"
        title={MONTHS_LONG[month.month - 1] ?? ''}
        aside={
          <View style={s.nav}>
            <RoundButton icon="back" label="Previous month" size={34} onPress={() => setMonth((mo) => shiftMonth(mo, -1))} />
            <RoundButton
              icon="chevron"
              label="Next month"
              size={34}
              disabled={isCurrent}
              onPress={() => setMonth((mo) => shiftMonth(mo, 1))}
            />
          </View>
        }
      />
      <Text style={s.count}>
        {days === undefined ? ' ' : `${logged.size} of ${daysSoFar} days logged${month.year !== current.year ? ` · ${month.year}` : ''}`}
      </Text>

      <View style={s.grid}>
        {WEEKDAYS.map((d, i) => (
          <Text key={`wd${i}`} style={s.wd}>
            {d}
          </Text>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <View key={`lead${i}`} style={s.cell} />
        ))}
        {Array.from({ length: total }, (_, i) => {
          const date = dateOf(month, i + 1)
          const day = logged.get(date)
          const future = date > today
          const on = date === selected
          const frac = day ? Math.min(1, day.nutrients.kcal / DEFAULT_TARGETS.kcal) : 0
          return (
            <View key={date} style={s.cell}>
            <Tap
              style={[s.day, on && s.dayOn, future && s.future]}
              scale={0.9}
              disabled={future}
              onPress={() => setSelected(date)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${formatDayTitle(date)}${day ? `, ${formatNumber(day.nutrients.kcal)} kcal` : ', not logged'}`}
            >
              <Svg width={24} height={24} viewBox="0 0 24 24" style={s.ring}>
                <Circle cx={12} cy={12} r={10} fill="none" strokeWidth={3} stroke={on ? t.c.calendarSelectedRing : t.c.card2} />
                {day ? (
                  <Circle
                    cx={12}
                    cy={12}
                    r={10}
                    fill="none"
                    strokeWidth={3}
                    strokeLinecap="round"
                    stroke={on ? t.c.polo : t.c.ink}
                    strokeDasharray={`${RING * frac} ${RING}`}
                  />
                ) : null}
              </Svg>
              <Text style={[s.dayNum, on && { color: t.c.bg }]}>{i + 1}</Text>
            </Tap>
            </View>
          )
        })}
      </View>

      <DayDetail date={selected} today={today} />
    </Screen>
  )
}

// One day's totals and meals; tapping a meal opens the same edit sheet as Today.
function DayDetail({ date, today }: { date: string; today: string }) {
  const s = useStyles()
  const { compose, openMeal } = useLog()
  const totals = useQuery(api.day_totals.dayTotals, { localDate: date })
  const entries = useQuery(api.entries.entriesForDay, { localDate: date })
  const isToday = date === today

  if (totals === undefined || entries === undefined) return <Thinking label="Opening that day…" />
  const meals = groupMeals(entries)

  if (meals.length === 0)
    return (
      <View style={[s.card, s.emptyCard]}>
        <Polo size={48} hop={1} />
        <Text style={s.eyebrowCenter}>{isToday ? 'Today' : formatDayTitle(date)}</Text>
        <Text style={s.emptyBody}>
          {isToday
            ? 'Nothing yet today.'
            : "Not logged. That's okay. Gaps don't break anything, your burn estimate just skips this day."}
        </Text>
        {isToday ? <Button label="Log something" size="sm" variant="ghost" onPress={() => compose('text')} style={s.emptyButton} /> : null}
      </View>
    )

  return (
    <View style={s.detail}>
      <View style={s.detailHead}>
        <Text style={s.detailTitle}>{isToday ? 'Today' : formatDayTitle(date)}</Text>
        <Text style={s.detailTotal}>
          {formatNumber(totals.nutrients.kcal)} kcal · {Math.round(totals.nutrients.protein)} g P
        </Text>
      </View>
      <View style={[s.card, s.mealsCard]}>
        {meals.map((meal, i) => (
          <MealRow key={meal.slot} meal={meal} first={i === 0} onPress={() => openMeal(date, meal.slot)} />
        ))}
      </View>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  nav: { flexDirection: 'row', gap: 6 },
  count: { ...font('link'), color: t.c.ink3, marginTop: 8, marginHorizontal: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, rowGap: 6 },
  wd: { ...font('label'), fontSize: 11, fontFamily: font('calloutStrong').fontFamily, color: t.c.ink3, width: `${100 / 7}%`, textAlign: 'center', paddingBottom: 4 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  day: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radii.sm },
  dayOn: { backgroundColor: t.c.ink },
  future: { opacity: 0.35 },
  ring: { transform: [{ rotate: '-90deg' }] },
  dayNum: { ...font('label'), fontSize: 11.5, lineHeight: 14, color: t.c.ink },
  card: { backgroundColor: t.c.card, borderRadius: radii.card, boxShadow: t.shadow.card },
  emptyCard: { marginTop: 18, alignItems: 'center', padding: 26 },
  eyebrowCenter: { ...font('eyebrow'), color: t.c.ink3, marginTop: 12 },
  emptyBody: { ...font('callout'), color: t.c.ink2, textAlign: 'center', marginTop: 8 },
  emptyButton: { marginTop: 14 },
  detail: { marginTop: 18 },
  detailHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6, marginBottom: 12, marginHorizontal: 2 },
  detailTitle: { ...font('section'), color: t.c.ink },
  detailTotal: { ...font('value'), fontSize: 15, color: t.c.ink },
  mealsCard: { paddingVertical: 4, paddingHorizontal: 14 },
}))
