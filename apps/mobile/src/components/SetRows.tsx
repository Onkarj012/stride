import { useEffect, useRef, useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import Animated, { FadeInDown, FadeOut, LinearTransition, ZoomIn } from 'react-native-reanimated'
import { useMutation, useQuery } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { radii } from '@stride/ui-tokens'
import { newSubmissionId, plainError } from '@/lib/log'
import {
  MAX_KG,
  MAX_REPS,
  formatKg,
  formatSet,
  formatSets,
  muscleName,
  startingWeight,
  weightStep,
  type Exercise,
  type SessionId,
  type SetId,
  type SetView,
} from '@/lib/strength'
import { font, themedStyles, useTheme } from '@/theme'
import { Icon } from './Icon'
import { Polo } from './Polo'
import { Tap } from './Tap'
import type { ToastMessage } from './Toast'

const SAVE_AFTER_MS = 700
const RPES = [6, 7, 8, 9, 10]

export type WorkoutActions = {
  toast: (message: Omit<ToastMessage, 'id'>) => void
  // Builds an undo that reverts the latest revision of a set.
  undoFor: (setId: SetId) => () => void
}

type Hint = { weightKg: number; reps: number }

// One exercise of a live workout (mock #/workout): name, Polo's hint from last time, logged sets and the next set to log.
export function ExerciseBlock({
  sessionId,
  exercise,
  sets,
  previousSets,
  historyLimited,
  position,
  finished,
  actions,
}: {
  sessionId: SessionId
  exercise: Exercise
  sets: SetView[]
  previousSets?: Hint[]
  historyLimited: boolean
  position: string
  // A finished workout can be corrected but not extended, so the new-set row is hidden.
  finished: boolean
  actions: WorkoutActions
}) {
  const s = useStyles()
  const hints = useQuery(api.strength.exerciseHints, previousSets === undefined ? { sessionId, exerciseId: exercise._id } : 'skip')
  const previous = previousSets ?? hints?.previousSets ?? []
  const limited = historyLimited || hints?.historyLimited === true
  const muscle = exercise.primaryMuscles[0]
  const last = sets.at(-1)
  const draft: Hint = last ?? previous[sets.length] ?? previous.at(-1) ?? { weightKg: startingWeight(exercise), reps: 8 }

  return (
    <View>
      <Text style={s.eyebrow}>
        {position}
        {muscle ? ` · ${muscleName(muscle)}` : ''}
      </Text>
      <Text style={s.exname}>{exercise.name}</Text>
      <View style={s.hint}>
        <Polo size={24} mood={sets.length > 0 ? 'happy' : 'idle'} hop={sets.length} />
        <Text style={s.hintText}>
          {previousSets === undefined && hints === undefined
            ? ' '
            : limited
              ? 'Previous workout hints are unavailable for this history.'
              : previous.length > 0
              ? `Last time: ${formatSets(previous)}.`
              : 'New lift. Start with a weight you can move for 8 clean reps.'}
        </Text>
      </View>

      <View style={s.sets}>
        {sets.map((set, i) => (
          // Edits give a set a new id, so key by its slot in the session to keep the row mounted.
          <LoggedRow key={set.setIndex} set={set} number={i + 1} hint={previous[i]} exercise={exercise} actions={actions} />
        ))}
        {finished ? null : (
          <DraftRow
            // Remount with fresh defaults after each logged set; late hints are applied in place.
            key={sets.length}
            sessionId={sessionId}
            exercise={exercise}
            number={sets.length + 1}
            hint={previous[sets.length]}
            start={draft}
            actions={actions}
          />
        )}
      </View>
    </View>
  )
}

// A set already saved: dark row; steppers save an edit after a pause; holding the filled check removes it.
function LoggedRow({ set, number, hint, exercise, actions }: { set: SetView; number: number; hint?: Hint; exercise: Exercise; actions: WorkoutActions }) {
  const t = useTheme()
  const s = useStyles()
  const editSet = useMutation(api.strength.editSet)
  const deleteSet = useMutation(api.strength.deleteSet)
  const [shown, setShown] = useState<Hint | null>(null)
  const pending = useRef<Hint | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(set)
  latest.current = set
  const saving = useRef(false)
  // The save chain in flight. Removal waits on it so it targets the revision that save returned.
  const inFlight = useRef<Promise<void>>(Promise.resolve())
  // Count of this set's fields with focus. Typed changes save when the last one loses focus or the check is pressed.
  const editing = useRef(0)
  const mounted = useRef(true)
  // Revision id returned by our last save, ahead of the query; edits chain onto it instead of the stale head.
  const ahead = useRef<SetId | null>(null)

  useEffect(() => {
    ahead.current = null
  }, [set._id])

  // Saves the last stepped values as one edit revision, with an undo. One save at a time; later changes wait for it.
  function flush() {
    if (timer.current) clearTimeout(timer.current)
    if (saving.current) return
    const next = pending.current
    if (next === null) return
    pending.current = null
    const head = latest.current
    if (ahead.current === null && next.weightKg === head.weightKg && next.reps === head.reps) {
      if (mounted.current) setShown(null)
      return
    }
    saving.current = true
    inFlight.current = editSet({ submissionId: newSubmissionId(), setId: ahead.current ?? head._id, weightKg: next.weightKg, reps: next.reps })
      .then(
        (revision) => {
          ahead.current = revision
          actions.toast({ title: `Set ${number} changed`, sub: `${formatKg(next.weightKg)} kg × ${next.reps}`, undo: actions.undoFor(revision) })
        },
        (err: unknown) => actions.toast({ title: "Couldn't save that set.", sub: plainError(err) }),
      )
      .finally(() => {
        saving.current = false
        if (pending.current === null) {
          if (mounted.current) setShown((v) => (v === next ? null : v))
        } else if (!mounted.current || editing.current === 0) flush()
      })
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      flush()
    }
  }, [])

  // Changes the set locally; the save waits for a pause, or for the field to lose focus.
  function change(next: Hint) {
    pending.current = next
    setShown(next)
    if (timer.current) clearTimeout(timer.current)
    if (editing.current === 0) timer.current = setTimeout(flush, SAVE_AFTER_MS)
  }

  // Tracks focus on a field: leaving it saves what was typed, entering it holds the save.
  function focusChange(on: boolean) {
    editing.current += on ? 1 : -1
    if (editing.current > 0) {
      if (timer.current) clearTimeout(timer.current)
    } else flush()
  }

  // Removes the set with a revision the toast can undo, after any save in flight.
  async function remove() {
    if (timer.current) clearTimeout(timer.current)
    pending.current = null
    while (saving.current) await inFlight.current
    try {
      const revision = await deleteSet({ submissionId: newSubmissionId(), setId: ahead.current ?? latest.current._id })
      actions.toast({ title: `Removed set ${number}`, sub: 'Every version is kept.', undo: actions.undoFor(revision) })
    } catch (err) {
      actions.toast({ title: "Couldn't remove that set.", sub: plainError(err) })
    }
  }

  const value = shown ?? set
  return (
    <Animated.View layout={LinearTransition.springify()} entering={FadeInDown.springify()} exiting={FadeOut} style={[s.set, s.setDone]}>
      <View style={s.lead}>
        <Text style={[s.no, s.onInk]}>{number}</Text>
        <Text style={[s.prev, s.onInk]} numberOfLines={1}>
          {set.rpe !== undefined ? `RPE ${set.rpe}` : hint ? formatSet(hint) : ' '}
        </Text>
      </View>
      <NumStep
        value={value.weightKg}
        unit="kg"
        step={weightStep(exercise)}
        min={0}
        max={MAX_KG}
        decimals
        dark
        label={`set ${number} weight`}
        onChange={(weightKg) => change({ ...value, weightKg })}
        onFocusChange={focusChange}
      />
      <NumStep
        value={value.reps}
        unit="reps"
        step={1}
        min={1}
        max={MAX_REPS}
        dark
        label={`set ${number} reps`}
        onChange={(reps) => change({ ...value, reps })}
        onFocusChange={focusChange}
      />
      <Tap
        style={[s.ck, s.ckDone]}
        scale={0.85}
        onPress={() => {
          flush()
          actions.toast({ title: `Set ${number} is logged`, sub: 'Hold the check to remove it.' })
        }}
        onLongPress={() => void remove()}
        accessibilityRole="button"
        accessibilityLabel={`Set ${number} logged`}
        accessibilityHint="Hold to remove this set"
      >
        <Animated.View entering={ZoomIn.springify()}>
          <Icon name="check" size={20} color={t.c.onPolo} />
        </Animated.View>
      </Tap>
    </Animated.View>
  )
}

