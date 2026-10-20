import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { Keyboard, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native'
import { PACE_KG_PER_WEEK } from '@stride/core'
import { motion, radii } from '@stride/ui-tokens'
import { useLocalToday } from '@/lib/useLocalToday'
import {
  DIET_LABELS,
  HEIGHT_CM,
  WEIGHT_KG,
  clamp,
  dateParts,
  daysLabel,
  deviceUnits,
  dobFromTyped,
  hasTargetRoom,
  kgLabel,
  rateLabel,
  round1,
  stepCm,
  stepKg,
  weightNumber,
  weightToKg,
  weightUnit,
  type Activity,
  type DietType,
  type Goal,
  type Pace,
  type Sex,
  type Units,
} from '@/lib/profile'
import { font, themedStyles, useTheme } from '@/theme'
import { Button, RoundButton } from './Controls'
import { Icon } from './Icon'
import { Tap } from './Tap'

type Choice<T extends string> = { value: T; label: string; detail?: string }
export type TargetValue = { targetWeightKg: number; pace: Pace }
type DobParts = { day: string; month: string; year: string }

const CM_PER_INCH = 2.54
const DAY_COUNTS = [0, 1, 2, 3, 4, 5, 6, 7]

// A typed number, with a comma or dot as the decimal mark, or null when it is empty or not a number at or above zero.
function parseNumber(text: string): number | null {
  if (text.trim() === '') return null
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

// Keeps a target on the far side of today's weight, 0.1 kg short of it, as the server requires, and inside the allowed weights.
function boundTarget(kg: number, goal: 'lose' | 'gain', weightKg: number): number {
  const bounded = goal === 'lose' ? Math.min(kg, round1(weightKg - 0.1)) : Math.max(kg, round1(weightKg + 0.1))
  return clamp(bounded, WEIGHT_KG.min, WEIGHT_KG.max)
}

// Rounds a height in cm and keeps it inside the bounds.
function fitHeight(cm: number): number {
  return clamp(Math.round(cm), HEIGHT_CM.min, HEIGHT_CM.max)
}

// Two-digit day or month, as the date boxes show it.
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// Full-width tappable rows, as in the mock's goal step. The chosen row turns ink with a Polo check.
function ChoiceRows<T extends string>({
  options,
  isOn,
  onPick,
  role = 'radio',
}: {
  options: Choice<T>[]
  isOn: (v: T) => boolean
  onPick: (v: T) => void
  role?: 'radio' | 'checkbox'
}) {
  const t = useTheme()
  const s = useStyles()
  return (
    <View style={s.list}>
      {options.map((o) => {
        const on = isOn(o.value)
        return (
          <Tap
            key={o.value}
            onPress={() => onPick(o.value)}
            scale={motion.press.rowScale}
            style={[s.row, on && s.rowOn]}
            accessibilityRole={role}
            accessibilityLabel={o.label}
            accessibilityState={{ checked: on }}
          >
            <View style={s.rowText}>
              <Text style={[s.rowLabel, on && s.rowLabelOn]}>{o.label}</Text>
              {o.detail ? <Text style={[s.rowDetail, on && s.rowDetailOn]}>{o.detail}</Text> : null}
            </View>
            <View style={[s.radio, on && s.radioOn]}>{on ? <Icon name="check" size={14} color={t.c.onPolo} /> : null}</View>
          </Tap>
        )
      })}
    </View>
  )
}

// Card with a label over its input, like the mock's basics card.
function FieldCard({ label, children }: { label: string; children: ReactNode }) {
  const s = useStyles()
  return (
    <View style={s.fieldCard}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  )
}

// Text field for a number or a date part. It shows what is typed until blur, then the saved value again.
function NumberBox({
  label,
  value,
  onChangeText,
  keyboardType = 'number-pad',
  returnKeyType = 'done',
  maxLength,
  placeholder,
  inputRef,
  onSubmitEditing,
  style,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  keyboardType?: 'number-pad' | 'decimal-pad'
  returnKeyType?: 'done' | 'next'
  maxLength?: number
  placeholder?: string
  inputRef?: Ref<TextInput>
  onSubmitEditing?: () => void
  style?: StyleProp<TextStyle>
}) {
  const t = useTheme()
  const s = useStyles()
  const [typing, setTyping] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  return (
    <TextInput
      ref={inputRef}
      value={typing ?? value}
      onChangeText={(text) => {
        setTyping(text)
        onChangeText(text)
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        setTyping(null)
      }}
      onSubmitEditing={onSubmitEditing}
      keyboardType={keyboardType}
      returnKeyType={returnKeyType}
      maxLength={maxLength}
      placeholder={placeholder}
      placeholderTextColor={t.c.ink3}
      selectTextOnFocus
      accessibilityLabel={label}
      style={[s.input, focused && s.inputFocused, style]}
    />
  )
}

// Minus and plus around a field. A tap closes the keyboard first, so the stepped value shows.
function Nudged({ label, onStep, children }: { label: string; onStep: (dir: -1 | 1) => void; children: ReactNode }) {
  const s = useStyles()
  // Closes the keyboard, then steps once.
  function nudge(dir: -1 | 1) {
    Keyboard.dismiss()
    onStep(dir)
  }
  return (
    <View style={s.nudged}>
      <RoundButton icon="minus" label={`Less ${label}`} size={36} onPress={() => nudge(-1)} />
      <View style={s.nudgedMid}>{children}</View>
      <RoundButton icon="plus" label={`More ${label}`} size={36} onPress={() => nudge(1)} />
    </View>
  )
}

export const GOAL_OPTIONS: Choice<Goal>[] = [
  { value: 'lose', label: 'Lose fat, slowly', detail: 'Keeps your strength.' },
  { value: 'maintain', label: 'Stay where I am', detail: 'Eat to your real burn, train well.' },
  { value: 'gain', label: 'Build muscle', detail: 'Small surplus, progressive lifting.' },
]

// Lose, maintain or gain.
export function GoalInput({ value, onChange }: { value: Goal | null; onChange: (v: Goal) => void }) {
  return <ChoiceRows options={GOAL_OPTIONS} isOn={(v) => v === value} onPick={onChange} />
}

export const SEX_OPTIONS: Choice<Sex>[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]

// Sex for the starting formula.
export function SexInput({ value, onChange }: { value: Sex | null; onChange: (v: Sex) => void }) {
  return <ChoiceRows options={SEX_OPTIONS} isOn={(v) => v === value} onPick={onChange} />
}

// Day, month and year boxes for a YYYY-MM-DD date. Moves on when a box is full, and passes the date on only when it is real and the age is 13 to 120.
export function DobInput({
  value,
  onChange,
  onValidChange,
}: {
  value: string
  onChange: (v: string) => void
  onValidChange?: (valid: boolean) => void
}) {
  const s = useStyles()
  const start = dateParts(value)
  const [parts, setParts] = useState<DobParts>({ day: pad(start.day), month: pad(start.month), year: String(start.year) })
  const monthRef = useRef<TextInput>(null)
  const yearRef = useRef<TextInput>(null)
  const today = useLocalToday()
  const valid = dobFromTyped(parts.day, parts.month, parts.year, today) !== null
  // Reports validity, and passes the date on when it becomes valid without typing (for example, at midnight).
  useEffect(() => {
    onValidChange?.(valid)
    const iso = dobFromTyped(parts.day, parts.month, parts.year, today)
    if (iso && iso !== value) onChange(iso)
  }, [valid, onValidChange, parts, today, value, onChange])
  // Keeps each typed part, and passes the date on when all three make a valid one.
  function typePart(next: DobParts) {
    setParts(next)
    const iso = dobFromTyped(next.day, next.month, next.year, today)
    if (iso) onChange(iso)
  }
  return (
    <View>
      <FieldCard label="Date of birth">
        <View style={s.dobRow}>
          <NumberBox
            label="Day"
            placeholder="DD"
            value={parts.day}
            maxLength={2}
            returnKeyType="next"
            onSubmitEditing={() => monthRef.current?.focus()}
            onChangeText={(day) => {
              typePart({ ...parts, day })
              if (day.length === 2) monthRef.current?.focus()
            }}
          />
          <NumberBox
            label="Month"
            placeholder="MM"
            value={parts.month}
            maxLength={2}
            returnKeyType="next"
            inputRef={monthRef}
            onSubmitEditing={() => yearRef.current?.focus()}
            onChangeText={(month) => {
              typePart({ ...parts, month })
              if (month.length === 2) yearRef.current?.focus()
            }}
          />
          <NumberBox
            label="Year"
            placeholder="YYYY"
            value={parts.year}
            maxLength={4}
            inputRef={yearRef}
            style={s.dobYear}
            onChangeText={(year) => typePart({ ...parts, year })}
          />
        </View>
      </FieldCard>
      {valid ? null : <Text style={s.hint}>Enter a real date, age 13 or older.</Text>}
    </View>
  )
}

// Height in cm, or in ft and in, nudged by 1 cm or 1 inch. Typed heights are kept inside the bounds.
export function HeightInput({ value, onChange, units = deviceUnits() }: { value: number; onChange: (cm: number) => void; units?: Units }) {
  const s = useStyles()
  const inchesRef = useRef<TextInput>(null)
  const totalInches = Math.round(value / CM_PER_INCH)
  const feet = Math.floor(totalInches / 12)
  const inches = totalInches % 12
  const step = (dir: -1 | 1) => onChange(stepCm(value, dir, units))

  if (units === 'metric')
    return (
      <FieldCard label="Height">
        <Nudged label="height" onStep={step}>
          <NumberBox
            label="Height in centimetres"
            value={String(value)}
            onChangeText={(text) => {
              const cm = parseNumber(text)
              if (cm !== null) onChange(fitHeight(cm))
            }}
          />
          <Text style={s.unit}>cm</Text>
        </Nudged>
      </FieldCard>
    )

  return (
    <FieldCard label="Height">
      <Nudged label="height" onStep={step}>
        <NumberBox
          label="Feet"
          value={String(feet)}
          returnKeyType="next"
          onSubmitEditing={() => inchesRef.current?.focus()}
          onChangeText={(text) => {
            const ft = parseNumber(text)
            if (ft !== null) onChange(fitHeight((ft * 12 + inches) * CM_PER_INCH))
          }}
        />
        <Text style={s.unit}>ft</Text>
        <NumberBox
          label="Inches"
          value={String(inches)}
          inputRef={inchesRef}
          onChangeText={(text) => {
            const inch = parseNumber(text)
            if (inch !== null) onChange(fitHeight((feet * 12 + inch) * CM_PER_INCH))
          }}
        />
        <Text style={s.unit}>in</Text>
      </Nudged>
    </FieldCard>
  )
}

// Weight in kg, shown in kg or lb, nudged by 0.1 kg or 1 lb. Typed weights are kept inside the bounds.
export function WeightInput({ value, onChange, units = deviceUnits() }: { value: number; onChange: (kg: number) => void; units?: Units }) {
  const s = useStyles()
  const unit = weightUnit(units)
  // Turns a typed weight in the user's unit into kg and keeps it inside the bounds.
  function typeWeight(text: string) {
    const n = parseNumber(text)
    if (n !== null) onChange(clamp(weightToKg(n, units), WEIGHT_KG.min, WEIGHT_KG.max))
  }
  return (
    <FieldCard label="Weight">
      <Nudged label="weight" onStep={(dir) => onChange(stepKg(value, dir, units))}>
        <NumberBox
          label={`Weight in ${unit}`}
          value={weightNumber(value, units)}
          keyboardType="decimal-pad"
          onChangeText={typeWeight}
        />
        <Text style={s.unit}>{unit}</Text>
      </Nudged>
    </FieldCard>
  )
}

export const ACTIVITY_OPTIONS: Choice<Activity>[] = [
  { value: 'sedentary', label: 'Mostly sitting', detail: 'Desk job, little exercise.' },
  { value: 'light', label: 'Lightly active', detail: 'On my feet some, a walk or two.' },
  { value: 'moderate', label: 'Moderately active', detail: 'Train a few times a week.' },
  { value: 'active', label: 'Active', detail: 'Physical job or hard training most days.' },
  { value: 'very_active', label: 'Very active', detail: 'Physical job plus daily training.' },
]

// How active a usual week is.
export function ActivityInput({ value, onChange }: { value: Activity | null; onChange: (v: Activity) => void }) {
  return <ChoiceRows options={ACTIVITY_OPTIONS} isOn={(v) => v === value} onPick={onChange} />
}

export const DIET_OPTIONS: Choice<DietType>[] = [
  { value: 'veg', label: DIET_LABELS.veg },
  { value: 'eggetarian', label: DIET_LABELS.eggetarian },
  { value: 'non_veg', label: DIET_LABELS.non_veg },
  { value: 'vegan', label: DIET_LABELS.vegan },
  { value: 'jain', label: DIET_LABELS.jain },
]

// Diets as toggle rows. Tapping a chosen diet clears it, but the last one stays picked.
export function DietInput({ value, onChange }: { value: DietType[]; onChange: (v: DietType[]) => void }) {
  const s = useStyles()
  // Adds or removes one diet, and never empties the list.
  function toggle(diet: DietType) {
    if (!value.includes(diet)) onChange([...value, diet])
    else if (value.length > 1) onChange(value.filter((d) => d !== diet))
  }
  return (
    <View>
      <Text style={s.note}>Pick all that apply.</Text>
      <ChoiceRows options={DIET_OPTIONS} isOn={(v) => value.includes(v)} onPick={toggle} role="checkbox" />
    </View>
  )
}

export const PACES: Choice<Pace>[] = [
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'steady', label: 'Steady' },
  { value: 'fast', label: 'Fast' },
]

// Target weight, kept on the far side of the current weight, then the pace that gets there. With no room for a target, offers maintain instead.
export function TargetPaceInput({
  value,
  onChange,
  goal,
  weightKg,
  units = deviceUnits(),
  onMaintain,
}: {
  value: TargetValue
  onChange: (v: TargetValue) => void
  goal: 'lose' | 'gain'
  weightKg: number
  units?: Units
  onMaintain?: () => void
}) {
  const s = useStyles()
  const unit = weightUnit(units)
  // Stops the target on the wrong side of today's weight, which the server would reject.
  function stepTarget(dir: -1 | 1) {
    onChange({ ...value, targetWeightKg: boundTarget(stepKg(value.targetWeightKg, dir, units), goal, weightKg) })
  }
  // Turns a typed target in the user's unit into kg, kept inside the bounds and on the far side of today's weight.
  function typeTarget(text: string) {
    const n = parseNumber(text)
    if (n === null) return
    onChange({ ...value, targetWeightKg: boundTarget(clamp(weightToKg(n, units), WEIGHT_KG.min, WEIGHT_KG.max), goal, weightKg) })
  }
  if (!hasTargetRoom(goal, weightKg))
    return (
      <View>
        <Text style={s.note}>
          At {kgLabel(weightKg, units)}, Stride can't set a {goal === 'lose' ? 'lower' : 'higher'} target. Pick maintain instead.
        </Text>
        {onMaintain ? <Button label="Switch to maintain" variant="ghost" size="sm" onPress={onMaintain} /> : null}
      </View>
    )
  const options = PACES.map((p) => ({ ...p, detail: rateLabel(PACE_KG_PER_WEEK[goal][p.value], units) }))
  return (
    <View>
      <FieldCard label="Target weight">
        <Nudged label="target weight" onStep={stepTarget}>
          <NumberBox
            label={`Target weight in ${unit}`}
            value={weightNumber(value.targetWeightKg, units)}
            keyboardType="decimal-pad"
            onChangeText={typeTarget}
          />
          <Text style={s.unit}>{unit}</Text>
        </Nudged>
      </FieldCard>
      <Text style={s.caption}>Pace</Text>
      <ChoiceRows options={options} isOn={(p) => p === value.pace} onPick={(pace) => onChange({ ...value, pace })} />
    </View>
  )
}

// Training days per week, 0 to 7, as one tappable chip per count.
export function TrainingDaysInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const s = useStyles()
  return (
    <FieldCard label="Days a week">
      <View style={s.chips}>
        {DAY_COUNTS.map((n) => {
          const on = n === value
          return (
            <Tap
              key={n}
              onPress={() => onChange(n)}
              scale={motion.press.cardScale}
              style={[s.chip, on && s.chipOn]}
              accessibilityRole="radio"
              accessibilityLabel={daysLabel(n)}
              accessibilityState={{ checked: on }}
            >
              <Text style={[s.chipText, on && s.chipTextOn]}>{n}</Text>
            </Tap>
          )
        })}
      </View>
    </FieldCard>
  )
}

