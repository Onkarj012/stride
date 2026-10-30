import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Text, TextInput, View } from 'react-native'
import { useMutation, useQuery } from 'convex/react'
import { isLocalDate } from '@stride/core'
import { radii } from '@stride/ui-tokens'
import { api } from 'stride-backend/convex/_generated/api'
import { formatDayTitle } from '@/lib/format'
import { newSubmissionId, plainError } from '@/lib/log'
import type { ExerciseId, SessionId, WeightBasis } from '@/lib/strength'
import { saveBlocker, type WorkoutDraftId, type WorkoutDraftView, type WorkoutItem } from '@/lib/workoutDraft'
import { font, themedStyles, useTheme } from '@/theme'
import { Button, RoundButton, Thinking } from './Controls'
import { ExercisePicker } from './ExercisePicker'
import { Tap } from './Tap'
import type { ToastMessage } from './Toast'

type SetRow = WorkoutItem['sets'][number]
export type WorkoutCardio = NonNullable<WorkoutItem['cardio']>
// Cardio measures, as addCardio takes them.
export type CardioValues = Omit<WorkoutCardio, 'cardioId'>
// A catalog row or the user's own exercise, as the plate shows it.
export type ExerciseLike = { _id: ExerciseId; name: string; category: string; ownerId?: string }
type Header = { localDate: string; startTime: string; duration: string; needsTarget: boolean; targetSessionId: SessionId | null }

const TIME_TEXT = /^([01]\d|2[0-3]):[0-5]\d$/

// Whether plain-English workout logging is on for this user.
export function usePlainWorkouts(): boolean {
  return useQuery(api.progress_v2.profile, {})?.plainWorkouts === true
}

// Reverts a saved review as one batch, toasts the result, and resolves true when it worked.
export function useUndoWorkoutDraft(toast: (message: Omit<ToastMessage, 'id'>) => void): (draftId: WorkoutDraftId) => Promise<boolean> {
  const undoDraft = useMutation(api.workouts.undoDraft)
  return useCallback(
    (draftId) =>
      undoDraft({ draftId, submissionId: newSubmissionId() }).then(
        () => {
          toast({ title: 'Undone. Nothing lost.', sub: "It's back the way it was." })
          return true
        },
        (err: unknown) => {
          toast({ title: "Couldn't undo that.", sub: plainError(err) })
          return false
        },
      ),
    [undoDraft, toast],
  )
}

// The name an item shows: its catalog or own exercise when matched, else the user's words.
export function matchedName(item: WorkoutItem, known: ExerciseLike[]): string | null {
  return known.find((exercise) => exercise._id === item.exerciseId)?.name ?? null
}

// The first thing stopping a save, in plain words, or null when the review can be saved.
function blockerOf(header: Header, items: WorkoutItem[]): string | null {
  if (!isLocalDate(header.localDate)) return 'Check the date. Use YYYY-MM-DD.'
  if (!TIME_TEXT.test(header.startTime)) return 'Check the start time. Use HH:MM.'
  if (!durationOk(header.duration)) return 'Duration should be whole minutes, 1 to 1440, or blank.'
  if (header.needsTarget) return 'Choose where this workout goes.'
  if (items.length === 0) return 'Nothing to save.'
  return saveBlocker(items)
}

// A blank duration is allowed. Otherwise it must be whole minutes from 1 to 1440.
function durationOk(text: string): boolean {
  if (text.trim() === '') return true
  const n = Number(text)
  return Number.isInteger(n) && n >= 1 && n <= 1440
}

// Clears the catalog match, or sets it. Clearing drops the id, so the item saves under the user's own words.
function withMatch(item: WorkoutItem, exercise: ExerciseLike | null): WorkoutItem {
  const { exerciseId: _previous, ...rest } = item
  return exercise === null ? rest : { ...rest, exerciseId: exercise._id }
}

// Text shown in a number field for a value.
function textOf(value: number | undefined): string {
  return value === undefined ? '' : String(value)
}

