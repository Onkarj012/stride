import { useDeferredValue, useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useQuery } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { radii } from '@stride/ui-tokens'
import { muscleName, type Exercise, type ExerciseId } from '@/lib/strength'
import { font, themedStyles, useTheme } from '@/theme'
import { Thinking } from './Controls'
import { Icon } from './Icon'
import { Polo } from './Polo'
import { Tap } from './Tap'

// Sheet content for choosing a lift: search the shared library, with the user's own lifts first when the box is empty.
export function ExercisePicker({ taken, onPick }: { taken: ExerciseId[]; onPick: (exercise: Exercise) => void }) {
  const t = useTheme()
  const s = useStyles()
  const [text, setText] = useState('')
  const query = useDeferredValue(text.trim())
  // Empty search browses the strength category instead of the alphabet's first cardio drills.
  const results = useQuery(api.exercises.search, query === '' ? { query, category: 'strength' } : { query })
  const library = useQuery(api.exercises.search, { query: '', limit: 1 })
  const stats = useQuery(api.strength.stats, { weeks: 1 })
  const mine = query === '' ? (stats?.exercises ?? []).slice(0, 6).map((e) => e.exerciseId) : []

  return (
    <View>
      <Text style={s.eyebrow}>Add exercise</Text>
      <Text style={s.title}>What are you lifting?</Text>
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
      ) : results.length === 0 ? (
        <View style={s.empty}>
          <Polo size={48} mood="wow" />
          <Text style={s.emptyBody}>
            {query === '' ? 'Type a name to search the library.' : `Nothing called "${query}". Try one word, like "bench" or "row".`}
          </Text>
        </View>
      ) : (
        <View style={s.list}>
          {mine.length > 0 ? <Text style={s.group}>Your lifts</Text> : null}
          {mine.map((id) => (
            <MineRow key={id} exerciseId={id} taken={taken.includes(id)} onPick={onPick} />
          ))}
          {mine.length > 0 ? <Text style={s.group}>Library</Text> : null}
          {results
            .filter((exercise) => !mine.includes(exercise._id))
            .map((exercise) => (
              <ExerciseRow key={exercise._id} exercise={exercise} taken={taken.includes(exercise._id)} onPick={onPick} />
            ))}
        </View>
      )}
    </View>
  )
}

// One of the user's recent lifts, loaded by id so it shows full library details.
function MineRow({ exerciseId, taken, onPick }: { exerciseId: ExerciseId; taken: boolean; onPick: (exercise: Exercise) => void }) {
  const exercise = useQuery(api.exercises.get, { exerciseId })
  if (!exercise) return null
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
  empty: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 12 },
  emptyTitle: { ...font('emptyTitle'), color: t.c.ink, marginTop: 12 },
  emptyBody: { ...font('callout'), color: t.c.ink2, textAlign: 'center', marginTop: 6 },
}))
