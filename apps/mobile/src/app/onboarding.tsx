import { useContext, useEffect, useState, type ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMutation, useQuery } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { layout, motion, radii } from '@stride/ui-tokens'
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
import { plainError, targetsFor } from '@/lib/log'
import {
  HoldOnboardingContext,
  clamp,
  clampNote,
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
  dietTypes: DietType[]
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
  dietTypes: [],
  targetWeightKg: null,
  pace: 'steady',
  trainingDays: 3,
}

// Starting target five kg from today's weight, in the direction of the goal.
function defaultTargetKg(goal: 'lose' | 'gain', weightKg: number): number {
  return clamp(Math.round((weightKg + (goal === 'lose' ? -5 : 5)) * 10) / 10, 30, 300)
}

// Whether a target is below the weight to lose, or above it to gain.
function targetOnSide(goal: 'lose' | 'gain', targetKg: number, weightKg: number): boolean {
  return goal === 'lose' ? targetKg < weightKg : targetKg > weightKg
}

// Keeps the target while it is still on the goal's side of the weight. Null means the default applies.
function keepTarget(goal: Goal | null, targetKg: number | null, weightKg: number): number | null {
  if (goal !== 'lose' && goal !== 'gain') return targetKg
  return targetKg !== null && !targetOnSide(goal, targetKg, weightKg) ? null : targetKg
}