// The next set: prefilled from this session or last time, logged with one tap on the check. RPE is optional.
function DraftRow({
  sessionId,
  exercise,
  number,
  hint,
  start,
  actions,
}: {
  sessionId: SessionId
  exercise: Exercise
  number: number
  hint?: Hint
  start: Hint
  actions: WorkoutActions
}) {
  const t = useTheme()
  const s = useStyles()
  const addSet = useMutation(api.strength.addSet)
  const [value, setValue] = useState(start)
  const [rpe, setRpe] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  // Fields the user has changed; hints that arrive later never overwrite these.
  const touched = useRef({ weightKg: false, reps: false })
  // Kept across retries so a resend after a dropped reply logs the set once.
  const submissionId = useRef(newSubmissionId())

  useEffect(() => {
    setValue((v) => ({
      weightKg: touched.current.weightKg ? v.weightKg : start.weightKg,
      reps: touched.current.reps ? v.reps : start.reps,
    }))
  }, [start.weightKg, start.reps])

  // Records a user edit to one field and keeps it.
  function setField(field: keyof Hint, n: number) {
    touched.current[field] = true
    setValue((v) => ({ ...v, [field]: n }))
  }

  // Saves the set; the row remounts empty once the session updates.
  async function log() {
    setBusy(true)
    try {
      const id = await addSet({
        submissionId: submissionId.current,
        sessionId,
        exerciseId: exercise._id,
        weightKg: value.weightKg,
        reps: value.reps,
        ...(rpe === null ? {} : { rpe }),
      })
      actions.toast({ title: `Set ${number} logged`, sub: `${formatKg(value.weightKg)} kg × ${value.reps}`, undo: actions.undoFor(id) })
    } catch (err) {
      actions.toast({ title: "Couldn't log that set.", sub: plainError(err) })
      setBusy(false)
    }
  }

  return (
    <Animated.View layout={LinearTransition.springify()} entering={FadeInDown.springify()}>
      <View style={s.set}>
        <View style={s.lead}>
          <Text style={s.no}>{number}</Text>
          <Text style={s.prev} numberOfLines={1}>
            {hint ? `Last ${formatSet(hint)}` : ' '}
          </Text>
        </View>
        <NumStep
          value={value.weightKg}
          unit="kg"
          step={weightStep(exercise)}
          min={0}
          max={MAX_KG}
          decimals
          label={`set ${number} weight`}
          onChange={(weightKg) => setField('weightKg', weightKg)}
        />
        <NumStep
          value={value.reps}
          unit="reps"
          step={1}
          min={1}
          max={MAX_REPS}
          label={`set ${number} reps`}
          onChange={(reps) => setField('reps', reps)}
        />
        <Tap
          style={[s.ck, busy && s.dim]}
          scale={0.85}
          disabled={busy}
          onPress={() => void log()}
          accessibilityRole="button"
          accessibilityLabel={`Log set ${number}`}
        >
          <Icon name="check" size={20} color={t.c.ink} />
        </Tap>
      </View>
      <View style={s.rpeRow}>
        <Text style={s.rpeLabel}>RPE</Text>
        {RPES.map((n) => (
          <Tap
            key={n}
            style={[s.rpe, rpe === n && s.rpeOn]}
            scale={0.9}
            onPress={() => setRpe((r) => (r === n ? null : n))}
            accessibilityRole="button"
            accessibilityState={{ selected: rpe === n }}
            accessibilityLabel={`RPE ${n}`}
          >
            <Text style={[s.rpeText, rpe === n && { color: t.c.bg }]}>{n}</Text>
          </Tap>
        ))}
        <Text style={s.rpeHint}>optional</Text>
      </View>
    </Animated.View>
  )
}

