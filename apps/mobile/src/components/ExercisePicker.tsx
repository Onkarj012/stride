import { useDeferredValue, useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useConvex, useMutation, useQuery } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { radii } from '@stride/ui-tokens'
import { plainError } from '@/lib/log'
import { muscleName, type Exercise, type ExerciseId } from '@/lib/strength'
import { font, themedStyles, useTheme } from '@/theme'
import { Thinking } from './Controls'
import { Icon } from './Icon'
import { Polo } from './Polo'
import { Tap } from './Tap'

type Kind = 'strength' | 'cardio'

// Sheet content for choosing a lift: search the shared library, with the user's own lifts first when the box is empty.
// kind limits the list to strength or cardio. allowOwn offers the typed text as a new personal exercise of that kind.
// onOwnWords, when given, takes the typed text instead of creating the personal exercise now.
export function ExercisePicker({
  taken,
  onPick,
  kind,
  allowOwn = false,
  onOwnWords,
}: {
  taken: ExerciseId[]
  onPick: (exercise: Exercise) => void
  kind?: Kind
  allowOwn?: boolean
  onOwnWords?: (words: string) => void
}) {
  const t = useTheme()
  const s = useStyles()
  const convex = useConvex()
  const createPersonal = useMutation(api.exercises.createPersonal)
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const query = useDeferredValue(text.trim())
  // Empty search browses one category instead of the alphabet's first drills; typed search is filtered by kind below.
  const results = useQuery(api.exercises.search, query === '' ? { query, category: kind ?? 'strength' } : { query })
  const library = useQuery(api.exercises.search, { query: '', limit: 1 })
  const recent = useQuery(api.strength.recentExercises, query === '' ? {} : 'skip')
  const mine = query === '' ? (recent ?? []) : []
  const exactMatch = results?.some((exercise) => exercise.name.toLowerCase() === query.toLowerCase()) ?? false
  // Whether a row is the kind this picker lists. Without a kind every row fits.
  const fitsKind = (exercise: Exercise) => kind === undefined || (exercise.category === 'cardio') === (kind === 'cardio')
  const shown = results?.filter(fitsKind) ?? []

  // Creates the user's own exercise with the typed name, then picks it like a library row.
  async function addOwn() {
    setAdding(true)
    setProblem(null)
    try {
      const exerciseId = await createPersonal({ name: text.trim(), kind: kind ?? 'strength' })
      const exercise = await convex.query(api.exercises.get, { exerciseId })
      if (exercise === null) throw new Error('Exercise not found')
      onPick(exercise)
    } catch (err) {
      setProblem(plainError(err))
      setAdding(false)
    }
  }

  return (
    <View>
      <Text style={s.eyebrow}>{kind === 'cardio' ? 'Add cardio' : 'Add exercise'}</Text>
      <Text style={s.title}>{kind === 'cardio' ? 'What did you do?' : 'What are you lifting?'}</Text>
      <View style={s.search}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Bench, squat, row…"
          placeholderTextColor={t.c.ink3}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          maxLength={200}
          accessibilityLabel="Search exercises"
        />
        {text !== '' ? (
          <Tap onPress={() => setText('')} scale={0.85} style={s.clear} accessibilityRole="button" accessibilityLabel="Clear search">
            <Icon name="x" size={16} color={t.c.ink2} />
          </Tap>
        ) : null}
      </View>

      {library !== undefined && library.length === 0 ? (
        <View style={s.empty}>
          <Polo size={56} mood="sleep" />
          <Text style={s.emptyTitle}>No exercises yet.</Text>
          <Text style={s.emptyBody}>The exercise library hasn't been loaded on this server. Once it is, every lift shows up here.</Text>
        </View>
      ) : results === undefined ? (
        <Thinking label="Looking…" />
      ) : (
        <View style={s.list}>
          {shown.length === 0 && mine.length === 0 ? (
            <View style={s.empty}>
              <Polo size={48} mood="wow" />
              <Text style={s.emptyBody}>
                {query === '' ? 'Type a name to search the library.' : `Nothing called "${query}". Try one word, like "bench" or "row".`}
              </Text>
            </View>
          ) : null}
          {mine.length > 0 ? <Text style={s.group}>Your lifts</Text> : null}
          {mine.map((id) => (
            <MineRow key={id} exerciseId={id} fitsKind={fitsKind} taken={taken.includes(id)} onPick={onPick} />
          ))}
          {mine.length > 0 && shown.length > 0 ? <Text style={s.group}>Library</Text> : null}
          {shown
            .filter((exercise) => !mine.includes(exercise._id))
            .map((exercise) => (
              <ExerciseRow key={exercise._id} exercise={exercise} taken={taken.includes(exercise._id)} onPick={onPick} />
            ))}
          {allowOwn && query !== '' && !exactMatch ? (
            <Tap style={s.own} scale={0.98} disabled={adding} onPress={() => (onOwnWords ? onOwnWords(query) : void addOwn())} accessibilityRole="button">
              <Text style={s.ownText}>{adding ? 'Adding…' : `Add "${query}" as your own`}</Text>
            </Tap>
          ) : null}
          {problem ? <Text style={s.problem}>{problem}</Text> : null}
        </View>
      )}
    </View>
  )
}