const useStyles = themedStyles((t) => ({
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: radii.card,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  rowOn: { backgroundColor: t.c.ink },
  rowText: { flex: 1 },
  rowLabel: { ...font('section'), color: t.c.ink },
  rowLabelOn: { color: t.c.bg },
  rowDetail: { ...font('secondary'), color: t.c.ink3, marginTop: 2 },
  rowDetailOn: { color: t.c.bg, opacity: 0.65 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: t.c.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: t.c.polo, borderColor: t.c.polo },
  fieldCard: {
    backgroundColor: t.c.card,
    borderRadius: radii.card,
    boxShadow: t.shadow.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  fieldLabel: { ...font('bodyStrong'), color: t.c.ink },
  nudged: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nudgedMid: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    ...font('calloutStrong'),
    color: t.c.ink,
    flex: 1,
    minWidth: 0,
    height: 44,
    padding: 0,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: t.c.line,
    backgroundColor: t.c.card2,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  inputFocused: { borderColor: t.c.ink },
  unit: { ...font('secondary'), color: t.c.ink3 },
  dobRow: { flexDirection: 'row', gap: 8 },
  dobYear: { flex: 1.5 },
  hint: { ...font('caption'), color: t.c.poloInk, marginTop: 10, marginHorizontal: 2 },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: t.c.card2 },
  chipOn: { backgroundColor: t.c.ink },
  chipText: { ...font('calloutStrong'), color: t.c.ink },
  chipTextOn: { color: t.c.bg },
  caption: { ...font('eyebrow'), color: t.c.ink3, marginTop: 24, marginBottom: 10, marginHorizontal: 2 },
  note: { ...font('secondary'), color: t.c.ink3, marginBottom: 12, marginHorizontal: 2 },
}))
