import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMutation, useQuery } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { layout, radii } from '@stride/ui-tokens'
import { Button, RoundButton, Thinking } from '@/components/Controls'
import { ExercisePicker } from '@/components/ExercisePicker'
import { Polo } from '@/components/Polo'
import { ExerciseBlock, type WorkoutActions } from '@/components/SetRows'
import { Sheet } from '@/components/Sheet'
import { Tap } from '@/components/Tap'
import { TimeZoneGate } from '@/components/TimeZoneGate'
import { Toast, type ToastMessage } from '@/components/Toast'
import { formatNumber } from '@/lib/format'
import { newSubmissionId, plainError } from '@/lib/log'
import { formatKg, formatSets, formatTonnage, type Exercise, type ExerciseId, type SessionDetail, type SessionId, type SetId } from '@/lib/strength'
import { font, themedStyles } from '@/theme'

// Leaves the workout screen, falling back to Progress when it was opened directly.
function leave() {
  if (router.canGoBack()) router.back()
  else router.replace('/progress')
}

// Workout route (mock #/workout and #/workout-done): resumes the open session from any day, or offers to start one.
export default function WorkoutScreen() {
  return (
    <TimeZoneGate>
      <Workout />
    </TimeZoneGate>
  )
}

// The workout itself, once the user's time zone is stored for today's date.
function Workout() {
  const s = useStyles()
  const open = useQuery(api.strength.activeSession, {})
  const [sessionId, setSessionId] = useState<SessionId | null>(null)
  const [message, setMessage] = useState<ToastMessage | null>(null)
  const toastId = useRef(0)
  const undoRevision = useMutation(api.strength.undoRevision)
  // Hold on to the resumed session so finishing it shows the summary instead of a fresh start.
  if (sessionId === null && open) setSessionId(open._id)
  const active = sessionId ?? open?._id ?? null

  const toast = useCallback((m: Omit<ToastMessage, 'id'>) => {
    toastId.current += 1
    setMessage({ ...m, id: toastId.current })
  }, [])
  const toastDone = useCallback((id: number) => setMessage((m) => (m?.id === id ? null : m)), [])
  const undoFor = useCallback(
    (setId: SetId) => () => {
      undoRevision({ submissionId: newSubmissionId(), setId }).then(
        () => toast({ title: 'Undone. Nothing lost.', sub: "It's back the way it was." }),
        (err: unknown) => toast({ title: "Couldn't undo that.", sub: plainError(err) }),
      )
    },
    [undoRevision, toast],
  )

  return (
    <View style={s.root}>
      {open === undefined ? (
        <Page>
          <Thinking label="Opening your workout…" />
        </Page>
      ) : active === null ? (
        <Start onStarted={setSessionId} toast={toast} />
      ) : (
        <Session sessionId={active} actions={{ toast, undoFor }} />
      )}
      <Toast message={message} onDone={toastDone} />
    </View>
  )
}

// Scrolling workout page with safe-area padding; an overlay such as the picker sheet sits above it.
function Page({ children, overlay }: { children: ReactNode; overlay?: ReactNode }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingBottom: insets.bottom + 120, paddingHorizontal: layout.screenX }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {overlay}
    </View>
  )
}

// Nothing open today: a friendly start card. Starting goes straight to the exercise picker.
function Start({ onStarted, toast }: { onStarted: (id: SessionId) => void; toast: WorkoutActions['toast'] }) {
  const s = useStyles()
  const startSession = useMutation(api.strength.startSession)
  const [busy, setBusy] = useState(false)
  // Kept across retries so a resend after a dropped reply starts one session.
  const submissionId = useRef(newSubmissionId())

  // Creates today's session on the server.
  async function start() {
    setBusy(true)
    try {
      onStarted(await startSession({ submissionId: submissionId.current }))
    } catch (err) {
      toast({ title: "Couldn't start the workout.", sub: plainError(err) })
      setBusy(false)
    }
  }

  return (
    <Page>
      <View style={s.head}>
        <RoundButton icon="x" label="Close" onPress={leave} />
      </View>
      <Animated.View entering={FadeInDown.springify()} style={s.startCard}>
        <Polo size={72} hop={1} />
        <Text style={s.eyebrowCenter}>Workout</Text>
        <Text style={s.bigTitle}>Ready to lift?</Text>
        <Text style={s.body}>Pick an exercise and log each set as you go. Last session's numbers show up as hints.</Text>
        <Button label="Start workout" icon="play" variant="coral" size="block" busy={busy} onPress={() => void start()} style={s.startButton} />
      </Animated.View>
    </Page>
  )
}