// True when the typed text already means the value, so an outside change does not overwrite it.
function meansSame(text: string, value: number | undefined): boolean {
  if (text.trim() === '') return value === undefined
  return Number(text.trim().replace(',', '.')) === value
}

// A typed number, or undefined when the text is not a number yet.
function readNumber(text: string): number | undefined {
  const n = Number(text.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

// The label on the basis chip for a set. Unset means the user did not say.
function basisLabel(basis: WeightBasis | undefined): string {
  if (basis === undefined) return 'Not set'
  return basis === 'each' ? 'Each' : 'Total'
}

type PlanFields = { localDate: string; startTime?: string; durationMin?: number | null; needsTarget: boolean; targetSessionId?: SessionId | null; items: WorkoutItem[] }

// A stable text of the plate's content, to tell a server change from the user's own edits. Problems are left out: the server recomputes them on save.
function planText(plan: PlanFields): string {
  return JSON.stringify(
    {
      localDate: plan.localDate,
      startTime: plan.startTime ?? '12:00',
      durationMin: plan.durationMin ?? null,
      needsTarget: plan.needsTarget,
      targetSessionId: plan.targetSessionId ?? null,
      items: plan.items.map(({ problems: _problems, ...item }) => item),
    },
    sortedKeys,
  )
}

// Sorts object keys, so a copy whose keys were added in another order still matches.
function sortedKeys(_key: string, value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  const sorted: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) sorted[key] = child
  return sorted
}

// The plate's local edits in the shape planText reads.
function localPlan(header: Header, items: WorkoutItem[]): PlanFields {
  return {
    localDate: header.localDate,
    startTime: header.startTime,
    durationMin: header.duration.trim() === '' ? null : Number(header.duration),
    needsTarget: header.needsTarget,
    targetSessionId: header.targetSessionId,
    items,
  }
}

// The review before a workout is saved: date, start, duration, the target, then each exercise to check. Nothing saves until Save.
export function WorkoutPlate({ draftId, toast, onDone }: { draftId: WorkoutDraftId; toast: (message: Omit<ToastMessage, 'id'>) => void; onDone: () => void }) {
  const s = useStyles()
  const view = useQuery(api.workouts.draft, { draftId })
  const commitDraft = useMutation(api.workouts.commitDraft)
  const discardDraft = useMutation(api.workouts.discardDraft)
  const undoDraft = useUndoWorkoutDraft(toast)
  const [header, setHeader] = useState<Header | null>(null)
  const [items, setItems] = useState<WorkoutItem[]>([])
  // Exercises picked from search, so their names show before the review is refetched.
  const [picked, setPicked] = useState<ExerciseLike[]>([])
  const [matching, setMatching] = useState<number | null>(null)
  // The add-an-item picker under the list: strength or cardio. Null when closed.
  const [adding, setAdding] = useState<'strength' | 'cardio' | null>(null)
  // The server content the local edits were last copied from, as planText. Null until the first copy.
  const [synced, setSynced] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'discard' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // Kept across retries so a resend after a dropped reply commits once.
  const submission = useRef(newSubmissionId())
  const loadedVersion = useRef(0)

  // Replaces the local edits with the saved review.
  function copyFrom(draft: WorkoutDraftView['draft']) {
    loadedVersion.current = draft.version ?? 0
    setHeader({
      localDate: draft.localDate,
      startTime: draft.startTime ?? '12:00',
      duration: draft.durationMin === undefined ? '' : String(draft.durationMin),
      needsTarget: draft.needsTarget,
      targetSessionId: draft.targetSessionId ?? null,
    })
    setItems(draft.items)
    setMatching(null)
    setSynced(planText(draft))
  }

  // Copies the saved review when it changes and there are no local edits. When both changed, the note shows instead and nothing is overwritten.
  const serverText = view ? planText(view.draft) : null
  const localText = header === null ? null : planText(localPlan(header, items))
  // The server changed while the local edits differ from both the last copy and the new server content.
  const outside = serverText !== null && localText !== null && serverText !== synced && localText !== synced && localText !== serverText
  if (view && (header === null || (serverText !== synced && !outside))) copyFrom(view.draft)

  if (view === undefined) return <Thinking label="Opening your review…" />
  if (view === null || header === null) return <Text style={s.note}>This review is gone.</Text>
  if (view.draft.status !== 'pending')
    return <Text style={s.note}>{view.draft.status === 'committed' ? 'This one is already saved.' : 'This one was discarded.'}</Text>

  const form: Header = header
  const known: ExerciseLike[] = [...view.exercises, ...picked]
  const blocker = blockerOf(form, items)

  // Changes fields of the header.
  function editHeader(change: Partial<Header>) {
    setHeader((current) => (current === null ? current : { ...current, ...change }))
  }

  // Changes one item by index.
  function editItem(index: number, change: (item: WorkoutItem) => WorkoutItem) {
    setItems((all) => all.map((item, i) => (i === index ? change(item) : item)))
  }

  // Changes one set. Edits clear the item's problems here; the server recomputes them when the review is saved.
  function editSet(index: number, setIndex: number, change: Partial<SetRow>) {
    editItem(index, (item) => ({ ...item, problems: [], sets: item.sets.map((set, j) => (j === setIndex ? { ...set, ...change } : set)) }))
  }

  // Changes the cardio measures of one item. Edits clear its problems, as for sets.
  function editCardio(index: number, change: Partial<CardioValues>) {
    editItem(index, (item) => ({ ...item, problems: [], cardio: { ...item.cardio, ...change } }))
  }

  // Sets or clears one item's catalog match, and closes its picker.
  function chooseMatch(index: number, exercise: ExerciseLike | null) {
    if (exercise !== null) setPicked((all) => [...all, exercise])
    editItem(index, (item) => withMatch(item, exercise))
    setMatching(null)
  }

  // Adds an exercise or cardio from the picker. A catalog or own exercise keeps its id; own words save without one.
  function addItem(kind: WorkoutItem['kind'], exercise: ExerciseLike | null, words: string) {
    if (exercise !== null) setPicked((all) => [...all, exercise])
    const exerciseId = exercise?._id
    const item: WorkoutItem = {
      key: newSubmissionId(), // Unique per item. The server keeps the key as given.
      name: exercise?.name ?? words,
      kind,
      ...(exerciseId === undefined ? {} : { exerciseId }),
      candidateIds: exerciseId === undefined ? [] : [exerciseId],
      sets: kind === 'strength' ? [{}] : [],
      ...(kind === 'cardio' ? { cardio: {} } : {}),
      problems: [],
    }
    setItems((all) => [...all, item])
    setAdding(null)
  }

  // Writes the edits, then commits the whole review in one batch, and offers Undo for it.
  async function save() {
    setBusy('save')
    setProblem(null)
    try {
      const saved = await commitDraft({
        draftId,
        submissionId: submission.current,
        expectedVersion: loadedVersion.current,
        edits: {
        localDate: form.localDate,
        startTime: form.startTime,
        durationMin: form.duration.trim() === '' ? null : Number(form.duration),
        needsTarget: form.needsTarget,
        targetSessionId: form.targetSessionId,
        items,
        },
      })
      const sets = saved.setIds.length
      const cardio = saved.cardioIds.length
      toast({
        title: 'Saved.',
        sub: [sets > 0 ? `${sets} ${sets === 1 ? 'set' : 'sets'}` : null, cardio > 0 ? `${cardio} cardio` : null].filter(Boolean).join(' and ') || 'Nothing new',
        undo: () => void undoDraft(draftId),
      })
      onDone()
    } catch (err) {
      setProblem(plainError(err))
      setBusy(null)
    }
  }

  // Drops the whole review.
  async function discard() {
    setBusy('discard')
    try {
      await discardDraft({ draftId })
      onDone()
    } catch (err) {
      setProblem(plainError(err))
      setBusy(null)
    }
  }

  return (
    <View>
      <Text style={s.eyebrow}>Review</Text>
      <Text style={s.title}>Check this workout</Text>
      {outside ? (
        <View style={s.updated}>
          <Text style={s.noteText}>Updated in chat. Reload?</Text>
          <Button label="Reload" variant="ghost" size="sm" onPress={() => copyFrom(view.draft)} />
        </View>
      ) : null}

      {view.draft.inputText.trim() !== '' ? <YourText text={view.draft.inputText} /> : null}

      <View style={s.card}>
        <View style={s.row}>
          <Field label="Date" flex={1.4}>
            <TextInput style={s.input} value={header.localDate} onChangeText={(localDate) => editHeader({ localDate })} placeholder="YYYY-MM-DD" autoCorrect={false} accessibilityLabel="Date" />
          </Field>
          <Field label="Start">
            <TextInput style={s.input} value={header.startTime} onChangeText={(startTime) => editHeader({ startTime })} placeholder="HH:MM" autoCorrect={false} accessibilityLabel="Start time" />
          </Field>
          <Field label="Duration">
            <TextInput style={s.input} value={header.duration} onChangeText={(duration) => editHeader({ duration })} placeholder="Not set" keyboardType="number-pad" accessibilityLabel="Duration in minutes" />
          </Field>
        </View>
        <Text style={s.caption}>{isLocalDate(header.localDate) ? formatDayTitle(header.localDate) : 'Pick a date'}</Text>
      </View>

      {header.needsTarget ? (
        <View style={s.card}>
          <Text style={s.eyebrow}>Where does this go?</Text>
          <Text style={s.caption}>A workout is open. Add these to it, or start a new one.</Text>
          <View style={s.stack}>
            {view.openSession !== null ? (
              <Button label="Add to open workout" size="block" onPress={() => editHeader({ needsTarget: false, targetSessionId: view.openSession?._id ?? null })} />
            ) : null}
            <Button label="New workout" variant="ghost" size="block" onPress={() => editHeader({ needsTarget: false, targetSessionId: null })} />
          </View>
        </View>
      ) : null}

      {items.map((item, i) => (
        <PlateItemCard
          key={item.key}
          item={item}
          known={known}
          matching={matching === i}
          handlers={{
            onToggleMatch: () => setMatching(matching === i ? null : i),
            onMatch: (exercise) => chooseMatch(i, exercise),
            onRemove: () => {
              setItems((all) => all.filter((_, k) => k !== i))
              setMatching(null)
            },
            onSet: (setIndex, change) => editSet(i, setIndex, change),
            onAddSet: () => editItem(i, (current) => ({ ...current, problems: [], sets: [...current.sets, {}] })),
            onRemoveSet: (setIndex) => editItem(i, (current) => ({ ...current, problems: [], sets: current.sets.filter((_, j) => j !== setIndex) })),
            onCardio: (change) => editCardio(i, change),
          }}
        />
      ))}

      {adding === null ? (
        <View style={s.addRow}>
          <Tap onPress={() => setAdding('strength')} scale={0.98} style={s.addItem} accessibilityRole="button">
            <Text style={s.addItemText}>+ Add exercise</Text>
          </Tap>
          <Tap onPress={() => setAdding('cardio')} scale={0.98} style={s.addItem} accessibilityRole="button">
            <Text style={s.addItemText}>+ Add cardio</Text>
          </Tap>
        </View>
      ) : (
        <View style={s.card}>
          <ExercisePicker
            taken={items.flatMap((item) => (item.exerciseId === undefined ? [] : [item.exerciseId]))}
            kind={adding}
            allowOwn
            onOwnWords={(words) => addItem(adding, null, words)}
            onPick={(exercise) => addItem(adding, exercise, exercise.name)}
          />
          <Button label="Cancel" variant="ghost" size="sm" onPress={() => setAdding(null)} style={s.gap} />
        </View>
      )}

      {blocker !== null ? <Text style={s.foot}>{blocker}</Text> : null}
      {problem ? <Text style={s.problem}>{problem}</Text> : null}
      <View style={s.actions}>
        <Button label="Discard" variant="ghost" busy={busy === 'discard'} disabled={busy !== null} onPress={() => void discard()} />
        <Button label="Save workout" variant="coral" style={s.grow} busy={busy === 'save'} disabled={busy !== null || blocker !== null || outside} onPress={() => void save()} />
      </View>
    </View>
  )
}

// Keeps the original workout text available while the user checks a manual review.
function YourText({ text }: { text: string }) {
  const s = useStyles()
  const [open, setOpen] = useState(false)
  return (
    <View style={s.card}>
      <Button label={open ? 'Hide your text' : 'Your text'} variant="ghost" size="sm" onPress={() => setOpen((value) => !value)} />
      {open ? <Text style={s.caption}>{text}</Text> : null}
    </View>
  )
}

type ItemHandlers = {
  onToggleMatch: () => void
  onMatch: (exercise: ExerciseLike | null) => void
  onRemove: () => void
  onSet: (setIndex: number, change: Partial<SetRow>) => void
  onAddSet: () => void
  onRemoveSet: (setIndex: number) => void
  onCardio: (change: Partial<CardioValues>) => void
}

// One exercise on the plate: its words, match chip, problems, and its sets or cardio fields.
function PlateItemCard({ item, known, matching, handlers }: { item: WorkoutItem; known: ExerciseLike[]; matching: boolean; handlers: ItemHandlers }) {
  const s = useStyles()
  const matched = matchedName(item, known)
  return (
    <View style={s.item}>
      <View style={s.itemHead}>
        <View style={s.grow}>
          <Text style={s.itemName}>{item.name}</Text>
          <Tap onPress={handlers.onToggleMatch} scale={0.97} style={[s.chip, matching && s.chipOn]} accessibilityRole="button" accessibilityLabel={`Match ${item.name}`}>
            <Text style={[s.chipText, matching && s.chipTextOn]} numberOfLines={1}>
              {matched ?? `Your words: ${item.name}`}
            </Text>
          </Tap>
        </View>
        <RoundButton icon="x" label={`Remove ${item.name}`} tone="plain" size={32} onPress={handlers.onRemove} />
      </View>
      {item.problems.map((text, i) => (
        <Text key={i} style={s.problem}>
          {text}
        </Text>
      ))}
      {matching ? <MatchPicker item={item} known={known} onPick={handlers.onMatch} /> : null}

      {item.kind === 'cardio' ? (
        <CardioFields value={item.cardio ?? {}} onChange={handlers.onCardio} />
      ) : (
        <View style={s.sets}>
          {item.sets.map((set, j) => (
            <View key={j} style={s.setRow}>
              <Text style={s.setNo}>{j + 1}</Text>
              <NumberField label={`Set ${j + 1} weight`} value={set.weightKg} suffix="kg" onChange={(weightKg) => handlers.onSet(j, { weightKg })} />
              <Tap
                onPress={() => handlers.onSet(j, { weightBasis: set.weightBasis === undefined ? 'each' : set.weightBasis === 'each' ? 'total' : undefined })}
                scale={0.95}
                style={s.chip}
                accessibilityRole="button"
                accessibilityLabel={`Set ${j + 1} weight basis, ${basisLabel(set.weightBasis)}`}
              >
                <Text style={s.chipText}>{basisLabel(set.weightBasis)}</Text>
              </Tap>
              <NumberField label={`Set ${j + 1} reps`} value={set.reps} suffix="reps" decimal={false} onChange={(reps) => handlers.onSet(j, { reps })} />
              <RoundButton icon="x" label={`Remove set ${j + 1}`} tone="plain" size={32} onPress={() => handlers.onRemoveSet(j)} />
            </View>
          ))}
          <Tap onPress={handlers.onAddSet} scale={0.98} style={s.addSet} accessibilityRole="button">
            <Text style={s.addSetText}>+ Add set</Text>
          </Tap>
        </View>
      )}
    </View>
  )
}

// Candidates, a search, and "Use my words" for one item. Only a tap here sets a catalog match.
function MatchPicker({ item, known, onPick }: { item: WorkoutItem; known: ExerciseLike[]; onPick: (exercise: ExerciseLike | null) => void }) {
  const t = useTheme()
  const s = useStyles()
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text.trim()), 250)
    return () => clearTimeout(timer)
  }, [text])
  const found = useQuery(api.exercises.search, debounced.length >= 2 ? { query: debounced, limit: 10 } : 'skip')
  const candidates = item.candidateIds.flatMap((id) => {
    const exercise = known.find((row) => row._id === id)
    return exercise ? [exercise] : []
  })
  // Search results must match the item's kind: cardio or not.
  const isCardio = item.kind === 'cardio'
  const options = debounced.length >= 2 ? (found ?? []).filter((exercise) => (exercise.category === 'cardio') === isCardio) : candidates

  return (
    <View style={s.picker}>
      <TextInput
        style={s.search}
        value={text}
        onChangeText={setText}
        placeholder="Search exercises"
        placeholderTextColor={t.c.ink3}
        autoCorrect={false}
        accessibilityLabel="Search exercises"
      />
      {options.map((exercise) => {
        const on = item.exerciseId === exercise._id
        return (
          <Tap key={exercise._id} style={[s.option, on && s.optionOn]} scale={0.98} onPress={() => onPick(exercise)} accessibilityRole="button">
            <Text style={[s.optionText, on && s.optionTextOn]} numberOfLines={1}>
              {exercise.name}
            </Text>
            <Text style={[s.optionSub, on && s.optionTextOn]}>{exercise.ownerId === undefined ? 'Library' : 'Your own'}</Text>
          </Tap>
        )
      })}
      {debounced.length >= 2 && found !== undefined && options.length === 0 ? <Text style={s.caption}>Nothing called that in the library.</Text> : null}
      <Tap onPress={() => onPick(null)} scale={0.98} style={s.option} accessibilityRole="button">
        <Text style={s.optionText}>Use my words</Text>
        <Text style={s.optionSub} numberOfLines={1}>
          {item.name}
        </Text>
      </Tap>
    </View>
  )
}

