import { useState, useRef } from 'react'
import {
  ScrollView, View, Text, Pressable, Modal, TextInput, KeyboardAvoidingView,
  Platform, Animated as RNAnimated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from '../../lib/haptics'
import { MacroCard } from '../../components/MacroCard'
import { MealLogCard, MealLogCardEmpty } from '../../components/MealLogCard'
import { Icon } from '../../components/Icon'
import { useTheme } from '../../components/theme'
import { Button, SegToggle, Pill, AppText } from '../../components/ui'
import { MACRO_TOTALS, TODAY_MEALS, RECIPES } from '../../data'
import type { MealLogCardProps, Recipe, MacroData } from '../../data'

type NutritionView = 'today' | 'recipes'

// ─── Recipe card ───────────────────────────────────────────────────────────────

function RecipeCard({ recipe, onOpen }: { recipe: Recipe; onOpen: () => void }) {
  const t = useTheme()
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onOpen() }}
      style={({ pressed }) => [
        { backgroundColor: t.card, borderRadius: 16, padding: 20, opacity: pressed ? 0.85 : 1 },
        t.cardShadow,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <View style={{ alignSelf: 'flex-start', marginBottom: 8 }}>
            <Pill label={recipe.tag} color="lavender" size="sm" />
          </View>
          <AppText variant="title" style={{ fontSize: 17 }}>{recipe.name}</AppText>
          <AppText variant="small" color={t.textMuted} style={{ marginTop: 4, lineHeight: 18 }}>{recipe.blurb}</AppText>
        </View>
        <AppText variant="overline" color={t.textSubtle} style={{ marginLeft: 12, fontSize: 13, letterSpacing: 0 }}>{recipe.prepMin}m</AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
        <Pill label={`${recipe.macros.kcal} kcal`} color="peach" size="sm" />
        <Pill label={`${recipe.macros.protein}g`}   color="mint"  size="sm" />
      </View>
    </Pressable>
  )
}

// ─── Macro chips ───────────────────────────────────────────────────────────────

function MacroChips({ macros }: { macros: MacroData }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      <Pill label={`${macros.kcal} kcal`}    color="peach"     size="sm" />
      <Pill label={`${macros.protein}g P`}   color="mint"      size="sm" />
      <Pill label={`${macros.carbs}g C`}     color="sky"       size="sm" />
      <Pill label={`${macros.fat}g F`}       color="bubblegum" size="sm" />
    </View>
  )
}

// ─── Add sheet ─────────────────────────────────────────────────────────────────

const MODALITIES = [
  { id: 'chat',    label: 'Type it',         icon: 'chat' as const },
  { id: 'voice',   label: 'Voice note',      icon: 'mic' as const },
  { id: 'photo',   label: 'Photo of meal',   icon: 'camera' as const },
  { id: 'barcode', label: 'Scan barcode',    icon: 'barcode' as const },
  { id: 'ocr',     label: 'Nutrition label', icon: 'ocr' as const },
]

function AddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme()
  const translateY = useRef(new RNAnimated.Value(400)).current

  if (visible) {
    RNAnimated.spring(translateY, { toValue: 0, stiffness: 320, damping: 34, useNativeDriver: true }).start()
  }

  function close() {
    RNAnimated.spring(translateY, { toValue: 400, stiffness: 320, damping: 34, useNativeDriver: true }).start(() => onClose())
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(13,16,27,0.4)', justifyContent: 'flex-end' }}
        onPress={close}
      >
        <RNAnimated.View
          style={{
            transform: [{ translateY }],
            backgroundColor: t.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 20,
            paddingBottom: 40,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -20 },
            shadowOpacity: 0.25,
            shadowRadius: 30,
            elevation: 20,
          }}
        >
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.dimBgMid, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: t.text, marginBottom: 4 }}>
              Log anything
            </Text>
            <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 13, color: t.textSubtle, marginBottom: 20 }}>
              Stry parses it into a meal automatically
            </Text>
            <View style={{ gap: 8 }}>
              {MODALITIES.map(m => (
                <Pressable
                  key={m.id}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); close() }}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 14,
                    borderRadius: 16,
                    backgroundColor: pressed ? t.dimBg : t.bg,
                    paddingHorizontal: 14, paddingVertical: 15,
                    borderWidth: 1,
                    borderColor: t.border,
                  })}
                >
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(179,160,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={m.icon} size={22} color={t.accent} sw={2} />
                  </View>
                  <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 15, color: t.text, flex: 1 }}>
                    {m.label}
                  </Text>
                  <Icon name="chevronRight" size={18} color={t.textSubtle} sw={2} />
                </Pressable>
              ))}
            </View>
          </Pressable>
        </RNAnimated.View>
      </Pressable>
    </Modal>
  )
}

// ─── Recipe detail modal ────────────────────────────────────────────────────────

