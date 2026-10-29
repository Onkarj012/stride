import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { FlatList, ScrollView, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native'
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated'
import { router, useIsFocused, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { FunctionReturnType } from 'convex/server'
import { useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react'
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
import { CardioFields, usePlainWorkouts, WorkoutPlate, type CardioValues } from '@/components/WorkoutPlate'
import { formatDayTitle, formatNumber } from '@/lib/format'
import { newSubmissionId, plainError } from '@/lib/log'
import { formatCardio, formatKg, formatSets, formatTonnage, type Exercise, type ExerciseId, type SessionDetail, type SessionId, type SetId } from '@/lib/strength'
import type { WorkoutDraftId } from '@/lib/workoutDraft'
import { font, themedStyles, useTheme } from '@/theme'

// An exercise lined up by a repeat, with the set count it had last time as its target.
type Planned = { exercise: Exercise; sets: number }
type RecentWorkout = FunctionReturnType<typeof api.strength.recentWorkouts>[number]

// Exercises lined up by a repeat, per session. Survives leaving the screen but not an app restart (prototype; a server field would make it durable).
const plannedBySession = new Map<SessionId, Planned[]>()

// Leaves the workout screen, falling back to Progress when it was opened directly.
function leave() {
  if (router.canGoBack()) router.back()
  else router.replace('/progress')
}

// The exercises of a finished workout, each with its set count as the target for a repeat.
function planOf(workout: RecentWorkout): Planned[] {
  return workout.exercises.map((e) => ({ exercise: e.exercise, sets: e.sets }))
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
  const { view } = useLocalSearchParams<{ view?: string }>()
  const [browsing, setBrowsing] = useState(view === 'history')
  const open = useQuery(api.strength.activeSession, {})
  const plain = usePlainWorkouts()
  const [sessionId, setSessionId] = useState<SessionId | null>(null)
  const [message, setMessage] = useState<ToastMessage | null>(null)
  const toastId = useRef(0)
  const undoRevision = useMutation(api.strength.undoRevision)
  // The workout review sheet. It stays mounted while it slides away, then forgets its draft.
  const [review, setReview] = useState<WorkoutDraftId | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
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
  // Shows the review for a workout that was read, copied or typed.
  const openReview = useCallback((draftId: WorkoutDraftId) => {
    setReview(draftId)
    setReviewOpen(true)
  }, [])

  return (
    <View style={s.root}>
      {browsing ? (
        <SavedWorkouts onSelect={(id) => {
          setSessionId(id)
          setBrowsing(false)
        }} />
      ) : open === undefined ? (
        <Page>
          <Thinking label="Opening your workout…" />
        </Page>
      ) : active === null ? (
        <Start
          plain={plain}
          onStarted={(id, lined) => {
            plannedBySession.set(id, lined)
            setSessionId(id)
          }}
          onHistory={() => setBrowsing(true)}
          onReview={openReview}
          toast={toast}
        />
      ) : (
        <Session key={active} sessionId={active} actions={{ toast, undoFor }} plain={plain} onReview={openReview} />
      )}
      <Toast message={message} onDone={toastDone} />
      <Sheet open={reviewOpen} onClose={() => setReviewOpen(false)} onClosed={() => setReview(null)}>
        {review !== null ? <WorkoutPlate key={review} draftId={review} toast={toast} onDone={() => setReviewOpen(false)} /> : null}
      </Sheet>
    </View>
  )
}

// Saved workouts, loaded a page at a time as the list nears its end; selecting one opens its editable summary.
function SavedWorkouts({ onSelect }: { onSelect: (id: SessionId) => void }) {
  const s = useStyles()
  const insets = useSafeAreaInsets()
  const { results, status, loadMore } = usePaginatedQuery(api.strength.savedSessions, {}, { initialNumItems: 20 })
  return (
    <FlatList
      data={results}
      keyExtractor={(session) => session._id}
      renderItem={({ item: session }) => (
        <Tap style={s.upRow} onPress={() => onSelect(session._id)} accessibilityRole="button" accessibilityLabel={`Open ${session.name ?? 'Workout'}, ${formatDayTitle(session.localDate)}`}>
          <Text style={s.upName}>{session.name ?? 'Workout'}</Text>
          <Text style={s.upMeta}>{formatDayTitle(session.localDate)} · {session.endedAt === undefined ? 'open' : 'done'}</Text>
        </Tap>
      )}
      onEndReached={() => {
        if (status === 'CanLoadMore') loadMore(20)
      }}
      ListHeaderComponent={
        <>
          <RoundButton icon="x" label="Close" onPress={leave} />
          <Text style={s.bigTitle}>Saved workouts</Text>
        </>
      }
      ListEmptyComponent={status === 'LoadingFirstPage' ? <Thinking label="Opening saved workouts…" /> : <Text style={s.body}>No saved workouts yet.</Text>}
      ListFooterComponent={status === 'CanLoadMore' || status === 'LoadingMore' ? <Button label="More workouts" variant="ghost" size="block" busy={status === 'LoadingMore'} onPress={() => loadMore(20)} style={s.startButton} /> : null}
      contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingBottom: insets.bottom + 120, paddingHorizontal: layout.screenX }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    />
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

// Nothing open today: a friendly start card. Starting goes straight to the exercise picker, or to a repeated workout's exercises.
function Start({
  plain,
  onStarted,
  onHistory,
  onReview,
  toast,
}: {
  plain: boolean
  onStarted: (id: SessionId, plan: Planned[]) => void
  onHistory: () => void
  onReview: (draftId: WorkoutDraftId) => void
  toast: WorkoutActions['toast']
}) {
  const s = useStyles()
  const startSession = useMutation(api.strength.startSession)
  const draftFromSession = useMutation(api.workouts.draftFromSession)
  const [busy, setBusy] = useState(false)
  // Kept across retries so a resend after a dropped reply starts one session.
  const submissionId = useRef(newSubmissionId())
  // The repeated workout whose choice sheet is open, with the id its copy uses.
  const [choice, setChoice] = useState<{ workout: RecentWorkout; submissionId: string } | null>(null)
  const [choosing, setChoosing] = useState(false)

  // Creates today's session on the server, lining up the given exercises (none for a plain start).
  async function start(plan: Planned[]) {
    setBusy(true)
    try {
      onStarted(await startSession({ submissionId: submissionId.current }), plan)
      if (plan.length > 0) toast({ title: "Same again. Let's go.", sub: `${plan.length} exercises lined up.` })
    } catch (err) {
      toast({ title: "Couldn't start the workout.", sub: plainError(err) })
      setBusy(false)
    }
  }

  // Repeating starts live as before, or opens the choice when words logging is on.
  function repeat(workout: RecentWorkout) {
    if (plain) {
      setChoice({ workout, submissionId: newSubmissionId() })
      setChoosing(true)
    } else void start(planOf(workout))
  }

  // Copies a finished workout into a review for today, then opens the review.
  async function copy(picked: { workout: RecentWorkout; submissionId: string }, mode: 'names' | 'everything') {
    setBusy(true)
    try {
      const draftId = await draftFromSession({ submissionId: picked.submissionId, sessionId: picked.workout.sessionId, copy: mode })
      setChoosing(false)
      onReview(draftId)
    } catch (err) {
      toast({ title: "Couldn't copy that workout.", sub: plainError(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      overlay={
        <Sheet open={choosing} onClose={() => setChoosing(false)} onClosed={() => setChoice(null)}>
          {choice ? (
            <View>
              <Text style={s.sheetEyebrow}>Repeat</Text>
              <Text style={s.sheetTitle}>{`${choice.workout.name ?? 'Workout'} · ${formatDayTitle(choice.workout.localDate)}`}</Text>
              <Text style={s.sheetBody}>Start it live, or copy it into a review you check before it saves.</Text>
              <Button label="Start live" size="block" busy={busy} disabled={busy} onPress={() => { setChoosing(false); void start(planOf(choice.workout)) }} />
              <Button label="Copy exercises" variant="ghost" size="block" disabled={busy} onPress={() => void copy(choice, 'names')} style={s.gap} />
              <Button label="Copy everything" variant="ghost" size="block" disabled={busy} onPress={() => void copy(choice, 'everything')} style={s.gap} />
            </View>
          ) : null}
        </Sheet>
      }
    >
      <View style={s.head}>
        <RoundButton icon="x" label="Close" onPress={leave} />
      </View>
      <Animated.View entering={FadeInDown.springify()} style={s.startCard}>
        <Polo size={72} hop={1} />
        <Text style={s.eyebrowCenter}>Workout</Text>
        <Text style={s.bigTitle}>Ready to lift?</Text>
        <Text style={s.body}>Pick an exercise and log each set as you go. Last session's numbers show up as hints.</Text>
        <Button label="Start workout" icon="play" variant="coral" size="block" busy={busy} onPress={() => void start([])} style={s.startButton} />
        <Button label="Saved workouts" variant="ghost" size="block" onPress={onHistory} style={s.startButton} />
      </Animated.View>
      {plain ? <WordsEntry title="Log in words" placeholder="Bench 60 kg, 8, 8, 6 reps. Walking 10 min, 60 kcal." onReview={onReview} /> : null}
      <RepeatSection disabled={busy} onPick={repeat} />
    </Page>
  )
}

// Typed or pasted workout text, read into a review. A failure keeps the text and offers Retry or entering it by hand.
function WordsEntry({ sessionId, title, placeholder, onReview }: { sessionId?: SessionId; title: string; placeholder: string; onReview: (draftId: WorkoutDraftId) => void }) {
  const s = useStyles()
  const t = useTheme()
  const parseWorkout = useAction(api.workouts.parse)
  const blankDraft = useMutation(api.workouts.blankDraft)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'read' | 'hand' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // Kept across retries, so a resend after a dropped reply makes one review.
  const submission = useRef(newSubmissionId())
  const target = sessionId === undefined ? {} : { sessionId }

  // Reads the text into a review. A retry reuses the submission id, and a failed read writes nothing.
  async function read() {
    setBusy('read')
    setProblem(null)
    try {
      const { draftId } = await parseWorkout({ submissionId: submission.current, text: text.trim(), ...target })
      submission.current = newSubmissionId()
      setText('')
      onReview(draftId)
    } catch (err) {
      setProblem(plainError(err))
    } finally {
      setBusy(null)
    }
  }

  // Makes an empty review that keeps the typed text, for entering the workout by hand.
  async function byHand() {
    setBusy('hand')
    setProblem(null)
    try {
      const draftId = await blankDraft({ submissionId: newSubmissionId(), text: text.trim(), ...target })
      setText('')
      onReview(draftId)
    } catch (err) {
      setProblem(plainError(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <View style={s.words}>
      <Text style={s.eyebrow}>{title}</Text>
      <TextInput
        style={s.wordsInput}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={t.c.ink3}
        multiline
        textAlignVertical="top"
        editable={busy === null}
        accessibilityLabel={title}
      />
      {problem ? <Text style={s.problem}>{problem}</Text> : null}
      <View style={s.wordsActions}>
        <Button
          label={problem ? 'Retry' : 'Read'}
          variant={problem ? 'ghost' : 'coral'}
          size="sm"
          busy={busy === 'read'}
          disabled={busy !== null || text.trim() === ''}
          onPress={() => void read()}
        />
        {problem ? <Button label="Enter by hand" variant="ghost" size="sm" busy={busy === 'hand'} disabled={busy !== null} onPress={() => void byHand()} /> : null}
      </View>
    </View>
  )
}

// The three most recent finished workouts that have exercises, each one tap from starting again. Hidden while loading or when there are none.
function RepeatSection({ disabled, onPick }: { disabled: boolean; onPick: (workout: RecentWorkout) => void }) {
  const s = useStyles()
  const workouts = useQuery(api.strength.recentWorkouts, { limit: 3 })
  if (workouts === undefined || workouts.length === 0) return null
  return (
    <View>
      <Text style={[s.eyebrow, s.repeatLabel]}>Repeat a recent workout</Text>
      <Animated.View entering={FadeInDown.springify()} style={s.repeatCard}>
        {workouts.map((workout) => (
          <RepeatRow key={workout.sessionId} workout={workout} disabled={disabled} onPick={onPick} />
        ))}
      </Animated.View>
    </View>
  )
}

// One recent workout: its name, day, exercises, and set count. Tapping it hands the workout to the caller to repeat.
function RepeatRow({ workout, disabled, onPick }: { workout: RecentWorkout; disabled: boolean; onPick: (workout: RecentWorkout) => void }) {
  const s = useStyles()
  const plan = planOf(workout)
  const setCount = plan.reduce((total, e) => total + e.sets, 0)
  const title = `${workout.name ?? 'Workout'} · ${formatDayTitle(workout.localDate)}`
  return (
    <Tap style={s.repeatRow} disabled={disabled} onPress={() => onPick(workout)} accessibilityRole="button" accessibilityLabel={`Repeat ${title}`}>
      <Text style={s.repeatTitle}>{title}</Text>
      <Text style={s.repeatMeta} numberOfLines={1}>
        {`${plan.map((e) => e.exercise.name).join(', ')} · ${setCount} sets`}
      </Text>
    </Tap>
  )
}

// A started session: live logging while open, the summary once finished. "Edit sets" reopens a finished one.
function Session({ sessionId, actions, plain, onReview }: { sessionId: SessionId; actions: WorkoutActions; plain: boolean; onReview: (draftId: WorkoutDraftId) => void }) {
  const detail = useQuery(api.strength.sessionDetail, { sessionId })
  const [editing, setEditing] = useState(false)
  if (detail === undefined)
    return (
      <Page>
        <Thinking label="Opening your workout…" />
      </Page>
    )
  if (detail.session.endedAt !== undefined && !editing) return <Summary detail={detail} onEdit={() => setEditing(true)} />
  return <Live detail={detail} plan={plannedBySession.get(sessionId) ?? []} actions={actions} plain={plain} onReview={onReview} onFinish={() => setEditing(false)} />
}

// Elapsed time from a start to an end instant (default now) as m:ss or h:mm:ss. Only a live timer ticks, and only while the screen is focused.
function Elapsed({ since, until, style }: { since: number; until?: number; style: StyleProp<TextStyle> }) {
  const focused = useIsFocused()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (until !== undefined || !focused) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [until, focused])
  const total = Math.max(0, Math.floor(((until ?? now) - since) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(total % 60).padStart(2, '0')
  const text = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
  return (
    <Text style={style} accessibilityLabel={`Elapsed ${text}`}>
      {text}
    </Text>
  )
}

// Live session: timer and Finish (or Done when editing a finished one), progress bar, the current exercise's sets, cardio, and the session list.
function Live({
  detail,
  plan,
  actions,
  plain,
  onReview,
  onFinish,
}: {
  detail: SessionDetail
  plan: Planned[]
  actions: WorkoutActions
  plain: boolean
  onReview: (draftId: WorkoutDraftId) => void
  onFinish: () => void
}) {
  const s = useStyles()
  const endSession = useMutation(api.strength.endSession)
  const ended = detail.session.endedAt !== undefined
  const [picked, setPicked] = useState<Exercise[]>(plan.map((p) => p.exercise))
  const [currentId, setCurrentId] = useState<ExerciseId | null>(plan[0]?.exercise._id ?? null)
  const [picking, setPicking] = useState(detail.exercises.length === 0 && plan.length === 0)
  // The cardio sheet: first the activity, then its amounts. The step resets once the sheet has closed.
  const [cardioOpen, setCardioOpen] = useState(false)
  const [cardioStep, setCardioStep] = useState<'pick' | Exercise>('pick')
  const [finishing, setFinishing] = useState(false)
  // Set counts from the repeated workout, keyed by exercise.
  const targets = new Map(plan.map((p) => [p.exercise._id, p.sets]))

  // Exercises with saved sets, then ones picked this session that have none yet.
  const list = [
    ...detail.exercises.map((e) => ({ exercise: e.exercise, sets: e.sets, target: targets.get(e.exercise._id) })),
    ...picked.filter((p) => !detail.exercises.some((e) => e.exercise._id === p._id)).map((exercise) => ({ exercise, sets: [], target: targets.get(exercise._id) })),
  ]
  const current = list.find((e) => e.exercise._id === currentId) ?? list.at(-1)
  const currentIndex = current ? list.indexOf(current) : -1
  const currentDetail = detail.exercises.find((e) => e.exercise._id === current?.exercise._id)

  // Ends the session (a no-op when already finished), then leaves edit mode so the summary returns.
  async function finish() {
    setFinishing(true)
    try {
      await endSession({ sessionId: detail.session._id })
      plannedBySession.delete(detail.session._id)
      onFinish()
    } catch (err) {
      actions.toast({ title: "Couldn't finish the workout.", sub: plainError(err) })
      setFinishing(false)
    }
  }

  return (
    <Page
      overlay={
        <>
          <Sheet open={picking && !ended} onClose={() => setPicking(false)}>
            <ExercisePicker
              taken={list.map((e) => e.exercise._id)}
              allowOwn={plain}
              onPick={(exercise) => {
                setPicked((p) => (p.some((x) => x._id === exercise._id) ? p : [...p, exercise]))
                setCurrentId(exercise._id)
                setPicking(false)
              }}
            />
          </Sheet>
          <Sheet open={cardioOpen && !ended} onClose={() => setCardioOpen(false)} onClosed={() => setCardioStep('pick')}>
            {cardioStep === 'pick' ? (
              <ExercisePicker taken={[]} kind="cardio" allowOwn onPick={(exercise) => setCardioStep(exercise)} />
            ) : (
              <AddCardio sessionId={detail.session._id} exercise={cardioStep} actions={actions} onDone={() => setCardioOpen(false)} />
            )}
          </Sheet>
        </>
      }
    >
      <View style={s.head}>
        <RoundButton icon="x" label="Minimise workout" onPress={leave} />
        <View style={s.grow} />
        {detail.session.timing === 'logged' ? null : <Elapsed since={detail.session.startedAt} until={detail.session.endedAt} style={s.timer} />}
        <Button label={ended ? 'Done' : 'Finish'} size="sm" busy={finishing} onPress={() => void finish()} />
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
          previousSets={currentDetail?.previousSets}
          historyLimited={currentDetail?.historyLimited ?? false}
          position={`${currentIndex + 1} of ${list.length}`}
          target={current.target}
          finished={ended}
          actions={actions}
        />
      ) : (
        <Animated.View entering={FadeIn} style={s.startCard}>
          <Polo size={56} hop={1} />
          <Text style={s.emptyTitle}>{ended ? 'No sets to edit.' : 'Pick your first exercise.'}</Text>
          {ended ? null : <Button label="Choose exercise" icon="plus" variant="ghost" size="sm" onPress={() => setPicking(true)} style={s.startButton} />}
        </Animated.View>
      )}

      {list.length > 0 || detail.cardio.length > 0 || (plain && !ended) ? (
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
          {detail.cardio.map((row) => (
            <View key={row._id} style={s.upRow}>
              <Text style={s.upName} numberOfLines={1}>
                {row.exercise.name}
              </Text>
              <Text style={s.upMeta} numberOfLines={1}>
                {formatCardio(row)}
              </Text>
            </View>
          ))}
          {ended ? null : (
            <Tap style={s.addEx} scale={0.98} onPress={() => setPicking(true)} accessibilityRole="button">
              <Text style={s.addExText}>+ Add exercise</Text>
            </Tap>
          )}
          {plain && !ended ? (
            <Tap
              style={s.addEx}
              scale={0.98}
              onPress={() => {
                setCardioStep('pick')
                setCardioOpen(true)
              }}
              accessibilityRole="button"
            >
              <Text style={s.addExText}>+ Add cardio</Text>
            </Tap>
          ) : null}
        </View>
      ) : null}

      {plain && !ended ? <WordsEntry sessionId={detail.session._id} title="Add in words" placeholder="2 more sets of curls, 12 and 10 reps." onReview={onReview} /> : null}
    </Page>
  )
}

// The amounts for one cardio activity added during a live workout. Saving adds one cardio record, with Undo.
function AddCardio({ sessionId, exercise, actions, onDone }: { sessionId: SessionId; exercise: Exercise; actions: WorkoutActions; onDone: () => void }) {
  const s = useStyles()
  const addCardio = useMutation(api.strength.addCardio)
  const undoCardio = useMutation(api.strength.undoCardioRevision)
  const [values, setValues] = useState<CardioValues>({})
  const [busy, setBusy] = useState(false)
  // Kept across retries so a resend after a dropped reply adds one record.
  const submissionId = useRef(newSubmissionId())
  const ready = values.durationMin !== undefined || values.distanceKm !== undefined

  // Adds the cardio record, then offers Undo for it.
  async function save() {
    setBusy(true)
    try {
      const cardioId = await addCardio({ submissionId: submissionId.current, sessionId, exerciseId: exercise._id, ...values })
      actions.toast({
        title: `${exercise.name} added`,
        sub: formatCardio(values),
        undo: () => {
          void undoCardio({ submissionId: newSubmissionId(), cardioId }).then(
            () => actions.toast({ title: 'Undone. Nothing lost.', sub: "It's back the way it was." }),
            (err: unknown) => actions.toast({ title: "Couldn't undo that.", sub: plainError(err) }),
          )
        },
      })
      onDone()
    } catch (err) {
      actions.toast({ title: "Couldn't add that.", sub: plainError(err) })
      setBusy(false)
    }
  }

  return (
    <View>
      <Text style={s.sheetEyebrow}>Cardio</Text>
      <Text style={s.sheetTitle}>{exercise.name}</Text>
      <CardioFields value={values} onChange={(change) => setValues((current) => ({ ...current, ...change }))} />
      <Text style={s.sheetBody}>Give minutes or km. Calories are what you reported.</Text>
      <Button label="Add cardio" variant="coral" size="block" busy={busy} disabled={!ready || busy} onPress={() => void save()} />
    </View>
  )
}

// Finished session (mock #/workout-done): minutes, sets, kg moved, and what moved per exercise and cardio.
function Summary({ detail, onEdit }: { detail: SessionDetail; onEdit: () => void }) {
  const s = useStyles()
  const { session, summary } = detail
  // A logged workout has the duration the user gave, or none. A live one has the elapsed time.
  const minutes = session.timing === 'logged' ? (session.durationMin ?? null) : Math.max(1, Math.round(((session.endedAt ?? session.startedAt) - session.startedAt) / 60_000))
  const rows = detail.exercises.length + detail.cardio.length

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
      {detail.historyLimited ? <Text style={s.body}>All sets and totals are shown. Best comparisons are unavailable because older history is outside the recent {formatNumber(detail.historySetLimit)} sets.</Text> : null}

      <View style={s.stats3}>
        <Stat value={minutes === null ? '—' : formatNumber(minutes)} label="minutes" index={0} />
        <Stat value={String(summary.setCount)} label={summary.setCount === 1 ? 'set' : 'sets'} index={1} />
        <Stat value={formatTonnage(summary.volumeKg)} label="kg moved" index={2} />
      </View>

      {rows > 0 ? (
        <Animated.View entering={FadeInDown.delay(240).springify()} style={s.card}>
          <Text style={s.eyebrow}>What moved</Text>
          {detail.exercises.map((e, i) => {
            const best = summary.newBests.find((b) => b.exerciseId === e.exercise._id)
            return (
              <View key={e.exercise._id} style={[s.lrow, i < rows - 1 && s.lrowLine]}>
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
                  <Text style={s.holding}>{e.historyLimited ? 'comparison unavailable' : 'holding'}</Text>
                )}
              </View>
            )
          })}
          {detail.cardio.map((row, i) => (
            <View key={row._id} style={[s.lrow, detail.exercises.length + i < rows - 1 && s.lrowLine]}>
              <View style={s.grow}>
                <Text style={s.lname} numberOfLines={1}>
                  {row.exercise.name}
                </Text>
                <Text style={s.lsub}>{formatCardio(row)}</Text>
              </View>
            </View>
          ))}
          {summary.reportedKcal !== null ? <Text style={s.lsub}>{`${formatNumber(summary.reportedKcal)} kcal cardio, you reported`}</Text> : null}
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
  repeatLabel: { marginTop: 28, marginBottom: 4 },
  repeatCard: { paddingHorizontal: 16, backgroundColor: t.c.card, borderRadius: radii.card, boxShadow: t.shadow.card },
  repeatRow: { paddingVertical: 12, gap: 3 },
  repeatTitle: { ...font('bodyStrong'), color: t.c.ink },
  repeatMeta: { ...font('caption'), color: t.c.ink3 },
  words: { marginTop: 28, padding: 16, gap: 10, backgroundColor: t.c.card, borderRadius: radii.card, boxShadow: t.shadow.card },
  wordsInput: { ...font('input'), color: t.c.ink, backgroundColor: t.c.card2, borderRadius: radii.sm, paddingHorizontal: 14, paddingVertical: 12, minHeight: 96 },
  wordsActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  problem: { ...font('caption'), color: t.c.poloInk },
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
  sheetEyebrow: { ...font('eyebrow'), color: t.c.ink3 },
  sheetTitle: { ...font('cardTitle'), color: t.c.ink, marginTop: 4, marginBottom: 8 },
  sheetBody: { ...font('callout'), color: t.c.ink2, marginTop: 4, marginBottom: 14 },
  gap: { marginTop: 10 },
}))

export { RouteError as ErrorBoundary } from '@/components/RouteError'