// One of the user's recent lifts, loaded by id so it shows full library details. Hidden when it is the other kind.
function MineRow({ exerciseId, fitsKind, taken, onPick }: { exerciseId: ExerciseId; fitsKind: (exercise: Exercise) => boolean; taken: boolean; onPick: (exercise: Exercise) => void }) {
  const exercise = useQuery(api.exercises.get, { exerciseId })
  if (!exercise || !fitsKind(exercise)) return null
  return <ExerciseRow exercise={exercise} taken={taken} onPick={onPick} />
}

// Tappable library row: name, main muscle and equipment; a check when it's already in this session.
function ExerciseRow({ exercise, taken, onPick }: { exercise: Exercise; taken: boolean; onPick: (exercise: Exercise) => void }) {
  const t = useTheme()
  const s = useStyles()
  const muscle = exercise.primaryMuscles[0]
  const detail = [muscle ? muscleName(muscle) : null, exercise.equipment ? muscleName(exercise.equipment) : null].filter(Boolean).join(' · ')
  return (
    <Animated.View entering={FadeIn.duration(180)}>
      <Tap style={s.row} scale={0.98} onPress={() => onPick(exercise)} accessibilityRole="button" accessibilityLabel={exercise.name}>
        <View style={s.grow}>
          <Text style={s.name} numberOfLines={1}>
            {exercise.name}
          </Text>
          {detail ? <Text style={s.detail}>{detail}</Text> : null}
        </View>
        <Icon name={taken ? 'check' : 'plus'} size={18} color={taken ? t.c.ink3 : t.c.ink} />
      </Tap>
    </Animated.View>
  )
}

const useStyles = themedStyles((t) => ({
  grow: { flex: 1 },
  eyebrow: { ...font('eyebrow'), color: t.c.ink3 },
  title: { ...font('cardTitle'), color: t.c.ink, marginTop: 4 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    backgroundColor: t.c.card2,
    borderRadius: radii.field,
    paddingLeft: 16,
    paddingRight: 6,
    height: 48,
  },
  input: { ...font('input'), flex: 1, color: t.c.ink, paddingVertical: 0 },
  clear: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  list: { marginTop: 8 },
  group: { ...font('eyebrow'), color: t.c.ink3, marginTop: 14, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.c.line },
  name: { ...font('bodyStrong'), color: t.c.ink },
  detail: { ...font('caption'), color: t.c.ink3, marginTop: 2 },
  own: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.c.line2, alignItems: 'center' },
  ownText: { ...font('calloutStrong'), color: t.c.ink2 },
  problem: { ...font('caption'), color: t.c.poloInk, marginTop: 10 },
  empty: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 12 },
  emptyTitle: { ...font('emptyTitle'), color: t.c.ink, marginTop: 12 },
  emptyBody: { ...font('callout'), color: t.c.ink2, textAlign: 'center', marginTop: 6 },
}))
