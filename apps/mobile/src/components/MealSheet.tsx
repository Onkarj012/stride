import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated'
import { useMutation, useQuery } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { radii } from '@stride/ui-tokens'
import { clockOf, formatClock, formatGrams, formatNumber } from '@/lib/format'
import { SLOTS, SLOT_NAMES, newSubmissionId, plainError, type EntryId, type EntryView, type MealSlot } from '@/lib/log'
import { useLocalToday } from '@/lib/useLocalToday'
import { font, themedStyles, useTheme } from '@/theme'
import { Button, RoundButton, Stepper, Thinking } from './Controls'
import { useLog } from './LogProvider'
import { groupMeals } from './Meals'
import { Tap } from './Tap'

const SAVE_AFTER_MS = 700

// Edit one meal (mock #/meal): grams per item, move the meal, remove items or the whole meal. Every change is a revision with undo.
export function MealSheet({ localDate, slot, onClose }: { localDate: string; slot: MealSlot; onClose: () => void }) {
  const t = useTheme()
  const s = useStyles()
  const { toast, undoFor, compose } = useLog()
  const entries = useQuery(api.entries.entriesForDay, { localDate })
  const today = useLocalToday()
  const editEntry = useMutation(api.entries.editEntry)
  const deleteEntry = useMutation(api.entries.deleteEntry)
  const [busy, setBusy] = useState(false)
  const [savingRows, setSavingRows] = useState(0)
  const locked = busy || savingRows > 0
  const meal = entries === undefined ? undefined : groupMeals(entries).find((m) => m.slot === slot)

  useEffect(() => {
    if (entries !== undefined && !meal && !busy) onClose()
  }, [entries, meal, busy, onClose])

  if (entries === undefined) return <Thinking label="Opening the meal…" />
  if (!meal) return <Text style={s.hint}>Nothing here anymore.</Text>

  // Runs one revision per entry, then offers a single undo for all of them.
  async function each(run: (e: EntryView, submissionId: string) => Promise<EntryId>, title: string, sub?: string) {
    if (!meal) return
    setBusy(true)
    const base = newSubmissionId()
    try {
      const ids = await Promise.all(meal.entries.map((e, i) => run(e, `${base}-${i}`)))
      toast({ title, sub, undo: undoFor(ids) })
      onClose()
    } catch (err) {
      toast({ title: "Couldn't save that.", sub: plainError(err) })
    } finally {
      setBusy(false)
    }
  }

  const name = SLOT_NAMES[meal.slot]
  return (
    <View>
      <View style={s.head}>
        <View style={s.grow}>
          <Text style={s.eyebrow}>{formatClock(clockOf(meal.firstAt), true)}</Text>
          <Text style={s.title}>{name}</Text>
        </View>
        <Text style={s.big}>
          {formatNumber(meal.kcal)}
          <Text style={s.bigUnit}> kcal</Text>
        </Text>
      </View>

      <View style={s.moveRow}>
        {SLOTS.map((other) => (
          <Tap
            key={other}
            style={[s.chip, other === meal.slot && s.chipOn]}
            scale={0.94}
            disabled={locked || other === meal.slot}
            onPress={() =>
              void each(
                (e, submissionId) => editEntry({ submissionId, entryId: e._id, slot: other }),
                `Moved to ${SLOT_NAMES[other]}`,
              )
            }
            accessibilityRole="button"
            accessibilityState={{ selected: other === meal.slot }}
            accessibilityLabel={`Move to ${SLOT_NAMES[other]}`}
          >
            <Text style={[s.chipText, other === meal.slot && { color: t.c.bg }]}>{SLOT_NAMES[other]}</Text>
          </Tap>
        ))}
      </View>

      <View style={s.list}>
        {meal.entries.map((entry, i) => (
          <EntryRow key={entry.entryKey} entry={entry} last={i === meal.entries.length - 1} blocked={busy}
            onSaving={(saving) => setSavingRows((count) => count + (saving ? 1 : -1))}
          />
        ))}
      </View>

      {localDate === today ? (
        <Tap
          style={s.add}
          scale={0.98}
          onPress={() => compose('text', slot)}
          accessibilityRole="button"
        >
          <Text style={s.addText}>+ Add to {name.toLowerCase()}</Text>
        </Tap>
      ) : null}
      <Text style={s.hint}>Edits save as you go. Every change keeps the old version, so undo always works.</Text>
      <View style={s.actions}>
        <Button
          label="Delete meal"
          icon="trash"
          variant="ghost"
          disabled={locked}
          onPress={() =>
            void each(
              (e, submissionId) => deleteEntry({ submissionId, entryId: e._id }),
              `Deleted ${name} · ${formatNumber(meal.kcal)} kcal`,
              'Every version is kept.',
            )
          }
        />
        <View style={s.grow} />
        <Button label="Done" onPress={onClose} />
      </View>
    </View>
  )
}