// Minutes, km and reported kcal for one cardio item. Speed and incline sit behind More.
export function CardioFields({ value, onChange }: { value: CardioValues; onChange: (change: Partial<CardioValues>) => void }) {
  const s = useStyles()
  const [more, setMore] = useState(value.speedKmh !== undefined || value.inclinePct !== undefined)
  return (
    <View style={s.cardio}>
      <View style={s.row}>
        <Field label="Minutes">
          <NumberField label="Minutes" value={value.durationMin} suffix="min" decimal={false} onChange={(durationMin) => onChange({ durationMin })} />
        </Field>
        <Field label="Distance">
          <NumberField label="Distance in km" value={value.distanceKm} suffix="km" onChange={(distanceKm) => onChange({ distanceKm })} />
        </Field>
        <Field label="Kcal, you reported" flex={1.3}>
          <NumberField label="Kcal you reported" value={value.reportedKcal} suffix="kcal" decimal={false} onChange={(reportedKcal) => onChange({ reportedKcal })} />
        </Field>
      </View>
      <Tap onPress={() => setMore(!more)} hitSlop={8} accessibilityRole="button" accessibilityLabel={more ? 'Hide speed and incline' : 'Show speed and incline'}>
        <Text style={s.more}>{more ? 'Less' : 'More'}</Text>
      </Tap>
      {more ? (
        <View style={s.row}>
          <Field label="Speed">
            <NumberField label="Speed in km/h" value={value.speedKmh} suffix="km/h" onChange={(speedKmh) => onChange({ speedKmh })} />
          </Field>
          <Field label="Incline">
            <NumberField label="Incline in percent" value={value.inclinePct} suffix="%" onChange={(inclinePct) => onChange({ inclinePct })} />
          </Field>
        </View>
      ) : null}
    </View>
  )
}