// Minus, a typeable number with its unit, plus. Clamps to the backend's limits.
function NumStep({
  value,
  unit,
  step,
  min,
  max,
  decimals,
  dark,
  label,
  onChange,
  onFocusChange,
}: {
  value: number
  unit: string
  step: number
  min: number
  max: number
  decimals?: boolean
  dark?: boolean
  label: string
  onChange: (value: number) => void
  onFocusChange?: (focused: boolean) => void
}) {
  const t = useTheme()
  const s = useStyles()
  const [text, setText] = useState<string | null>(null)
  const ink = dark ? t.c.bg : t.c.ink
  const shown = format(value)

  // Rounds to the field's precision and keeps it in range.
  function clamp(n: number): number {
    const rounded = decimals ? Math.round(n * 10) / 10 : Math.round(n)
    return Math.min(max, Math.max(min, rounded))
  }

  // Formats a value the way the field shows it.
  function format(n: number): string {
    return decimals ? formatKg(n) : String(n)
  }

  // Moves by one step from the current value. A focused field's text follows the new value.
  function nudge(next: number) {
    const v = clamp(next)
    setText((typed) => (typed === null ? null : format(v)))
    onChange(v)
  }

  // Passes each readable keystroke on at once, so tapping the check without closing the keyboard saves what was typed.
  function type(next: string) {
    setText(next)
    const n = Number(next.replace(',', '.'))
    if (next.trim() !== '' && Number.isFinite(n) && clamp(n) !== value) onChange(clamp(n))
  }

  // Tidies the field when it loses focus; anything unreadable leaves the last good value.
  function commit() {
    const n = Number((text ?? '').replace(',', '.'))
    if (text !== null && text.trim() !== '' && Number.isFinite(n) && clamp(n) !== value) onChange(clamp(n))
    setText(null)
  }

  // Commits the typed value and tells the parent the field lost focus.
  function leave() {
    commit()
    onFocusChange?.(false)
  }

  return (
    <View style={[s.step, dark && s.stepDark]}>
      <Tap onPress={() => nudge(value - step)} scale={0.85} style={s.stepBtn} accessibilityRole="button" accessibilityLabel={`Less ${label}`}>
        <Icon name="minus" size={14} color={ink} />
      </Tap>
      <View style={s.stepMid}>
        <TextInput
          style={[s.stepValue, { color: ink }]}
          value={text ?? shown}
          onFocus={() => {
            setText(shown)
            onFocusChange?.(true)
          }}
          onChangeText={type}
          onBlur={leave}
          onSubmitEditing={leave}
          keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
          selectTextOnFocus
          maxLength={6}
          accessibilityLabel={label}
        />
        <Text style={[s.stepUnit, dark && s.onInk]}>{unit}</Text>
      </View>
      <Tap onPress={() => nudge(value + step)} scale={0.85} style={s.stepBtn} accessibilityRole="button" accessibilityLabel={`More ${label}`}>
        <Icon name="plus" size={14} color={ink} />
      </Tap>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  eyebrow: { ...font('eyebrow'), color: t.c.ink3, marginTop: 22 },
  exname: { ...font('onboardTitle'), fontSize: 36, lineHeight: 38, color: t.c.ink, marginTop: 10 },
  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12 },
  hintText: { ...font('callout'), color: t.c.ink2, flex: 1, marginTop: 2 },
  sets: { marginTop: 20, gap: 8 },
  set: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radii.md,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  setDone: { backgroundColor: t.c.ink },
  lead: { flex: 1, minWidth: 0, alignItems: 'center' },
  no: { ...font('value'), fontFamily: font('avatar').fontFamily, color: t.c.ink3 },
  prev: { ...font('label'), fontSize: 10.5, color: t.c.ink3, marginTop: 1 },
  onInk: { color: t.c.bg, opacity: 0.6 },
  step: { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: radii.pill, backgroundColor: t.c.card2 },
  stepDark: { backgroundColor: 'rgba(127,127,127,0.25)' },
  stepBtn: { width: 30, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepMid: { minWidth: 40, alignItems: 'center' },
  stepValue: { ...font('value'), fontSize: 17, lineHeight: 20, textAlign: 'center', padding: 0, minWidth: 40, fontVariant: ['tabular-nums'] },
  stepUnit: { ...font('label'), fontSize: 10, lineHeight: 11, color: t.c.ink3 },
  ck: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.c.card2, alignItems: 'center', justifyContent: 'center' },
  ckDone: { backgroundColor: t.c.polo },
  dim: { opacity: 0.5 },
  rpeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 8 },
  rpeLabel: { ...font('tag'), color: t.c.ink3, marginRight: 2 },
  rpe: { width: 32, height: 28, borderRadius: radii.pill, backgroundColor: t.c.card2, alignItems: 'center', justifyContent: 'center' },
  rpeOn: { backgroundColor: t.c.ink },
  rpeText: { ...font('buttonSmall'), color: t.c.ink2 },
  rpeHint: { ...font('caption'), color: t.c.ink3, marginLeft: 4 },
}))
