import { useState } from 'react'
import { Text, View } from 'react-native'
import { useQuery } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { formatDayTitle } from '@/lib/format'
import { formatCardio } from '@/lib/strength'
import type { WorkoutDraftId } from '@/lib/workoutDraft'
import { font, themedStyles } from '@/theme'
import { Button } from './Controls'
import { matchedName, useUndoWorkoutDraft } from './WorkoutPlate'
import { useLog } from './useLog'

type CardState = 'pending' | 'saved' | 'undone' | 'discarded'
const STATUS_TEXT: Record<CardState, string> = { pending: 'Waiting for your check', saved: 'Saved', undone: 'Undone', discarded: 'Discarded' }

// One workout review the Coach prepared: its exercises, where it stands, and Review or Undo.
export function WorkoutCard({ draftId }: { draftId: WorkoutDraftId }) {
  const s = useStyles()
  const { openWorkout, toast } = useLog()
  const view = useQuery(api.workouts.draft, { draftId })
  const undoWorkout = useUndoWorkoutDraft(toast)
  const [busy, setBusy] = useState(false)
  if (view === undefined || view === null) return null

  const { draft, exercises } = view
  const state: CardState = draft.undoneAt !== undefined ? 'undone' : draft.status === 'committed' ? 'saved' : draft.status === 'pending' ? 'pending' : 'discarded'

  // Reverts the saved batch. The card follows the query, so it shows Undone once the revert lands.
  function undo() {
    setBusy(true)
    void undoWorkout(draftId).finally(() => setBusy(false))
  }

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.eyebrow}>Workout · {formatDayTitle(draft.localDate)}</Text>
        <Text style={s.status}>{STATUS_TEXT[state]}</Text>
      </View>
      {draft.items.map((item, i) => (
        <View key={i} style={s.line}>
          <Text style={s.name} numberOfLines={1}>
            {matchedName(item, exercises) ?? item.name}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            {item.kind === 'cardio' ? formatCardio(item.cardio ?? {}) : `${item.sets.length} ${item.sets.length === 1 ? 'set' : 'sets'}`}
          </Text>
        </View>
      ))}
      {state === 'pending' || state === 'saved' ? (
        <View style={s.actions}>
          {state === 'pending' ? <Button label="Review" size="sm" variant="coral" onPress={() => openWorkout(draftId)} /> : null}
          {state === 'saved' ? <Button label="Undo" size="sm" variant="ink" busy={busy} disabled={busy} onPress={undo} /> : null}
        </View>
      ) : null}
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  card: { backgroundColor: t.c.card, borderRadius: 16, boxShadow: t.shadow.card, padding: 14, gap: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  eyebrow: { ...font('tag'), color: t.c.ink3 },
  status: { ...font('calloutStrong'), color: t.c.ink },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, paddingVertical: 4 },
  name: { ...font('bodyStrong'), color: t.c.ink, flex: 1 },
  meta: { ...font('caption'), color: t.c.ink3, maxWidth: '55%', textAlign: 'right' },
  actions: { flexDirection: 'row', marginTop: 4 },
}))
