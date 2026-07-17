import { motion, AnimatePresence } from 'motion/react'
import type { MacroData } from './MacroCard'
import { SPRING_CARD } from '@/lib/motion'
import { NutritionSourceBadge } from './NutritionSourceBadge'

type MealIngredientDetail = {
  foodText?: string
  food_text?: string
  source?: string
  confidence?: number
  matchedFoodName?: string
  grams?: number
  unresolved?: boolean
  quantity?: number
  unit?: string
}

export interface MealLogCardProps {
  meal: string
  time: string
  macros: MacroData
  confirmed: boolean
  detail?: { ingredients?: MealIngredientDetail[]; items?: MealIngredientDetail[] }
}

export function MealLogCard({ meal, time, macros, confirmed, detail }: MealLogCardProps) {
  const ingredients = detail?.ingredients ?? detail?.items ?? []
  return (
    <motion.div
      className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CARD}
      layout
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/40 dark:text-white/40 mb-1">
            {time}
          </p>
          <h3 className="text-[17px] font-extrabold text-ink dark:text-surface tracking-[-0.5px]">
            {meal}
          </h3>
        </div>
        <AnimatePresence>
          {confirmed && (
            <motion.div
              className="flex items-center gap-1.5 bg-[#e8f7ed] rounded-full px-3 py-1.5"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1a8a4a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7" />
              </svg>
              <span className="text-[11px] font-extrabold text-[#1a8a4a]">logged</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div className="flex flex-wrap gap-1.5 mt-4" layout>
        <span className="bg-peach rounded-full px-3 py-1.5 text-[13px] font-bold text-ink tabular-nums">
          {macros.kcal} kcal
        </span>
        <span className="bg-mint rounded-full px-3 py-1.5 text-[13px] font-bold text-ink tabular-nums">
          {macros.protein}g protein
        </span>
        <span className="bg-sky rounded-full px-3 py-1.5 text-[13px] font-bold text-ink tabular-nums">
          {macros.carbs}g carbs
        </span>
        <span className="bg-bubblegum rounded-full px-3 py-1.5 text-[13px] font-bold text-ink tabular-nums">
          {macros.fat}g fat
        </span>
      </motion.div>

      {ingredients.length > 0 && (
        <div className="mt-4 border-t border-ink/08 dark:border-white/08 pt-3 space-y-2">
          {ingredients.map((ingredient, index) => (
            <div key={`${ingredient.foodText ?? ingredient.food_text ?? "ingredient"}-${index}`} className="space-y-0.5">
              <div className="flex items-center gap-2 text-[11px]">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${ingredient.unresolved ? "bg-bubblegum" : "bg-mint"}`} />
                <span className={`font-semibold truncate ${ingredient.unresolved ? "text-bubblegum" : "text-ink/65 dark:text-white/65"}`}>
                  {ingredient.foodText ?? ingredient.food_text ?? "Ingredient"}
                  {ingredient.quantity != null && ingredient.unit ? ` · ${ingredient.quantity}${ingredient.unit}` : ""}
                </span>
                <span className="ml-auto shrink-0">
                  {ingredient.unresolved ? (
                    <span className="font-bold text-bubblegum">Needs selection</span>
                  ) : (
                    <NutritionSourceBadge source={ingredient.source} confidence={ingredient.confidence} />
                  )}
                </span>
              </div>
              {ingredient.matchedFoodName && ingredient.matchedFoodName !== (ingredient.foodText ?? ingredient.food_text) && (
                <p className="ml-3.5 text-[10px] text-ink/40 dark:text-white/40">normalized: {ingredient.matchedFoodName} · {Math.round(ingredient.grams ?? 0)}g</p>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

export function MealLogCardEmpty() {
  return (
    <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 border-2 border-dashed border-ink/10 dark:border-white/10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-lavender/30 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B3A0FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-4.5A8 8 0 1 1 21 12z"/>
          </svg>
        </div>
        <p className="text-[15px] text-ink/40 dark:text-white/40 font-medium">
          "What did you have for breakfast?"
        </p>
      </div>
      <div className="space-y-2">
        <div className="h-5 w-32 bg-ink/06 dark:bg-white/06 rounded-full" />
        <div className="flex gap-1.5">
          <div className="h-7 w-24 bg-ink/06 dark:bg-white/06 rounded-full" />
          <div className="h-7 w-24 bg-ink/06 dark:bg-white/06 rounded-full" />
        </div>
      </div>
    </div>
  )
}