// Whether the question for this step has an answer yet.
function answered(step: StepId, form: Form): boolean {
  if (step === 'goal') return form.goal !== null
  if (step === 'sex') return form.sex !== null
  if (step === 'activity') return form.activity !== null
  if (step === 'diet') return form.dietTypes.length > 0
  if (step === 'target') {
    if (form.goal === null || form.goal === 'maintain') return true
    return targetOnSide(form.goal, form.targetWeightKg ?? defaultTargetKg(form.goal, form.weightKg), form.weightKg)
  }
  return true
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
  const keyboard = useAnimatedKeyboard()
  const holdOnboarding = useContext(HoldOnboardingContext)
  const logWeight = useMutation(api.weights.logWeight)
  const saveProfile = useMutation(api.progress_v2.saveProfile)
  const units = deviceUnits()
  const [form, setForm] = useState<Form>(START)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dobValid, setDobValid] = useState(true)

  const steps: readonly StepId[] = form.goal === 'maintain' ? STEPS.filter((id) => id !== 'target') : STEPS
  const current: StepId = steps[index] ?? 'goal'
  const patch = (next: Partial<Form>) => setForm((f) => ({ ...f, ...next }))

  // Logs the weigh-in, saves the profile, then moves to the reveal. The hold keeps this screen mounted once the profile is complete.
  async function finish() {
    const { goal, sex, activity, dietTypes } = form
    if (goal === null || sex === null || activity === null || dietTypes.length === 0) return
    setBusy(true)
    setError(null)
    holdOnboarding(true)
    try {
      await logWeight({ kg: form.weightKg })
      await saveProfile({
        goal,
        sex,
        activity,
        dietTypes,
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

  // Moves to the next step. Leaving the weight step drops a target that is no longer on the goal's side.
  function advance() {
    if (current === 'weight') patch({ targetWeightKg: keepTarget(form.goal, form.targetWeightKg, form.weightKg) })
    setIndex(index + 1)
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
            <DobInput value={form.dob} onChange={(dob) => patch({ dob })} onValidChange={setDobValid} />
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
            <WeightInput
              value={form.weightKg}
              units={units}
              onChange={(weightKg) => patch({ weightKg })}
            />
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
            <DietInput value={form.dietTypes} onChange={(dietTypes) => patch({ dietTypes })} />
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
  const questions = steps.length - 1
  // Lifts the screen above the keyboard so the focused field and Next stay in view.
  const lift = useAnimatedStyle(() => ({ paddingBottom: Math.max(insets.bottom + 16, keyboard.height.value) }))

  return (
    <Animated.View style={[s.root, { paddingTop: insets.top + layout.screenTop }, lift]}>
      <View style={s.top}>
        <Progress fraction={fraction} />
        <View style={s.backSlot}>
          {index > 0 && current !== 'reveal' ? (
            <Button label="Back" variant="ghost" size="sm" disabled={busy} onPress={() => setIndex(index - 1)} />
          ) : null}
        </View>
      </View>
      <ScrollView
        style={s.body}
        contentContainerStyle={s.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View key={current} entering={FadeIn.duration(motion.duration.press)}>
          {current === 'reveal' ? null : <Text style={s.stepCount}>{`Step ${index + 1} of ${questions}`}</Text>}
          {renderStep()}
        </Animated.View>
      </ScrollView>
      <View style={s.footer}>
        {error ? <Text style={s.error}>{error}</Text> : null}
        {current === 'reveal' ? (
          <Button label="Start" variant="coral" size="block" onPress={start} />
        ) : (
          <Button
            label={isLast ? 'Finish' : 'Next'}
            size="block"
            busy={busy}
            disabled={!answered(current, form) || (current === 'dob' && !dobValid)}
            onPress={isLast ? () => void finish() : advance}
          />
        )}
      </View>
    </Animated.View>
  )
}

// Thin bar that springs forward as the steps advance.
function Progress({ fraction }: { fraction: number }) {
  const s = useStyles()
  const width = useSharedValue(fraction)
  useEffect(() => {
    width.value = withSpring(fraction, motion.spring.smooth)
  }, [fraction, width])
  const fill = useAnimatedStyle(() => ({ width: `${Math.min(1, width.value) * 100}%` }))
  return (
    <View
      style={s.track}
      accessibilityRole="progressbar"
      accessibilityLabel="Setup progress"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
    >
      <Animated.View style={[s.fill, fill]} />
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
  const t = useTheme()
  const today = useLocalToday()
  const target = useQuery(api.progress_v2.target, { localDate: today })
  if (target === undefined)
    return (
      <View style={s.loading}>
        <Polo size={56} />
        <Text style={s.loadingText}>Working out your numbers…</Text>
      </View>
    )
  const targets = targetsFor(target?.kcal ?? null)
  const note = clampNote(target?.clamped, sex)
  return (
    <View style={s.reveal}>
      <Polo size={88} mood="happy" hop={1} />
      <Text style={s.revealTitle}>You&apos;re set.</Text>
      <Text style={s.revealEyebrow}>Your daily target</Text>
      <Animated.View entering={FadeInDown.springify()} style={s.kcalRow}>
        <Text style={s.kcal} numberOfLines={1} adjustsFontSizeToFit>
          {formatNumber(targets.kcal)}
        </Text>
        <Text style={s.kcalUnit}>kcal</Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(120).springify()} style={s.macros}>
        <Macro label="Protein" grams={targets.proteinG} color={t.c.protein} />
        <View style={s.macroLine} />
        <Macro label="Carbs" grams={targets.carbsG} color={t.c.carbs} />
        <View style={s.macroLine} />
        <Macro label="Fat" grams={targets.fatG} color={t.c.fat} />
      </Animated.View>
      {note ? <Text style={s.note}>{note}</Text> : null}
      <Text style={s.revealLead}>A starting point. It adjusts as Stride learns from your logs.</Text>
    </View>
  )
}

// One macro in the reveal: a color key, its name, and grams.
function Macro({ label, grams, color }: { label: string; grams: number; color: string }) {
  const s = useStyles()
  return (
    <View style={s.macro}>
      <View style={s.macroKey}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={s.macroLabel}>{label}</Text>
      </View>
      <Text style={s.macroValue}>
        {formatNumber(grams)}
        <Text style={s.macroUnit}> g</Text>
      </Text>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.bg, paddingHorizontal: layout.screenX },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 34 },
  backSlot: { minWidth: 72, alignItems: 'flex-end' },
  track: { flex: 1, height: 6, borderRadius: radii.pill, backgroundColor: t.c.card2, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radii.pill, backgroundColor: t.c.polo },
  body: { flex: 1 },
  bodyContent: { flexGrow: 1, justifyContent: 'center', paddingTop: 28, paddingBottom: 16 },
  stepCount: { ...font('eyebrow'), color: t.c.ink3, marginBottom: 8 },
  question: { flex: 1 },
  title: { ...font('screenTitle'), color: t.c.ink },
  lead: { ...font('lead'), color: t.c.ink2, marginTop: 14 },
  answer: { marginTop: 24 },
  footer: { gap: 12, paddingTop: 12 },
  error: { ...font('callout'), color: t.c.poloInk, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { ...font('callout'), color: t.c.ink3 },
  reveal: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 12 },
  revealTitle: { ...font('onboardTitle'), color: t.c.ink, marginTop: 18, textAlign: 'center' },
  revealEyebrow: { ...font('eyebrow'), color: t.c.ink3, marginTop: 22 },
  kcalRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginTop: 10, alignSelf: 'stretch' },
  kcal: { ...font('hero'), color: t.c.ink, flexShrink: 1, fontVariant: ['tabular-nums'] },
  kcalUnit: { ...font('heroUnit'), color: t.c.ink3, marginLeft: 8, marginBottom: 10 },
  macros: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: 26,
    paddingVertical: 16,
    borderRadius: radii.card,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  macro: { flex: 1, alignItems: 'center' },
  macroLine: { width: 1, backgroundColor: t.c.line },
  macroKey: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  macroLabel: { ...font('label'), color: t.c.ink2 },
  macroValue: { ...font('metric'), color: t.c.ink, marginTop: 6, fontVariant: ['tabular-nums'] },
  macroUnit: { ...font('unit'), color: t.c.ink3 },
  note: { ...font('secondary'), color: t.c.ink2, textAlign: 'center', marginTop: 18 },
  revealLead: { ...font('secondary'), color: t.c.ink3, textAlign: 'center', marginTop: 10, maxWidth: 300 },
}))
