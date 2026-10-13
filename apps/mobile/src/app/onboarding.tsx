import { useContext, useState, type ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMutation, useQuery } from 'convex/react'
import { KCAL_FLOOR } from '@stride/core'
import { api } from 'stride-backend/convex/_generated/api'
import { layout, radii } from '@stride/ui-tokens'
import { Button } from '@/components/Controls'
import { Polo } from '@/components/Polo'
import {
  ActivityInput,
  DietInput,
  DobInput,
  GoalInput,
  HeightInput,
  SexInput,
  TargetPaceInput,
  TrainingDaysInput,
  WeightInput,
} from '@/components/ProfileInputs'
import { TimeZoneGate } from '@/components/TimeZoneGate'
import { formatNumber } from '@/lib/format'
import { SUMMARY_DAYS, plainError, targetsFor } from '@/lib/log'
import {
  HoldOnboardingContext,
  clamp,
  deviceUnits,
  type Activity,
  type DietType,
  type Goal,
  type Pace,
  type Sex,
} from '@/lib/profile'
import { useLocalToday } from '@/lib/useLocalToday'
import { font, themedStyles, useTheme } from '@/theme'

type Form = {
  goal: Goal | null
  sex: Sex | null
  dob: string
  heightCm: number
  weightKg: number
  activity: Activity | null
  dietType: DietType | null
  targetWeightKg: number | null
  pace: Pace
  trainingDays: number
}

const STEPS = ['goal', 'sex', 'dob', 'height', 'weight', 'activity', 'diet', 'target', 'training', 'reveal'] as const
type StepId = (typeof STEPS)[number]

// Starting answers. Choice questions start empty, so Next waits for a pick.
const START: Form = {
  goal: null,
  sex: null,
  dob: `${new Date().getFullYear() - 25}-01-01`,
  heightCm: 170,
  weightKg: 70,
  activity: null,
  dietType: null,
  targetWeightKg: null,
  pace: 'steady',
  trainingDays: 3,
}

// Starting target five kg from today's weight, in the direction of the goal.
function defaultTargetKg(goal: 'lose' | 'gain', weightKg: number): number {
  return clamp(Math.round((weightKg + (goal === 'lose' ? -5 : 5)) * 10) / 10, 30, 300)
}

// Whether the question for this step has an answer yet.
function answered(step: StepId, form: Form): boolean {
  if (step === 'goal') return form.goal !== null
  if (step === 'sex') return form.sex !== null
  if (step === 'activity') return form.activity !== null
  if (step === 'diet') return form.dietType !== null
  return true
}

// One line on why the target moved away from the formula, or null when it did not.
function clampNote(clamped: 'pace_cap' | 'floor' | undefined, sex: Sex): string | null {
  if (clamped === 'pace_cap') return 'Capped at 1% of your weight a week to keep it safe.'
  if (clamped === 'floor') return `Raised to the ${KCAL_FLOOR[sex]} kcal minimum.`
  return null
}

// Route wrapper: waits for the time zone to be stored before the onboarding queries and saves run.
export default function OnboardingScreen() {
  return (
    <TimeZoneGate>
      <Onboarding />
    </TimeZoneGate>
  )
}