// A started session: live logging while open, the summary once finished. "Edit sets" reopens a finished one.
function Session({ sessionId, actions }: { sessionId: SessionId; actions: WorkoutActions }) {
  const detail = useQuery(api.strength.sessionDetail, { sessionId })
  const [editing, setEditing] = useState(false)
  if (detail === undefined)
    return (
      <Page>
        <Thinking label="Opening your workout…" />
      </Page>
    )
  if (detail.session.endedAt !== undefined && !editing) return <Summary detail={detail} onEdit={() => setEditing(true)} />
  return <Live detail={detail} actions={actions} onFinish={() => setEditing(false)} />
}

// Elapsed time from a start instant to an end instant (default now) as m:ss or h:mm:ss, ticking every second.
function useElapsed(since: number, until?: number): string {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const total = Math.max(0, Math.floor(((until ?? now) - since) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// Live session: timer and Finish (or Done when editing a finished one), progress bar, the current exercise's sets, and the session list.
function Live({ detail, actions, onFinish }: { detail: SessionDetail; actions: WorkoutActions; onFinish: () => void }) {
  const s = useStyles()
  const endSession = useMutation(api.strength.endSession)
  const ended = detail.session.endedAt !== undefined
  const elapsed = useElapsed(detail.session.startedAt, detail.session.endedAt)
  const [picked, setPicked] = useState<Exercise[]>([])
  const [currentId, setCurrentId] = useState<ExerciseId | null>(null)
  const [picking, setPicking] = useState(detail.exercises.length === 0)
  const [finishing, setFinishing] = useState(false)

  // Exercises with saved sets, then ones picked this session that have none yet.
  const list = [
    ...detail.exercises.map((e) => ({ exercise: e.exercise, sets: e.sets })),
    ...picked.filter((p) => !detail.exercises.some((e) => e.exercise._id === p._id)).map((exercise) => ({ exercise, sets: [] })),
  ]
  const current = list.find((e) => e.exercise._id === currentId) ?? list.at(-1)
  const currentIndex = current ? list.indexOf(current) : -1

  // Ends the session (a no-op when already finished), then leaves edit mode so the summary returns.
  async function finish() {
    setFinishing(true)
    try {
      await endSession({ sessionId: detail.session._id })
      onFinish()
    } catch (err) {
      actions.toast({ title: "Couldn't finish the workout.", sub: plainError(err) })
      setFinishing(false)
    }
  }

  return (
    <Page
      overlay={
        <Sheet open={picking} onClose={() => setPicking(false)}>
          <ExercisePicker
            taken={list.map((e) => e.exercise._id)}
            onPick={(exercise) => {
              setPicked((p) => (p.some((x) => x._id === exercise._id) ? p : [...p, exercise]))
              setCurrentId(exercise._id)
              setPicking(false)
            }}
          />
        </Sheet>
      }
    >
      <View style={s.head}>
        <RoundButton icon="x" label="Minimise workout" onPress={leave} />
        <View style={s.grow} />
        <Text style={s.timer} accessibilityLabel={`Elapsed ${elapsed}`}>
          {elapsed}
        </Text>
        <Button label={ended ? 'Done' : 'Finish'} size="sm" busy={finishing} disabled={!ended && detail.summary.setCount === 0} onPress={() => void finish()} />
      </View>

      {list.length > 0 ? (
        <View style={s.steps}>
          {list.map((e, i) => (
            <View key={e.exercise._id} style={[s.stepBar, e.sets.length > 0 && s.stepDone, i === currentIndex && s.stepCur]} />
          ))}
        </View>
      ) : null}

      {current ? (
        <ExerciseBlock
          key={current.exercise._id}
          sessionId={detail.session._id}
          exercise={current.exercise}
          sets={current.sets}
          position={`${currentIndex + 1} of ${list.length}`}
          actions={actions}
        />
      ) : (
        <Animated.View entering={FadeIn} style={s.startCard}>
          <Polo size={56} hop={1} />
          <Text style={s.emptyTitle}>Pick your first exercise.</Text>
          <Button label="Choose exercise" icon="plus" variant="ghost" size="sm" onPress={() => setPicking(true)} style={s.startButton} />
        </Animated.View>
      )}

      {list.length > 0 ? (
        <View style={s.upnext}>
          <Text style={[s.eyebrow, s.upnextLabel]}>Session</Text>
          {list.map((e, i) => (
            <Animated.View key={e.exercise._id} layout={LinearTransition.springify()} entering={FadeInDown.springify()}>
              <Tap
                style={s.upRow}
                scale={0.98}
                onPress={() => setCurrentId(e.exercise._id)}
                accessibilityRole="button"
                accessibilityState={{ selected: i === currentIndex }}
                accessibilityLabel={e.exercise.name}
              >
                <Text style={[s.upName, i === currentIndex && s.upNameCur]} numberOfLines={1}>
                  {e.exercise.name}
                </Text>
                <Text style={s.upMeta}>{e.sets.length === 0 ? 'no sets yet' : formatSets(e.sets)}</Text>
              </Tap>
            </Animated.View>
          ))}
          <Tap style={s.addEx} scale={0.98} onPress={() => setPicking(true)} accessibilityRole="button">
            <Text style={s.addExText}>+ Add exercise</Text>
          </Tap>
        </View>
      ) : null}
    </Page>
  )
}

// Finished session (mock #/workout-done): minutes, sets, kg moved, and what moved per exercise.
function Summary({ detail, onEdit }: { detail: SessionDetail; onEdit: () => void }) {
  const s = useStyles()
  const { session, summary } = detail
  const minutes = Math.max(1, Math.round(((session.endedAt ?? session.startedAt) - session.startedAt) / 60_000))

  return (
    <Page>
      <View style={s.head}>
        <View style={s.grow} />
        <Button label="Edit sets" size="sm" variant="ghost" onPress={onEdit} />
        <RoundButton icon="x" label="Close" onPress={leave} />
      </View>
      <View style={s.center}>
        <Polo size={76} mood="happy" hop={1} />
      </View>
      <Text style={[s.eyebrowCenter, s.doneEyebrow]}>{session.name ?? 'Workout'} · done</Text>
      <Text style={[s.bigTitle, s.centerText]}>{summary.newBests.length > 0 ? 'New best. Nice.' : 'Good session.'}</Text>

      <View style={s.stats3}>
        <Stat value={formatNumber(minutes)} label="minutes" index={0} />
        <Stat value={String(summary.setCount)} label={summary.setCount === 1 ? 'set' : 'sets'} index={1} />
        <Stat value={formatTonnage(summary.volumeKg)} label="kg moved" index={2} />
      </View>

      {detail.exercises.length > 0 ? (
        <Animated.View entering={FadeInDown.delay(240).springify()} style={s.card}>
          <Text style={s.eyebrow}>What moved</Text>
          {detail.exercises.map((e, i) => {
            const best = summary.newBests.find((b) => b.exerciseId === e.exercise._id)
            return (
              <View key={e.exercise._id} style={[s.lrow, i < detail.exercises.length - 1 && s.lrowLine]}>
                <View style={s.grow}>
                  <Text style={s.lname} numberOfLines={1}>
                    {e.exercise.name}
                  </Text>
                  <Text style={s.lsub}>{formatSets(e.sets)}</Text>
                </View>
                {best ? (
                  <Text style={s.gain}>
                    {best.previousBestKg === null ? `e1RM ${formatKg(best.e1rmKg)}` : `e1RM ${formatKg(best.previousBestKg)} → ${formatKg(best.e1rmKg)}`}
                  </Text>
                ) : (
                  <Text style={s.holding}>holding</Text>
                )}
              </View>
            )
          })}
        </Animated.View>
      ) : null}

      <Button label="Done" size="block" onPress={leave} style={s.doneButton} />
    </Page>
  )
}

// One of the three summary tiles, springing in one after another.
function Stat({ value, label, index }: { value: string; label: string; index: number }) {
  const s = useStyles()
  return (
    <Animated.View entering={FadeInDown.delay(80 * index).springify()} style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </Animated.View>
  )
}

const useStyles = themedStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.bg },
  grow: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timer: {
    ...font('value'),
    fontSize: 15,
    color: t.c.ink,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: t.c.card2,
    overflow: 'hidden',
    fontVariant: ['tabular-nums'],
  },
  steps: { flexDirection: 'row', gap: 5, marginTop: 22 },
  stepBar: { flex: 1, height: 4, borderRadius: 3, backgroundColor: t.c.card2 },
  stepDone: { backgroundColor: t.c.ink },
  stepCur: { backgroundColor: t.c.polo },
  eyebrow: { ...font('eyebrow'), color: t.c.ink3 },
  eyebrowCenter: { ...font('eyebrow'), color: t.c.ink3, marginTop: 14, textAlign: 'center' },
  bigTitle: { ...font('screenTitle'), color: t.c.ink, marginTop: 8, textAlign: 'center' },
  body: { ...font('callout'), color: t.c.ink2, textAlign: 'center', marginTop: 8 },
  emptyTitle: { ...font('emptyTitle'), color: t.c.ink, marginTop: 12 },
  startCard: {
    marginTop: 28,
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 18,
    backgroundColor: t.c.card,
    borderRadius: radii.card,
    boxShadow: t.shadow.card,
  },
  startButton: { marginTop: 18 },
  upnext: { marginTop: 28 },
  upnextLabel: { marginBottom: 4 },
  upRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 2, borderBottomWidth: 1, borderBottomColor: t.c.line },
  upName: { ...font('body'), fontSize: 14.5, color: t.c.ink, flex: 1 },
  upNameCur: { fontFamily: font('bodyStrong').fontFamily },
  upMeta: { ...font('label'), fontSize: 13, color: t.c.ink3, flexShrink: 1, textAlign: 'right' },
  addEx: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.c.line2,
    alignItems: 'center',
  },
  addExText: { ...font('callout'), fontFamily: font('bodyStrong').fontFamily, color: t.c.ink2 },
  center: { alignItems: 'center', marginTop: 18 },
  centerText: { textAlign: 'center', fontSize: 38, lineHeight: 40 },
  doneEyebrow: { marginTop: 16 },
  stats3: { flexDirection: 'row', gap: 10, marginTop: 22 },
  stat: { flex: 1, backgroundColor: t.c.card, borderRadius: radii.md, padding: 14, boxShadow: t.shadow.card },
  statValue: { ...font('metric'), fontSize: 24, lineHeight: 28, color: t.c.ink, fontVariant: ['tabular-nums'] },
  statLabel: { ...font('label'), color: t.c.ink3, marginTop: 2 },
  card: { marginTop: 12, backgroundColor: t.c.card, borderRadius: radii.card, padding: layout.cardPadding, boxShadow: t.shadow.card },
  lrow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  lrowLine: { borderBottomWidth: 1, borderBottomColor: t.c.line },
  lname: { ...font('bodyStrong'), color: t.c.ink },
  lsub: { ...font('caption'), color: t.c.ink3, marginTop: 2 },
  gain: { ...font('calloutStrong'), color: t.c.fat, fontVariant: ['tabular-nums'] },
  holding: { ...font('calloutStrong'), color: t.c.ink3 },
  doneButton: { marginTop: 18 },
}))
