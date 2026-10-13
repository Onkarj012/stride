import { useState, type ReactNode } from 'react'
import { Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useUser } from '@clerk/expo'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { KCAL_FLOOR } from '@stride/core'
import { api } from 'stride-backend/convex/_generated/api'
import { motion, radii } from '@stride/ui-tokens'
import { Avatar } from '@/components/AccountSheet'
import { Button, RoundButton } from '@/components/Controls'
import {
  ActivityInput,
  ACTIVITY_OPTIONS,
  DIET_OPTIONS,
  DietInput,
  DobInput,
  GOAL_OPTIONS,
  GoalInput,
  HeightInput,
  PACES,
  SEX_OPTIONS,
  SexInput,
  TargetPaceInput,
  TrainingDaysInput,
  WeightInput,
} from '@/components/ProfileInputs'
import { Polo } from '@/components/Polo'
import { Placeholder, Screen, ScreenTitle, Section } from '@/components/Screen'
import { Sheet } from '@/components/Sheet'
import { Tap } from '@/components/Tap'
import { TimeZoneGate } from '@/components/TimeZoneGate'
import { MONTHS_LONG, formatNumber } from '@/lib/format'
import { SUMMARY_DAYS, plainError, targetsFor } from '@/lib/log'
import {
  dateParts,
  deviceUnits,
  heightLabel,
  kgLabel,
  splitName,
  startTargetKg,
  type Activity,
  type DietType,
  type Goal,
  type Pace,
  type Sex,
  type Units,
} from '@/lib/profile'
import { useLocalToday } from '@/lib/useLocalToday'
import { font, themedStyles } from '@/theme'

type Saved = NonNullable<FunctionReturnType<typeof api.progress_v2.profile>>
type UpdateArgs = FunctionArgs<typeof api.progress_v2.updateProfile>
type EditableField = 'name' | 'goal' | 'sex' | 'dob' | 'height' | 'weight' | 'activity' | 'diet' | 'target' | 'training'

// Working copy that every sheet edits. A sheet saves only its own fields.
type Draft = {
  name: string
  goal: Goal
  sex: Sex
  dob: string
  heightCm: number
  weightKg: number
  activity: Activity
  dietType: DietType
  targetWeightKg: number
  pace: Pace
  trainingDays: number
}

const FIELD_TITLE: Record<EditableField, string> = {
  name: 'Your name',
  goal: 'Goal',
  sex: 'Sex',
  dob: 'Date of birth',
  height: 'Height',
  weight: 'Weight',
  activity: 'Activity',
  diet: 'Diet',
  target: 'Target weight',
  training: 'Training days',
}

// Profile route. Waits for the time zone to be stored before reading the profile.
export default function ProfileScreen() {
  return (
    <TimeZoneGate>
      <Profile />
    </TimeZoneGate>
  )
}