function RecipeDetailModal({ recipe, onClose, onLog }: {
  recipe: Recipe | null; onClose: () => void; onLog: (r: Recipe) => void
}) {
  const t = useTheme()
  const [logged, setLogged] = useState(false)

  if (!recipe) return null

  function handleLog() {
    setLogged(true)
    onLog(recipe!)
    setTimeout(onClose, 850)
  }

  return (
    <Modal visible={!!recipe} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(13,16,27,0.4)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            style={{
              maxHeight: '88%',
              backgroundColor: t.bg,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
            }}
            contentContainerStyle={{ padding: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <View style={{ backgroundColor: 'rgba(179,160,255,0.2)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 10 }}>
                  <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 10, color: t.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>{recipe.tag}</Text>
                </View>
                <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 24, color: t.text, letterSpacing: -0.5 }}>{recipe.name}</Text>
                <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 14, color: t.textMuted, marginTop: 4 }}>{recipe.blurb}</Text>
              </View>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onClose() }}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.dimBg, alignItems: 'center', justifyContent: 'center', marginLeft: 12 }}
              >
                <Icon name="close" size={18} color={t.textMuted} sw={2.2} />
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
              <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 12, color: t.textSubtle }}>{recipe.prepMin} min prep</Text>
              <Text style={{ color: t.textSubtle }}>·</Text>
              <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 12, color: t.textSubtle }}>{recipe.servings} serving{recipe.servings > 1 ? 's' : ''}</Text>
            </View>

            <View style={[{ backgroundColor: t.card, borderRadius: 14, padding: 16, marginBottom: 20 }, t.cardShadow]}>
              <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 2, color: t.textSubtle, textTransform: 'uppercase', marginBottom: 10 }}>
                Per serving
              </Text>
              <MacroChips macros={recipe.macros} />
            </View>

            <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 2, color: t.textSubtle, textTransform: 'uppercase', marginBottom: 10 }}>
              Ingredients
            </Text>
            {recipe.ingredients.map((ing, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent, marginTop: 7 }} />
                <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 14, color: t.textMuted, flex: 1 }}>{ing}</Text>
              </View>
            ))}

            <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 2, color: t.textSubtle, textTransform: 'uppercase', marginTop: 16, marginBottom: 10 }}>
              Method
            </Text>
            {recipe.steps.map((step, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: t.dimBgMid, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 11, color: t.textMuted }}>{i + 1}</Text>
                </View>
                <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 14, color: t.textMuted, flex: 1, lineHeight: 20 }}>{step}</Text>
              </View>
            ))}

            <View style={{ marginTop: 8 }}>
              <Button
                label={logged ? 'Logged to today' : 'Log this meal'}
                icon={logged ? 'check' : undefined}
                variant="primary"
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleLog() }}
                disabled={logged}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─── Recipe create modal ────────────────────────────────────────────────────────

const EMPTY_RECIPE: Recipe = { name: '', tag: 'Breakfast', macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, prepMin: 10, servings: 1, blurb: '', ingredients: [''], steps: [''] }
const TAGS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

