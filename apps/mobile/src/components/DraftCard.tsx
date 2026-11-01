import { useEffect, useState } from 'react'
import { Linking, Text, TextInput, View } from 'react-native'
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated'
import { useMutation, useQuery } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { normalizeUnit, scaleNutrients } from '@stride/core'
import { motion, radii } from '@stride/ui-tokens'
import { formatDayTitle, formatGrams, formatNumber } from '@/lib/format'
import { plainError, type AmountSet, type AmountUnit, type DraftId, type DraftItem, type FoodId, type LogResult } from '@/lib/log'
import { useLocalToday } from '@/lib/useLocalToday'
import { font, themedStyles, useTheme } from '@/theme'
import { Button, RoundButton, Stepper, Tag, Thinking } from './Controls'
import { Tap } from './Tap'

/** One change the user made to a draft item before confirming. A null quantity means the typed amount was not a positive number. */
type Fix = { remove?: boolean; foodId?: FoodId; foodName?: string; quantity?: number | null; unit?: string | null; localDate?: string }

const spring = FadeInDown.springify().stiffness(300).damping(17)
const HALF_UNITS = new Set(['katori', 'bowl', 'glass', 'cup', 'plate', 'ladle'])
const MIN_QUANTITY = 0.25
const NUMBER_TEXT = /^(\d+[.,]?\d*|[.,]\d+)$/

// "2", "1½" or "0.75" for a quantity.
function formatQuantity(q: number): string {
  const whole = Math.floor(q)
  if (q - whole === 0.5) return whole === 0 ? '½' : `${whole}½`
  return String(Math.round(q * 100) / 100)
}