// Setup questions, one per screen. Saves the weigh-in and profile on the last question, then shows the reveal.
function Onboarding() {
  const s = useStyles()
  const insets = useSafeAreaInsets()
  const holdOnboarding = useContext(HoldOnboardingContext)
  const logWeight = useMutation(api.weights.logWeight)
  const saveProfile = useMutation(api.progress_v2.saveProfile)
  const units = deviceUnits()
  const [form, setForm] = useState<Form>(START)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const steps: readonly StepId[] = form.goal === 'maintain' ? STEPS.filter((id) => id !== 'target') : STEPS
  const current: StepId = steps[index] ?? 'goal'
  const patch = (next: Partial<Form>) => setForm((f) => ({ ...f, ...next }))

  // Logs the weigh-in, saves the profile, then moves to the reveal. The hold keeps this screen mounted once the profile is complete.
  async function finish() {
    const { goal, sex, activity, dietType } = form
    if (goal === null || sex === null || activity === null || dietType === null) return
    setBusy(true)
    setError(null)
    holdOnboarding(true)
    try {
      await logWeight({ kg: form.weightKg })
      await saveProfile({
        goal,
        sex,
        activity,
        dietType,
        heightCm: form.heightCm,
        dob: form.dob,
        trainingDaysPerWeek: form.trainingDays,
        ...(goal === 'maintain'
          ? {}
          : { targetWeightKg: form.targetWeightKg ?? defaultTargetKg(goal, form.weightKg), pace: form.pace }),
      })
      setIndex(index + 1)
    } catch (err: unknown) {
      setError(plainError(err))
    } finally {
      setBusy(false)
    }
  }

  // Leaves onboarding for the tabs. The hold is released after the route change, so the reveal stays up until then.
  function start() {
    router.replace('/(tabs)')
    holdOnboarding(false)
  }

  // The question for the current step.
  function renderStep(): ReactNode {
    switch (current) {
      case 'goal':
        return (
          <Question title="What are you after?" lead="You can change this whenever you like.">
            <GoalInput value={form.goal} onChange={(goal) => patch({ goal, targetWeightKg: null })} />
          </Question>
        )
      case 'sex':
        return (
          <Question title="What's your sex?" lead="Used for the starting formula.">
            <SexInput value={form.sex} onChange={(sex) => patch({ sex })} />
          </Question>
        )
      case 'dob':
        return (
          <Question title="When were you born?">
            <DobInput value={form.dob} onChange={(dob) => patch({ dob })} />
          </Question>
        )
      case 'height':
        return (
          <Question title="How tall are you?">
            <HeightInput value={form.heightCm} units={units} onChange={(heightCm) => patch({ heightCm })} />
          </Question>
        )
      case 'weight':
        return (
          <Question title="What do you weigh?" lead="This is your first weigh-in.">
            <WeightInput value={form.weightKg} units={units} onChange={(weightKg) => patch({ weightKg })} />
          </Question>
        )
      case 'activity':
        return (
          <Question title="How active is a usual week?">
            <ActivityInput value={form.activity} onChange={(activity) => patch({ activity })} />
          </Question>
        )
      case 'diet':
        return (
          <Question title="What do you eat?">
            <DietInput value={form.dietType} onChange={(dietType) => patch({ dietType })} />
          </Question>
        )
      case 'target': {
        if (form.goal === null || form.goal === 'maintain') return null
        const goal = form.goal
        return (
          <Question title="Where do you want to land?" lead="Pick a weight and how fast to get there.">
            <TargetPaceInput
              value={{ targetWeightKg: form.targetWeightKg ?? defaultTargetKg(goal, form.weightKg), pace: form.pace }}
              goal={goal}
              weightKg={form.weightKg}
              units={units}
              onChange={(v) => patch({ targetWeightKg: v.targetWeightKg, pace: v.pace })}
            />
          </Question>
        )
      }
      case 'training':
        return (
          <Question title="How many days do you train?" lead="A rough number is fine.">
            <TrainingDaysInput value={form.trainingDays} onChange={(trainingDays) => patch({ trainingDays })} />
          </Question>
        )
      case 'reveal':
        if (form.sex === null) return null
        return <Reveal sex={form.sex} />
    }
  }

  const fraction = (index + 1) / steps.length
  const isLast = current === 'training'

  return (
    <View style={[s.root, { paddingTop: insets.top + layout.screenTop, paddingBottom: insets.bottom + 16 }]}>
      <View style={s.top}>
        {index > 0 && current !== 'reveal' ? (
          <Button label="Back" variant="ghost" size="sm" icon="back" onPress={() => setIndex(index - 1)} />
        ) : null}
        <View style={s.track}>
          <View style={[s.fill, { width: `${fraction * 100}%` }]} />
        </View>
      </View>
      <ScrollView style={s.body} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false}>
        {renderStep()}
      </ScrollView>
      <View style={s.footer}>
        {error ? <Text style={s.error}>{error}</Text> : null}
        {current === 'reveal' ? (
          <Button label="Start" size="block" onPress={start} />
        ) : (
          <Button
            label={isLast ? 'Finish' : 'Next'}
            size="block"
            busy={busy}
            disabled={!answered(current, form)}
            onPress={isLast ? () => void finish() : () => setIndex(index + 1)}
          />
        )}
      </View>
    </View>
  )
}