// Clerk photo and name, the answers from onboarding, and the daily targets they produce. Tap a row to change it.
function Profile() {
  const s = useStyles()
  const { user } = useUser()
  const profile = useQuery(api.progress_v2.profile, {})
  const today = useLocalToday()
  const summary = useQuery(api.progress_v2.summary, { rangeDays: SUMMARY_DAYS, localDate: today })
  const [field, setField] = useState<EditableField | null>(null)
  const [open, setOpen] = useState(false)

  const header = (
    <>
      <RoundButton icon="back" label="Back" onPress={() => router.back()} />
      <ScreenTitle eyebrow="You" title="Profile" />
    </>
  )

  if (profile === undefined)
    return (
      <Screen>
        {header}
        <View style={s.loading}>
          <Polo size={56} />
        </View>
      </Screen>
    )

  if (profile === null)
    return (
      <Screen>
        {header}
        <Placeholder title="No profile yet." body="Finish setup to see your details here." />
      </Screen>
    )

  const units = unitsOf(profile)
  const goal = profile.goal ?? 'maintain'
  const targets = targetsFor(summary?.target?.kcal ?? null)
  const source = summary?.target?.source === 'adaptive' ? 'Learned from your logs' : 'From your profile'
  const note = clampNote(summary?.target?.clamped, profile.sex ?? 'male')
  const weightValue = profile.latestWeightKg === null ? 'Not set' : kgLabel(profile.latestWeightKg, units)
  const heightValue = profile.heightCm === undefined ? 'Not set' : heightLabel(profile.heightCm, units)
  const targetValue =
    profile.targetWeightKg === undefined ? 'Not set' : `${kgLabel(profile.targetWeightKg, units)} · ${labelOf(PACES, profile.pace)}`
  const days = profile.trainingDaysPerWeek
  const trainingValue = days === undefined ? 'Not set' : days === 1 ? '1 day' : `${days} days`

  // Opens the sheet for one field.
  function edit(next: EditableField) {
    setField(next)
    setOpen(true)
  }

  return (
    <>
      <Screen>
        {header}

        <View style={s.identity}>
          <Avatar size={72} large />
          <Tap onPress={() => edit('name')} accessibilityRole="button" accessibilityLabel="Edit name">
            <Text style={s.name}>{user?.fullName || 'Add your name'}</Text>
            <Text style={s.hint}>Tap to edit</Text>
          </Tap>
        </View>

        <Section title="Your numbers" />
        <View style={s.card}>
          <Row label="Goal" value={labelOf(GOAL_OPTIONS, profile.goal)} onPress={() => edit('goal')} />
          <Row label="Sex" value={labelOf(SEX_OPTIONS, profile.sex)} onPress={() => edit('sex')} />
          <Row label="Date of birth" value={dobLabel(profile.dob)} onPress={() => edit('dob')} />
          <Row label="Height" value={heightValue} onPress={() => edit('height')} />
          <Row label="Weight" value={weightValue} onPress={() => edit('weight')} />
          <Row label="Activity" value={labelOf(ACTIVITY_OPTIONS, profile.activity)} onPress={() => edit('activity')} />
          <Row label="Diet" value={labelOf(DIET_OPTIONS, profile.dietType)} onPress={() => edit('diet')} />
          {goal === 'maintain' ? null : <Row label="Target and pace" value={targetValue} onPress={() => edit('target')} />}
          <Row label="Training" value={trainingValue} onPress={() => edit('training')} />
        </View>

        <Section title="Daily targets" />
        <View style={s.card}>
          <Row label="Calories" value={`${formatNumber(targets.kcal)} kcal`} />
          <Row label="Protein" value={`${targets.proteinG} g`} />
          <Row label="Carbs" value={`${targets.carbsG} g`} />
          <Row label="Fat" value={`${targets.fatG} g`} />
        </View>
        <Text style={s.caption}>{source}</Text>
        {note ? <Text style={s.caption}>{note}</Text> : null}
      </Screen>

      <Sheet open={open} onClose={() => setOpen(false)} onClosed={() => setField(null)}>
        {field ? <FieldForm key={field} field={field} saved={profile} units={units} onDone={() => setOpen(false)} /> : null}
      </Sheet>
    </>
  )
}

// One list row: label on the left, current value on the right. Tappable only when it has an onPress.
function Row({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const s = useStyles()
  return (
    <Tap
      onPress={onPress}
      disabled={!onPress}
      scale={motion.press.rowScale}
      style={s.row}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
    >
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </Tap>
  )
}

// Editor for one field, shown in the sheet. Saves only that field, then closes the sheet.
function FieldForm({ field, saved, units, onDone }: { field: EditableField; saved: Saved; units: Units; onDone: () => void }) {
  const s = useStyles()
  const { user } = useUser()
  const updateProfile = useMutation(api.progress_v2.updateProfile)
  const logWeight = useMutation(api.weights.logWeight)
  const [draft, setDraft] = useState(() => draftFrom(saved, user?.fullName ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const patch = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }))

  // Saves this field. Weight is a weigh-in, then an empty update so the target re-freezes.
  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (field === 'name') {
        await user?.update(splitName(draft.name))
      } else if (field === 'weight') {
        await logWeight({ kg: draft.weightKg })
        await updateProfile({})
      } else {
        await updateProfile(patchFor(field, draft))
      }
      onDone()
    } catch (err) {
      setError(plainError(err))
    } finally {
      setBusy(false)
    }
  }

  // Target weight and pace, kept on the goal's side of today's weight.
  const target = (
    <TargetPaceInput
      value={{ targetWeightKg: draft.targetWeightKg, pace: draft.pace }}
      onChange={patch}
      goal={targetSide(draft.goal)}
      weightKg={draft.weightKg}
      units={units}
    />
  )

  // The input for this field, bound to the draft.
  function input(): ReactNode {
    switch (field) {
      case 'name':
        return (
          <TextInput
            value={draft.name}
            onChangeText={(name) => patch({ name })}
            onSubmitEditing={() => void save()}
            placeholder="First and last name"
            autoCapitalize="words"
            autoFocus
            returnKeyType="done"
            style={s.nameInput}
            accessibilityLabel="Name"
          />
        )
      case 'goal':
        return (
          <>
            <GoalInput
              value={draft.goal}
              onChange={(goal) =>
                patch({
                  goal,
                  targetWeightKg: goal === 'maintain' ? draft.targetWeightKg : startTargetKg(goal, saved.targetWeightKg, draft.weightKg),
                })
              }
            />
            {draft.goal === 'maintain' ? null : target}
          </>
        )
      case 'sex':
        return <SexInput value={draft.sex} onChange={(sex) => patch({ sex })} />
      case 'dob':
        return <DobInput value={draft.dob} onChange={(dob) => patch({ dob })} />
      case 'height':
        return <HeightInput value={draft.heightCm} units={units} onChange={(heightCm) => patch({ heightCm })} />
      case 'weight':
        return <WeightInput value={draft.weightKg} units={units} onChange={(weightKg) => patch({ weightKg })} />
      case 'activity':
        return <ActivityInput value={draft.activity} onChange={(activity) => patch({ activity })} />
      case 'diet':
        return <DietInput value={draft.dietType} onChange={(dietType) => patch({ dietType })} />
      case 'target':
        return target
      case 'training':
        return <TrainingDaysInput value={draft.trainingDays} onChange={(trainingDays) => patch({ trainingDays })} />
    }
  }

  return (
    <View>
      <Text style={s.sheetTitle}>{FIELD_TITLE[field]}</Text>
      {input()}
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Button
        label="Save"
        size="block"
        busy={busy}
        disabled={field === 'name' && draft.name.trim() === ''}
        onPress={() => void save()}
        style={s.save}
      />
    </View>
  )
}