// A typed amount, or null unless it is a positive finite number such as "0.25" or "35".
function parseQuantity(text: string): number | null {
  const t = text.trim()
  if (!NUMBER_TEXT.test(t)) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** What one item will log. `payload` is what confirm sends for an amount the user set; null when the server's amount stands. */
type Plan = {
  foodName: string | null
  touched: boolean
  quantity: number | null
  option: AmountUnit | null
  grams: number | null
  kcal: number | null
  protein: number | null
  ready: boolean
  payload: { quantity: number; unit: string | null } | { grams: number } | null
}

/** What an item logs as: the server's amount until the user edits it, else quantity times the unit's grams. */
function planOf(item: DraftItem, fix: Fix, set: AmountSet | null): Plan {
  const foodName = fix.foodName ?? item.food?.name ?? null
  const foodChanged = fix.foodId !== undefined && fix.foodId !== item.food?._id
  const touched = foodChanged || fix.quantity !== undefined || fix.unit !== undefined
  // A recipe fraction shows the eaten part, so the card's quantity is the server's quantity times the scale.
  const scale = item.portionScale ?? 1
  const eaten = item.quantity === null ? null : item.quantity * scale
  const quantity = fix.quantity !== undefined ? fix.quantity : eaten
  // Same unit the server reads from the draft. A unit that no longer converts for this food finds no option here.
  const selectedUnit = fix.unit !== undefined ? fix.unit : item.unit
  const normalizedUnit = selectedUnit === null ? null : normalizeUnit(selectedUnit)
  const option = set?.units.find((u) => u.unit === normalizedUnit) ?? null
  if (!touched) {
    return {
      foodName,
      touched,
      quantity,
      option,
      grams: item.grams,
      kcal: item.preview?.kcal ?? null,
      protein: item.preview?.protein ?? null,
      ready: foodName !== null && item.grams !== null,
      payload: null,
    }
  }
  if (option === null || quantity === null || quantity <= 0 || set === null) {
    return { foodName, touched, quantity, option, grams: null, kcal: null, protein: null, ready: false, payload: null }
  }
  // The quantity is already eaten, so no scale here. A recipe fraction is sent as grams because the server would rescale quantity and unit.
  const grams = quantity * option.gramsPerUnit
  const nutrients = scaleNutrients(set.per100g, grams)
  const payload = item.portionScale === null ? { quantity, unit: option.unit } : { grams }
  return {
    foodName,
    touched,
    quantity,
    option,
    grams,
    kcal: nutrients.kcal,
    protein: nutrients.protein,
    ready: foodName !== null,
    payload,
  }
}

/** The amount line under a food name. */
function metaOf(plan: Plan): string {
  if (plan.foodName === null) return 'not matched yet'
  if (plan.grams === null) return 'amount needed'
  if (plan.quantity !== null && plan.option !== null) return `${formatQuantity(plan.quantity)} ${plan.option.label} · ${formatGrams(plan.grams)}`
  return formatGrams(plan.grams)
}

// Draft card (mock #/meal and #/ask): fix amounts or foods, drop items, then confirm or discard.
export function DraftCard({
  draftId,
  onCommitted,
  onDiscarded,
}: {
  draftId: DraftId
  onCommitted: (result: LogResult) => void
  onDiscarded: () => void
}) {
  const s = useStyles()
  const draft = useQuery(api.pipeline.drafts.getDraft, { draftId })
  const today = useLocalToday()
  const confirmDraft = useMutation(api.pipeline.drafts.confirmDraft)
  const discardDraft = useMutation(api.pipeline.drafts.discardDraft)
  const [fixes, setFixes] = useState<Record<number, Fix>>({})
  const [editing, setEditing] = useState<number | null>(null)
  const [busy, setBusy] = useState<'confirm' | 'discard' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // Units and nutrients for each item's current food, so every amount can be priced before saving.
  const amountItems = (draft?.items ?? []).map((item, i) => {
    const fix = fixes[i] ?? {}
    const foodId = fix.remove ? undefined : (fix.foodId ?? item.food?._id)
    return foodId === undefined ? null : { foodId, unit: item.unit }
  })
  const sets = useQuery(api.pipeline.drafts.amountOptions, { items: amountItems })

  if (draft === undefined) return <Thinking label="Opening the draft…" />
  if (draft === null || draft.status !== 'pending')
    return <Text style={s.note}>{draft ? 'This one is already handled. Check Today.' : 'This draft is gone.'}</Text>

  // Merges a change into one item's fix.
  const patch = (index: number, change: Fix) => setFixes((all) => ({ ...all, [index]: { ...all[index], ...change } }))

  const plans = draft.items.map((item, i) => planOf(item, fixes[i] ?? {}, sets?.[i] ?? null))
  const kept = draft.items.map((_, i) => i).filter((i) => fixes[i]?.remove !== true)
  const missingFood = kept.some((i) => plans[i]?.foodName === null)
  const ready = kept.every((i) => plans[i]?.ready === true)
  const total = kept.reduce<number | null>((sum, i) => {
    const k = plans[i]?.kcal
    return sum === null || k === null || k === undefined ? null : sum + k
  }, 0)
  const photo = draft.inputKind === 'photo'
  // Client-side advisory only: a changed food hides the warning, and the card does not re-run the sugar rules.
  const sugarKept = draft.items.some((other, j) => kept.includes(j) && fixes[j]?.foodId === undefined && other.reasons.includes('sugar_separate'))

  // Sends the fixes. The server turns quantity and unit into grams itself, so it checks every amount too.
  async function confirm() {
    if (!draft) return
    setBusy('confirm')
    setProblem(null)
    const corrections = Object.entries(fixes)
      .map(([index, fix]) => {
        const payload = plans[Number(index)]?.payload ?? null
        return {
          index: Number(index),
          ...(fix.remove ? { remove: true } : {}),
          ...(fix.foodId ? { foodId: fix.foodId } : {}),
          ...(payload ?? {}),
          ...(fix.localDate ? { localDate: fix.localDate } : {}),
        }
      })
      // An undone change leaves only the index; sending it would mark the item as user-corrected.
      .filter((c) => Object.keys(c).length > 1)
    try {
      onCommitted(await confirmDraft({ draftId, corrections }))
    } catch (err) {
      setProblem(plainError(err))
      setBusy(null)
    }
  }

  // Drops the whole draft.
  async function discard() {
    setBusy('discard')
    try {
      await discardDraft({ draftId })
      onDiscarded()
    } catch (err) {
      setProblem(plainError(err))
      setBusy(null)
    }
  }

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>{photo ? 'From your photo' : missingFood ? 'A quick check' : 'Got these'}</Text>
        {total !== null && kept.length > 0 ? <Text style={s.total}>{formatNumber(total)} kcal</Text> : null}
      </View>

      {draft.items.map((item, i) => {
        const fix = fixes[i] ?? {}
        const plan = plans[i]
        if (!plan) return null
        if (fix.remove)
          return (
            <Animated.View key={i} layout={LinearTransition.springify()} style={[s.item, s.removed]}>
              <Text style={[s.itemName, s.struck]} numberOfLines={1}>
                {plan.foodName ?? item.text}
              </Text>
              <Text style={s.link} onPress={() => patch(i, { remove: false })} suppressHighlighting>
                Put back
              </Text>
            </Animated.View>
          )
        const asking = plan.foodName === null || editing === i
        const showUnits = !plan.ready || editing === i
        const option = plan.option
        const units = sets?.[i]?.units ?? []
        // The estimate chip and note describe the original estimate, so they hide once another food is picked.
        const onEstimate = item.aiEstimate && (fix.foodId ?? item.food?._id) === item.food?._id
        return (
          <Animated.View key={i} entering={spring.delay(i * 70)} layout={LinearTransition.springify()} style={s.item}>
            <Tap
              style={s.itemTop}
              scale={motion.press.rowScale}
              onPress={() => setEditing(editing === i ? null : i)}
              accessibilityRole="button"
              accessibilityLabel={`Change ${plan.foodName ?? item.text}`}
            >
              <View style={s.grow}>
                <View style={s.nameRow}>
                  <Text style={s.itemName}>{plan.foodName ?? `"${item.text}"`}</Text>
                  {onEstimate ? <Tag text="AI estimate" tone="est" /> : null}
                </View>
                {onEstimate && item.note ? <Text style={s.metaText}>{item.note}</Text> : null}
                {onEstimate ? item.webSources.map((source) => (
                  <Text key={source.url} style={s.link} onPress={() => void Linking.openURL(source.url)} suppressHighlighting>
                    Source: {source.title}
                  </Text>
                )) : null}
                {item.reasons.includes('sugar_double_count') && sugarKept && fix.foodId === undefined ? (
                  <Text style={s.why}>This drink may already include sugar. Check the drink or remove the separate sugar.</Text>
                ) : null}
                <View style={s.meta}>
                  <Text style={s.metaText}>
                    {metaOf(plan)}
                    {plan.protein !== null ? ` · ${Math.round(plan.protein)} g protein` : ''}
                  </Text>
                  {item.fromPhoto && !onEstimate ? <Tag text="estimated" tone="est" /> : null}
                </View>
              </View>
              <Text style={s.itemKcal}>{plan.kcal === null ? '–' : formatNumber(plan.kcal)}</Text>
              <RoundButton icon="x" label={`Remove ${plan.foodName ?? item.text}`} tone="plain" size={32} onPress={() => patch(i, { remove: true })} />
            </Tap>

            {plan.foodName !== null ? (
              <View style={s.amount}>
                {option !== null ? (
                  <Stepper
                    value={plan.quantity === null ? '–' : formatQuantity(plan.quantity)}
                    typeText={plan.quantity === null ? '' : String(plan.quantity)}
                    label={option.label}
                    onType={(text) => patch(i, { quantity: parseQuantity(text) })}
                    onStep={(d) => {
                      // A new amount starts at 1. Steps go down to a quarter, so small amounts are reachable by tapping.
                      if (plan.quantity === null) return patch(i, { quantity: 1 })
                      const q = plan.quantity
                      const step = HALF_UNITS.has(option.unit ?? 'piece') || q <= 1 ? 0.5 : 1
                      patch(i, { quantity: Math.max(MIN_QUANTITY, q + d * step) })
                    }}
                  />
                ) : null}
                {showUnits ? (
                  <View style={s.units}>
                    {units.map((u) => {
                      const on = option?.unit === u.unit
                      return (
                        <Tap
                          key={u.unit === null ? 'count:null' : `unit:${u.unit}`}
                          style={[s.chip, on && s.chipOn]}
                          scale={0.97}
                          onPress={() => patch(i, { unit: u.unit, quantity: plan.quantity ?? 1 })}
                          accessibilityRole="button"
                        >
                          <Text style={[s.chipText, on && s.chipTextOn]}>{u.label}</Text>
                        </Tap>
                      )
                    })}
                  </View>
                ) : null}
                {!plan.ready ? <Text style={s.why}>{`Pick an amount for ${item.text}`}</Text> : null}
              </View>
            ) : null}

            {item.requestedDate !== null && !fix.localDate ? (
              <View style={s.dateNote}>
                <Text style={s.why}>
                  This says {item.requestedDate}, which can't be logged. Pick today, or remove it.
                </Text>
                {today ? (
                  <Button label={`Log for today, ${formatDayTitle(today)}`} size="sm" variant="ghost" onPress={() => patch(i, { localDate: today })} />
                ) : null}
              </View>
            ) : null}

            {asking ? (
              <FoodPicker
                item={item}
                chosen={fix.foodId ?? item.food?._id ?? null}
                onPick={(foodId, foodName) => {
                  patch(i, foodId === item.food?._id ? { foodId: undefined, foodName: undefined } : { foodId, foodName })
                  setEditing(null)
                }}
              />
            ) : null}
          </Animated.View>
        )
      })}

      {photo ? (
        <Text style={s.foot}>Photos are estimates, so I always check first. Tap an item to fix it.</Text>
      ) : (
        <Text style={s.foot}>Tap an item to change the food. Your picks are remembered next time.</Text>
      )}
      {problem ? <Text style={s.problem}>{problem}</Text> : null}
      <View style={s.actions}>
        <Button label="Discard" variant="ghost" busy={busy === 'discard'} disabled={busy !== null} onPress={() => void discard()} />
        <Button
          label={
            kept.length === 0
              ? 'Nothing to log'
              : `Log ${kept.length} item${kept.length === 1 ? '' : 's'}${total !== null ? ` · ${formatNumber(total)} kcal` : ''}`
          }
          variant="coral"
          style={s.grow}
          busy={busy === 'confirm'}
          disabled={busy !== null || kept.length === 0 || !ready}
          onPress={() => void confirm()}
        />
      </View>
      {missingFood && kept.length > 0 ? <Text style={s.foot}>Pick a food for each item, or remove it.</Text> : null}
    </View>
  )
}