// One food in the meal: grams stepper that saves after a pause, and a remove button.
function EntryRow({ entry, last, blocked, onSaving }: {
  entry: EntryView
  last: boolean
  blocked: boolean
  onSaving: (saving: boolean) => void
}) {
  const s = useStyles()
  const { toast, undoFor } = useLog()
  const editEntry = useMutation(api.entries.editEntry)
  const deleteEntry = useMutation(api.entries.deleteEntry)
  const [shown, setShown] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const pending = useRef<number | null>(null)
  const displayed = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const head = useRef({ id: entry._id, revision: entry.revision, grams: entry.grams })
  const observed = useRef(entry)
  observed.current = entry
  const inFlight = useRef(false)
  const removing = useRef(false)
  const mounted = useRef(true)
  const locked = useRef(false)
  const callbacks = useRef({ onSaving, toast, undoFor })
  callbacks.current = { onSaving, toast, undoFor }
  if (entry.revision > head.current.revision) head.current = { id: entry._id, revision: entry.revision, grams: entry.grams }

  // Keeps meal actions disabled until the saved revision reaches the subscription.
  function markSaving(value: boolean) {
    if (locked.current === value) return
    locked.current = value
    callbacks.current.onSaving(value)
    if (mounted.current) setSaving(value)
  }

  useEffect(() => {
    if (!removing.current && !inFlight.current && pending.current === null && entry.revision >= head.current.revision) {
      displayed.current = null
      setShown(null)
      markSaving(false)
    }
  }, [entry.revision, entry.grams])

  // Saves queued amounts in order, using each returned revision for the next edit.
  async function flush() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (inFlight.current || pending.current === null) return
    inFlight.current = true
    try {
      while (pending.current !== null) {
        const grams = pending.current
        pending.current = null
        const before = head.current
        const revision = await editEntry({ submissionId: newSubmissionId(), entryId: before.id, grams })
        if (head.current.revision <= before.revision + 1) {
          head.current = { id: revision, revision: before.revision + 1, grams }
        }
        if (pending.current === null) {
          callbacks.current.toast({ title: 'Amount saved', undo: callbacks.current.undoFor([revision]) })
        }
      }
    } catch (err) {
      pending.current = null
      displayed.current = null
      if (mounted.current) setShown(null)
      markSaving(false)
      callbacks.current.toast({ title: "Couldn't save that amount.", sub: plainError(err) })
    } finally {
      inFlight.current = false
      if (pending.current === null && observed.current.revision >= head.current.revision) {
        displayed.current = null
        if (mounted.current) setShown(null)
        markSaving(false)
      }
    }
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      markSaving(false)
      void flush()
    }
  }, [])

  // Locks the row and meal until the deleted revision removes this row from the subscription.
  async function remove() {
    if (locked.current || blocked) return
    removing.current = true
    markSaving(true)
    try {
      const revision = await deleteEntry({ submissionId: newSubmissionId(), entryId: head.current.id })
      callbacks.current.toast({ title: `Removed ${entry.foodName}`, sub: 'Every version is kept.', undo: callbacks.current.undoFor([revision]) })
    } catch (err) {
      removing.current = false
      markSaving(false)
      callbacks.current.toast({ title: "Couldn't remove that.", sub: plainError(err) })
    }
  }

  // Steps the amount locally and schedules the save.
  function step(direction: -1 | 1) {
    if (blocked || removing.current) return
    const g = pending.current ?? displayed.current ?? head.current.grams
    const size = g < 50 ? 5 : g < 200 ? 10 : 25
    const next = Math.min(5000, Math.max(size, Math.round((g + direction * size) / size) * size))
    pending.current = next
    displayed.current = next
    markSaving(true)
    setShown(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS)
  }

  const grams = shown ?? entry.grams
  // Display only until the save lands: the server's per-gram values times the new grams.
  const ratio = grams / entry.grams
  const source = entry.flags.includes('estimated') ? 'estimated' : entry.source === 'barcode' ? 'barcode' : 'IFCT · USDA'
  return (
    <Animated.View layout={LinearTransition.springify()} exiting={FadeOut} style={[s.row, !last && s.rowLine]}>
      <View style={s.grow}>
        <Text style={s.food} numberOfLines={2}>
          {entry.foodName}
        </Text>
        <Text style={s.sub}>
          {formatNumber(entry.nutrients.kcal * ratio)} kcal · {Math.round(entry.nutrients.protein * ratio)} g P · {source}
        </Text>
      </View>
      <Stepper value={formatGrams(grams)} label={entry.foodName} onStep={step} />
      <RoundButton icon="x" label={`Remove ${entry.foodName}`} tone="plain" size={36} disabled={saving || blocked} onPress={() => void remove()} />
    </Animated.View>
  )
}

const useStyles = themedStyles((t) => ({
  grow: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  eyebrow: { ...font('eyebrow'), color: t.c.ink3 },
  title: { ...font('screenTitle'), fontSize: 26, lineHeight: 28, color: t.c.ink, marginTop: 4 },
  big: { ...font('screenTitle'), fontSize: 32, color: t.c.ink },
  bigUnit: { ...font('heroUnit'), color: t.c.ink3 },
  moveRow: { flexDirection: 'row', gap: 6, marginTop: 16 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: t.c.card2 },
  chipOn: { backgroundColor: t.c.ink },
  chipText: { ...font('buttonSmall'), color: t.c.ink2 },
  list: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: t.c.line },
  food: { ...font('bodyStrong'), color: t.c.ink },
  sub: { ...font('caption'), color: t.c.ink3, marginTop: 2 },
  add: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.c.line2,
    alignItems: 'center',
  },
  addText: { ...font('callout'), fontFamily: font('bodyStrong').fontFamily, color: t.c.ink2 },
  hint: { ...font('caption'), lineHeight: 19, color: t.c.ink3, marginTop: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
}))