// Saved units, or the device's units when none are saved.
function unitsOf(saved: Saved): Units {
  if (saved.units === 'imperial' || saved.units === 'metric') return saved.units
  return deviceUnits()
}

// The side of today's weight a target sits on. Maintain has no target, so it reads as lose.
function targetSide(goal: Goal): 'lose' | 'gain' {
  return goal === 'gain' ? 'gain' : 'lose'
}

// Starting answers for the sheets, read from the saved profile.
function draftFrom(saved: Saved, name: string): Draft {
  const goal = saved.goal ?? 'maintain'
  const weightKg = saved.latestWeightKg ?? 70
  return {
    name,
    goal,
    sex: saved.sex ?? 'male',
    dob: saved.dob ?? '1995-01-01',
    heightCm: saved.heightCm ?? 170,
    weightKg,
    activity: saved.activity ?? 'moderate',
    dietType: saved.dietType ?? 'veg',
    targetWeightKg: startTargetKg(targetSide(goal), saved.targetWeightKg, weightKg),
    pace: saved.pace ?? 'steady',
    trainingDays: saved.trainingDaysPerWeek ?? 3,
  }
}

// The update one sheet sends. Goal sends its target and pace together, since the server checks them against each other.
function patchFor(field: Exclude<EditableField, 'name' | 'weight'>, d: Draft): UpdateArgs {
  switch (field) {
    case 'goal':
      return d.goal === 'maintain' ? { goal: 'maintain' } : { goal: d.goal, targetWeightKg: d.targetWeightKg, pace: d.pace }
    case 'sex':
      return { sex: d.sex }
    case 'dob':
      return { dob: d.dob }
    case 'height':
      return { heightCm: d.heightCm }
    case 'activity':
      return { activity: d.activity }
    case 'diet':
      return { dietType: d.dietType }
    case 'target':
      return { targetWeightKg: d.targetWeightKg, pace: d.pace }
    case 'training':
      return { trainingDaysPerWeek: d.trainingDays }
  }
}

// The label of the chosen option, or "Not set" when nothing is saved.
function labelOf<T extends string>(options: { value: T; label: string }[], value: T | undefined): string {
  return options.find((o) => o.value === value)?.label ?? 'Not set'
}

// Date of birth as "14 March 1995".
function dobLabel(dob: string | undefined): string {
  if (dob === undefined) return 'Not set'
  const { year, month, day } = dateParts(dob)
  return `${day} ${MONTHS_LONG[month - 1] ?? ''} ${year}`
}

// Why the target moved off the formula, or null when it did not.
function clampNote(clamped: 'pace_cap' | 'floor' | undefined, sex: Sex): string | null {
  if (clamped === 'pace_cap') return 'Capped at 1% of your weight a week to keep it safe.'
  if (clamped === 'floor') return `Raised to the ${KCAL_FLOOR[sex]} kcal minimum.`
  return null
}

const useStyles = themedStyles((t) => ({
  loading: { alignItems: 'center', marginTop: 80 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 22 },
  name: { ...font('cardTitle'), color: t.c.ink },
  hint: { ...font('caption'), color: t.c.ink3, marginTop: 2 },
  card: { backgroundColor: t.c.card, borderRadius: radii.card, boxShadow: t.shadow.card, paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: t.c.line,
  },
  rowLabel: { ...font('callout'), color: t.c.ink2 },
  rowValue: { ...font('callout'), color: t.c.ink, flexShrink: 1, textAlign: 'right' },
  caption: { ...font('caption'), color: t.c.ink3, marginTop: 10, marginHorizontal: 2 },
  sheetTitle: { ...font('cardTitle'), color: t.c.ink, marginBottom: 14 },
  nameInput: {
    ...font('input'),
    color: t.c.ink,
    height: 52,
    paddingHorizontal: 16,
    borderRadius: radii.card,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  save: { marginTop: 18 },
  error: { ...font('callout'), color: t.c.poloInk, marginTop: 14 },
}))