// "Closest to?" options: the matcher's candidates plus a search over the food database.
function FoodPicker({
  item,
  chosen,
  onPick,
}: {
  item: DraftItem
  chosen: FoodId | null
  onPick: (foodId: FoodId, foodName: string) => void
}) {
  const t = useTheme()
  const s = useStyles()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])
  const results = useQuery(api.foods_db.searchFoods, debounced.length >= 2 ? { query: debounced, limit: 5 } : 'skip')
  const options = debounced.length >= 2 ? (results ?? []).map((f) => ({ _id: f._id, name: f.name, sub: `${formatNumber(f.per100g.kcal)} kcal / 100 g` })) : item.candidates.map((c) => ({ ...c, sub: '' }))
  const unmatched = item.food === null

  return (
    <Animated.View entering={spring} style={s.picker}>
      <Text style={s.ask}>{unmatched ? `What's "${item.text}" closest to?` : 'Not right? Pick another.'}</Text>
      {unmatched ? (
        <Text style={s.why}>No solid match in IFCT, USDA or Open Food Facts. Pick one and I'll remember it.</Text>
      ) : null}
      <TextInput
        style={s.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search foods"
        placeholderTextColor={t.c.ink3}
        autoCorrect={false}
        accessibilityLabel="Search foods"
      />
      <View style={s.opts}>
        {options.map((o) => (
          <Tap
            key={o._id}
            style={[s.opt, chosen === o._id && s.optOn]}
            scale={0.97}
            onPress={() => onPick(o._id, o.name)}
            accessibilityRole="button"
          >
            <Text style={[s.optText, chosen === o._id && s.optTextOn]} numberOfLines={2}>
              {o.name}
            </Text>
            {o.sub ? <Text style={[s.optSub, chosen === o._id && s.optTextOn]}>{o.sub}</Text> : null}
          </Tap>
        ))}
        {options.length === 0 ? (
          <Text style={s.why}>{debounced.length >= 2 && results !== undefined ? 'No foods found. Try another word.' : 'Type to search.'}</Text>
        ) : null}
      </View>
    </Animated.View>
  )
}

