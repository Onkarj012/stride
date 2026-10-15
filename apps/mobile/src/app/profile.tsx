import { useState, type ReactNode } from 'react'
import { Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useUser } from '@clerk/expo'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { api } from 'stride-backend/convex/_generated/api'
import { radii } from '@stride/ui-tokens'
import { Avatar } from '@/components/AccountSheet'
import { Button, RoundButton } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { ListCard, ListRow } from '@/components/ListRow'
import {
  ActivityInput,
  ACTIVITY_OPTIONS,
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
import { plainError, targetsFor } from '@/lib/log'
import {
  clampNote,
  dateParts,
  daysLabel,
  dietsLabel,
  heightLabel,
  kgLabel,
  savedUnits,
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
import { font, themedStyles, useTheme } from '@/theme'

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
  dietTypes: DietType[]
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
  const t = useTheme()
  const { user } = useUser()
  const profile = useQuery(api.progress_v2.profile, {})
  const today = useLocalToday()
  const dailyTarget = useQuery(api.progress_v2.target, { localDate: today })
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
          <Text style={s.loadingText}>Getting your profile…</Text>
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

  const units = savedUnits(profile.units)
  const goal = profile.goal ?? 'maintain'
  const targets = targetsFor(dailyTarget?.kcal ?? null)
  const source = dailyTarget?.source === 'adaptive' ? 'Learned from your logs' : 'Set from your profile'
  // Shows an ellipsis in place of a target value until today's targets load.
  const shown = (value: string) => (dailyTarget === undefined ? '…' : value)
  const note = clampNote(dailyTarget?.clamped, profile.sex ?? 'male')
  const weightValue = profile.latestWeightKg === null ? 'Not set' : kgLabel(profile.latestWeightKg, units)
  const heightValue = profile.heightCm === undefined ? 'Not set' : heightLabel(profile.heightCm, units)
  const targetValue =
    profile.targetWeightKg === undefined ? 'Not set' : `${kgLabel(profile.targetWeightKg, units)} · ${labelOf(PACES, profile.pace)}`
  const days = profile.trainingDaysPerWeek
  const trainingValue = days === undefined ? 'Not set' : daysLabel(days)

  // Opens the sheet for one field.
  function edit(next: EditableField) {
    setField(next)
    setOpen(true)
  }

  return (
    <>
      <Screen>
        {header}

        <Tap
          onPress={() => edit('name')}
          scale={0.98}
          style={s.identity}
          accessibilityRole="button"
          accessibilityLabel={user?.fullName ? `Name, ${user.fullName}. Edit` : 'Add your name'}
        >
          <Avatar size={64} large />
          <View style={s.identityText}>
            <Text style={s.name} numberOfLines={1}>
              {user?.fullName || 'Add your name'}
            </Text>
            <Text style={s.hint}>Tap to edit</Text>
          </View>
          <Icon name="chevron" size={18} color={t.c.ink3} />
        </Tap>

        <Section title="Daily targets" />
        <ListCard>
          <ListRow label="Calories" detail={shown(source)} value={shown(`${formatNumber(targets.kcal)} kcal`)} strong />
          <ListRow label="Protein" value={shown(`${formatNumber(targets.proteinG)} g`)} strong />
          <ListRow label="Carbs" value={shown(`${formatNumber(targets.carbsG)} g`)} strong />
          <ListRow label="Fat" value={shown(`${formatNumber(targets.fatG)} g`)} strong last />
        </ListCard>
        {note ? <Text style={s.caption}>{note}</Text> : null}

        <Section title="Your answers" />
        <ListCard>
          <ListRow label="Goal" value={labelOf(GOAL_OPTIONS, profile.goal)} onPress={() => edit('goal')} />
          {goal === 'maintain' ? null : <ListRow label="Target and pace" value={targetValue} onPress={() => edit('target')} />}
          <ListRow label="Weight" value={weightValue} onPress={() => edit('weight')} />
          <ListRow label="Height" value={heightValue} onPress={() => edit('height')} />
          <ListRow label="Date of birth" value={dobLabel(profile.dob)} onPress={() => edit('dob')} />
          <ListRow label="Sex" value={labelOf(SEX_OPTIONS, profile.sex)} onPress={() => edit('sex')} />
          <ListRow label="Activity" value={labelOf(ACTIVITY_OPTIONS, profile.activity)} onPress={() => edit('activity')} />
          <ListRow label="Diet" value={dietsLabel(profile.dietTypes)} onPress={() => edit('diet')} />
          <ListRow label="Training" value={trainingValue} onPress={() => edit('training')} last />
        </ListCard>
        <Text style={s.caption}>Changes update your daily targets.</Text>
      </Screen>

      <Sheet open={open} onClose={() => setOpen(false)} onClosed={() => setField(null)}>
        {field ? <FieldForm key={field} field={field} saved={profile} units={units} onDone={() => setOpen(false)} /> : null}
      </Sheet>
    </>
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
  const [dobValid, setDobValid] = useState(true)
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
        return <DobInput value={draft.dob} onChange={(dob) => patch({ dob })} onValidChange={setDobValid} />
      case 'height':
        return <HeightInput value={draft.heightCm} units={units} onChange={(heightCm) => patch({ heightCm })} />
      case 'weight':
        return <WeightInput value={draft.weightKg} units={units} onChange={(weightKg) => patch({ weightKg })} />
      case 'activity':
        return <ActivityInput value={draft.activity} onChange={(activity) => patch({ activity })} />
      case 'diet':
        return <DietInput value={draft.dietTypes} onChange={(dietTypes) => patch({ dietTypes })} />
      case 'target':
        return target
      case 'training':
        return <TrainingDaysInput value={draft.trainingDays} onChange={(trainingDays) => patch({ trainingDays })} />
    }
  }

  return (
    <View>
      <Text style={s.sheetEyebrow}>Profile</Text>
      <Text style={s.sheetTitle}>{FIELD_TITLE[field]}</Text>
      {input()}
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Button
        label="Save"
        size="block"
        busy={busy}
        disabled={(field === 'name' && draft.name.trim() === '') || (field === 'dob' && !dobValid)}
        onPress={() => void save()}
        style={s.save}
      />
    </View>
  )
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
    dietTypes: saved.dietTypes.length > 0 ? saved.dietTypes : ['veg'],
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
      return { dietTypes: d.dietTypes }
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

const useStyles = themedStyles((t) => ({
  loading: { alignItems: 'center', marginTop: 80, gap: 12 },
  loadingText: { ...font('callout'), color: t.c.ink3 },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 22,
    padding: 14,
    borderRadius: radii.card,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  identityText: { flex: 1, minWidth: 0 },
  name: { ...font('cardTitle'), color: t.c.ink },
  hint: { ...font('caption'), color: t.c.ink3, marginTop: 2 },
  caption: { ...font('caption'), color: t.c.ink3, marginTop: 10, marginHorizontal: 2 },
  sheetEyebrow: { ...font('eyebrow'), color: t.c.ink3 },
  sheetTitle: { ...font('cardTitle'), color: t.c.ink, marginTop: 4, marginBottom: 16 },
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

export { RouteError as ErrorBoundary } from '@/components/RouteError'