// Big question title, an optional lead line, then the answer control.
function Question({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  const s = useStyles()
  return (
    <View style={s.question}>
      <Text style={s.title}>{title}</Text>
      {lead ? <Text style={s.lead}>{lead}</Text> : null}
      <View style={s.answer}>{children}</View>
    </View>
  )
}

// The starting target: the same number Today shows, its macro split, and one line if the target was clamped.
function Reveal({ sex }: { sex: Sex }) {
  const s = useStyles()
  const today = useLocalToday()
  const summary = useQuery(api.progress_v2.summary, { rangeDays: SUMMARY_DAYS, localDate: today })
  if (summary === undefined)
    return (
      <View style={s.loading}>
        <Polo size={56} />
      </View>
    )
  const targets = targetsFor(summary.target?.kcal ?? null)
  const note = clampNote(summary.target?.clamped, sex)
  return (
    <View style={s.reveal}>
      <Polo size={72} mood="happy" />
      <Text style={s.eyebrow}>Your daily target</Text>
      <Text style={s.kcal}>
        {formatNumber(targets.kcal)} <Text style={s.kcalUnit}>kcal</Text>
      </Text>
      <View style={s.macros}>
        <Macro label="Protein" grams={targets.proteinG} />
        <Macro label="Carbs" grams={targets.carbsG} />
        <Macro label="Fat" grams={targets.fatG} />
      </View>
      {note ? <Text style={s.note}>{note}</Text> : null}
    </View>
  )
}

// One macro in the reveal: grams and its name.
function Macro({ label, grams }: { label: string; grams: number }) {
  const s = useStyles()
  return (
    <View style={s.macro}>
      <Text style={s.macroValue}>{formatNumber(grams)} g</Text>
      <Text style={s.macroLabel}>{label}</Text>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.bg, paddingHorizontal: layout.screenX },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 },
  track: { flex: 1, height: 6, borderRadius: radii.pill, backgroundColor: t.c.card2, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radii.pill, backgroundColor: t.c.polo },
  body: { flex: 1 },
  bodyContent: { flexGrow: 1, paddingTop: 28, paddingBottom: 16 },
  question: { flex: 1 },
  title: { ...font('screenTitle'), color: t.c.ink },
  lead: { ...font('lead'), color: t.c.ink2, marginTop: 12 },
  answer: { marginTop: 24 },
  footer: { gap: 12, paddingTop: 12 },
  error: { ...font('callout'), color: t.c.poloInk, textAlign: 'center' },
  loading: { paddingTop: 48, alignItems: 'center' },
  reveal: { alignItems: 'center', marginTop: 16 },
  eyebrow: { ...font('eyebrow'), color: t.c.ink2, marginTop: 18 },
  kcal: { ...font('hero'), color: t.c.ink, marginTop: 8 },
  kcalUnit: { ...font('heroUnit'), color: t.c.ink2 },
  macros: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 24 },
  macro: {
    flex: 1,
    padding: 14,
    borderRadius: radii.card,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  macroValue: { ...font('value'), color: t.c.ink },
  macroLabel: { ...font('label'), color: t.c.ink2, marginTop: 2 },
  note: { ...font('secondary'), color: t.c.ink2, textAlign: 'center', marginTop: 20 },
}))