function RecipeCreateModal({ visible, onClose, onCreate }: {
  visible: boolean; onClose: () => void; onCreate: (r: Recipe) => void
}) {
  const t = useTheme()
  const [recipe, setRecipe] = useState<Recipe>(EMPTY_RECIPE)

  const inputStyle = {
    fontFamily: 'Manrope_500Medium' as const, fontSize: 14, color: t.text,
    backgroundColor: t.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: t.border,
  }

  function handleCreate() {
    const clean: Recipe = {
      ...recipe,
      name: recipe.name.trim() || 'Untitled recipe',
      ingredients: recipe.ingredients.map(s => s.trim()).filter(Boolean),
      steps: recipe.steps.map(s => s.trim()).filter(Boolean),
    }
    onCreate(clean)
    setRecipe(EMPTY_RECIPE)
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(13,16,27,0.4)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            style={{ maxHeight: '90%', backgroundColor: t.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
            contentContainerStyle={{ padding: 24, gap: 16 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 22, color: t.text, letterSpacing: -0.5 }}>New recipe</Text>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onClose() }}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.dimBg, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="close" size={18} color={t.textMuted} sw={2.2} />
              </Pressable>
            </View>

            <TextInput
              style={inputStyle}
              placeholder="Recipe name"
              placeholderTextColor={t.textSubtle}
              value={recipe.name}
              onChangeText={v => setRecipe(p => ({ ...p, name: v }))}
            />
            <TextInput
              style={[inputStyle, { height: 64, textAlignVertical: 'top' }]}
              placeholder="Short description"
              placeholderTextColor={t.textSubtle}
              value={recipe.blurb}
              onChangeText={v => setRecipe(p => ({ ...p, blurb: v }))}
              multiline
            />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {TAGS.map(tag => (
                <Pressable
                  key={tag}
                  onPress={() => { Haptics.selectionAsync(); setRecipe(p => ({ ...p, tag })) }}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
                    backgroundColor: recipe.tag === tag ? t.buttonPrimaryBg : t.card,
                    borderColor: recipe.tag === tag ? t.buttonPrimaryBg : t.border,
                  }}
                >
                  <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 12, color: recipe.tag === tag ? t.buttonPrimaryText : t.textMuted }}>
                    {tag}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 11, color: t.textSubtle, marginBottom: 4 }}>Prep (min)</Text>
                <TextInput
                  style={inputStyle}
                  keyboardType="numeric"
                  value={String(recipe.prepMin)}
                  onChangeText={v => setRecipe(p => ({ ...p, prepMin: Number(v) || 0 }))}
                  placeholderTextColor={t.textSubtle}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 11, color: t.textSubtle, marginBottom: 4 }}>Servings</Text>
                <TextInput
                  style={inputStyle}
                  keyboardType="numeric"
                  value={String(recipe.servings)}
                  onChangeText={v => setRecipe(p => ({ ...p, servings: Number(v) || 1 }))}
                  placeholderTextColor={t.textSubtle}
                />
              </View>
            </View>

            <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 2, color: t.textSubtle, textTransform: 'uppercase' }}>
              Macros (per serving)
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['kcal', 'protein', 'carbs', 'fat'] as const).map(k => (
                <View key={k} style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 10, color: t.textSubtle, marginBottom: 4 }}>{k}</Text>
                  <TextInput
                    style={[inputStyle, { paddingHorizontal: 8 }]}
                    keyboardType="numeric"
                    value={String(recipe.macros[k])}
                    onChangeText={v => setRecipe(p => ({ ...p, macros: { ...p.macros, [k]: Number(v) || 0 } }))}
                    placeholderTextColor={t.textSubtle}
                  />
                </View>
              ))}
            </View>

            <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 2, color: t.textSubtle, textTransform: 'uppercase' }}>
              Ingredients
            </Text>
            {recipe.ingredients.map((v, i) => (
              <TextInput
                key={i}
                style={inputStyle}
                placeholder="e.g. 60g oats"
                placeholderTextColor={t.textSubtle}
                value={v}
                onChangeText={val => setRecipe(p => ({ ...p, ingredients: p.ingredients.map((x, j) => j === i ? val : x) }))}
              />
            ))}
            <Pressable onPress={() => setRecipe(p => ({ ...p, ingredients: [...p.ingredients, ''] }))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="plus" size={14} color={t.accent} sw={2.6} />
              <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 13, color: t.accent }}>Add ingredient</Text>
            </Pressable>

            <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 2, color: t.textSubtle, textTransform: 'uppercase' }}>
              Method
            </Text>
            {recipe.steps.map((v, i) => (
              <TextInput
                key={i}
                style={inputStyle}
                placeholder="e.g. Mix and rest 5 min"
                placeholderTextColor={t.textSubtle}
                value={v}
                onChangeText={val => setRecipe(p => ({ ...p, steps: p.steps.map((x, j) => j === i ? val : x) }))}
              />
            ))}
            <Pressable onPress={() => setRecipe(p => ({ ...p, steps: [...p.steps, ''] }))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="plus" size={14} color={t.accent} sw={2.6} />
              <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 13, color: t.accent }}>Add step</Text>
            </Pressable>

            <Button
              label="Save recipe"
              variant="primary"
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleCreate() }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function NutritionScreen() {
  const t = useTheme()
  const [view, setView] = useState<NutritionView>('today')
  const [meals, setMeals] = useState<MealLogCardProps[]>(TODAY_MEALS)
  const [recipes, setRecipes] = useState<Recipe[]>(RECIPES)
  const [openRecipe, setOpenRecipe] = useState<Recipe | null>(null)
  const [creating, setCreating] = useState(false)
  const [adding, setAdding] = useState(false)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 26, color: t.text, letterSpacing: -1 }}>
            Nutrition
          </Text>
          <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 13, color: t.textSubtle, marginTop: 2 }}>
            Today's meals & recipes
          </Text>
        </View>

        <SegToggle
          value={view}
          onChange={setView}
          options={[{ id: 'today', label: "Today's meals" }, { id: 'recipes', label: 'Recipes' }]}
        />

        {view === 'today' ? (
          <>
            <MacroCard {...MACRO_TOTALS} />
            {meals.map((m, i) => <MealLogCard key={i} {...m} index={i} />)}
            <MealLogCardEmpty />
          </>
        ) : (
          <>
            <Button
              label="New recipe"
              icon="plus"
              variant="primary"
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCreating(true) }}
            />
            {recipes.map((r) => (
              <RecipeCard key={r.name} recipe={r} onOpen={() => setOpenRecipe(r)} />
            ))}
          </>
        )}
      </ScrollView>

      <AddSheet
        visible={adding}
        onClose={() => setAdding(false)}
      />

      <RecipeDetailModal
        recipe={openRecipe}
        onClose={() => setOpenRecipe(null)}
        onLog={r => setMeals(m => [...m, { meal: r.name, time: `${r.tag} · just now`, macros: r.macros, confirmed: true }])}
      />

      <RecipeCreateModal
        visible={creating}
        onClose={() => setCreating(false)}
        onCreate={r => setRecipes(list => [r, ...list])}
      />
    </SafeAreaView>
  )
}