// A caption above a field.
function Field({ label, flex = 1, children }: { label: string; flex?: number; children: ReactNode }) {
  const s = useStyles()
  return (
    <View style={[s.field, { flex }]}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  )
}

// A number typed in place, with its unit. Blank means no value. Text that is not a number keeps the last good value.
function NumberField({ value, onChange, label, suffix, decimal = true }: { value: number | undefined; onChange: (next: number | undefined) => void; label: string; suffix: string; decimal?: boolean }) {
  const s = useStyles()
  const [text, setText] = useState(textOf(value))
  // Follows outside changes to the value, but keeps text the user is still typing when it already means the value.
  useEffect(() => {
    setText((typed) => (meansSame(typed, value) ? typed : textOf(value)))
  }, [value])

  // Passes on a typed number, or a blank. Unreadable text changes only what is shown.
  function type(next: string) {
    setText(next)
    if (next.trim() === '') onChange(undefined)
    else {
      const n = readNumber(next)
      if (n !== undefined) onChange(n)
    }
  }

  return (
    <View style={s.number}>
      <TextInput
        style={s.numberInput}
        value={text}
        onChangeText={type}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        selectTextOnFocus
        accessibilityLabel={label}
      />
      <Text style={s.numberSuffix}>{suffix}</Text>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  grow: { flex: 1 },
  note: { ...font('callout'), color: t.c.ink2, marginTop: 18 },
  eyebrow: { ...font('eyebrow'), color: t.c.ink3 },
  title: { ...font('section'), fontSize: 18, color: t.c.ink, marginTop: 4, marginBottom: 12 },
  card: { backgroundColor: t.c.card, borderRadius: 16, boxShadow: t.shadow.card, padding: 14, gap: 8, marginBottom: 8 },
  updated: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: t.c.card2, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 8 },
  noteText: { ...font('caption'), color: t.c.ink2, flex: 1 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  addItem: { flex: 1, paddingVertical: 11, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.c.line2, alignItems: 'center' },
  addItemText: { ...font('calloutStrong'), color: t.c.ink2 },
  gap: { marginTop: 8 },
  row: { flexDirection: 'row', gap: 8 },
  stack: { gap: 8 },
  caption: { ...font('caption'), color: t.c.ink3 },
  field: { flexShrink: 1, minWidth: 0 },
  fieldLabel: { ...font('tag'), color: t.c.ink3, marginBottom: 4 },
  input: { ...font('input'), color: t.c.ink, backgroundColor: t.c.card2, borderRadius: 14, height: 40, paddingHorizontal: 12 },
  number: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.c.card2, borderRadius: 14, paddingHorizontal: 10, height: 40, gap: 4 },
  numberInput: { ...font('value'), flex: 1, minWidth: 36, color: t.c.ink, padding: 0, fontVariant: ['tabular-nums'] },
  numberSuffix: { ...font('label'), color: t.c.ink3 },
  item: { backgroundColor: t.c.card, borderRadius: 16, boxShadow: t.shadow.card, padding: 14, paddingRight: 8, gap: 8, marginBottom: 8 },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemName: { ...font('bodyStrong'), color: t.c.ink },
  chip: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, borderRadius: radii.pill, backgroundColor: t.c.card2, marginTop: 4 },
  chipOn: { backgroundColor: t.c.ink },
  chipText: { ...font('caption'), color: t.c.ink2 },
  chipTextOn: { color: t.c.bg },
  problem: { ...font('caption'), color: t.c.poloInk },
  picker: { gap: 6, marginTop: 4 },
  search: { ...font('input'), color: t.c.ink, backgroundColor: t.c.card2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14, backgroundColor: t.c.card2 },
  optionOn: { backgroundColor: t.c.ink },
  optionText: { ...font('bodyStrong'), color: t.c.ink, flex: 1 },
  optionTextOn: { color: t.c.bg },
  optionSub: { ...font('caption'), color: t.c.ink3 },
  sets: { gap: 6 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  setNo: { ...font('label'), color: t.c.ink3, width: 14, textAlign: 'center' },
  addSet: { paddingVertical: 9, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.c.line2, alignItems: 'center' },
  addSetText: { ...font('calloutStrong'), color: t.c.ink2 },
  cardio: { gap: 8 },
  more: { ...font('link'), color: t.c.ink2 },
  foot: { ...font('caption'), color: t.c.ink3, marginTop: 4, marginHorizontal: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
}))