const useStyles = themedStyles((t) => ({
  grow: { flex: 1 },
  wrap: { marginTop: 18 },
  note: { ...font('callout'), color: t.c.ink2, marginTop: 18 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  title: { ...font('section'), fontSize: 18, color: t.c.ink },
  total: { ...font('value'), fontSize: 15, color: t.c.ink },
  item: {
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 8,
    backgroundColor: t.c.card,
    borderRadius: 16,
    boxShadow: t.shadow.card,
    marginBottom: 8,
  },
  removed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: 0.7, paddingRight: 14 },
  struck: { flex: 1, textDecorationLine: 'line-through', color: t.c.ink3 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { ...font('bodyStrong'), color: t.c.ink },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  metaText: { ...font('caption'), color: t.c.ink3 },
  itemKcal: { ...font('value'), color: t.c.ink },
  amount: { marginTop: 10, gap: 8, alignItems: 'flex-start' },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radii.sm, backgroundColor: t.c.card2 },
  chipOn: { backgroundColor: t.c.ink },
  chipText: { ...font('caption'), color: t.c.ink2 },
  chipTextOn: { color: t.c.bg },
  dateNote: { marginTop: 10, gap: 8, alignItems: 'flex-start', paddingRight: 6 },
  picker: { marginTop: 12, paddingRight: 6 },
  ask: { ...font('value'), color: t.c.ink },
  why: { ...font('caption'), color: t.c.ink3, marginTop: 4 },
  search: {
    ...font('input'),
    color: t.c.ink,
    backgroundColor: t.c.card2,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  opts: { gap: 8, marginTop: 10 },
  opt: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radii.sm,
    backgroundColor: t.c.card2,
  },
  optOn: { backgroundColor: t.c.ink },
  optText: { ...font('input'), fontFamily: font('bodyStrong').fontFamily, color: t.c.ink, flex: 1 },
  optSub: { ...font('caption'), color: t.c.ink3 },
  optTextOn: { color: t.c.bg },
  link: { ...font('link'), color: t.c.ink2, paddingVertical: 4 },
  foot: { ...font('caption'), lineHeight: 19, color: t.c.ink3, marginTop: 6, marginHorizontal: 2 },
  problem: { ...font('caption'), color: t.c.poloInk, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
}))
