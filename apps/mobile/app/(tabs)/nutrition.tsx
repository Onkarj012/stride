import { useState, useRef } from 'react'
import {
  ScrollView, View, Text, Pressable, Modal, Animated as RNAnimated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import * as Haptics from '../../lib/haptics'
import { MacroCard } from '../../components/MacroCard'
import { MealLogCard, MealLogCardEmpty } from '../../components/MealLogCard'
import { Icon } from '../../components/Icon'
import { useTheme } from '../../components/theme'
import { AppText } from '../../components/ui'

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

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function NutritionScreen() {
  const t = useTheme()
  const [adding, setAdding] = useState(false)
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const meals = useQuery(api.meals.getMeals, { date: todayStr }) as Array<{ _id: string; name: string; time?: string; mealType?: string; calories: number; protein: number; carbs: number; fat: number }> | undefined
  const profile = useQuery(api.profile.getProfile) as { proteinTarget?: number | null } | null | undefined
  const totals = {
    kcal: Math.round((meals ?? []).reduce((sum, meal) => sum + meal.calories, 0)),
    protein: Math.round((meals ?? []).reduce((sum, meal) => sum + meal.protein, 0)),
    carbs: Math.round((meals ?? []).reduce((sum, meal) => sum + meal.carbs, 0)),
    fat: Math.round((meals ?? []).reduce((sum, meal) => sum + meal.fat, 0)),
  }

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
            Today's meals
          </Text>
        </View>

        {!meals ? <AppText variant="body" color={t.textMuted}>Loading today's meals…</AppText> : <>
          <MacroCard {...totals} />
          <AppText variant="caption" color={t.textSubtle}>Protein target: {profile?.proteinTarget ?? 90}g</AppText>
          {meals.length === 0 ? <MealLogCardEmpty /> : meals.map((meal) => (
            <MealLogCard key={meal._id} meal={meal.name} time={meal.time ?? meal.mealType ?? 'Meal'} macros={{ kcal: Math.round(meal.calories), protein: Math.round(meal.protein), carbs: Math.round(meal.carbs), fat: Math.round(meal.fat) }} confirmed />
          ))}
        </>}
      </ScrollView>

      <AddSheet
        visible={adding}
        onClose={() => setAdding(false)}
      />
    </SafeAreaView>
  )
}
