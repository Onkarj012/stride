import { useEffect, useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated'
import { useMutation, useQuery } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { motion, radii } from '@stride/ui-tokens'
import { formatDayTitle, formatGrams, formatNumber } from '@/lib/format'
import { plainError, type DraftId, type DraftItem, type FoodId, type LogResult } from '@/lib/log'
import { useLocalToday } from '@/lib/useLocalToday'
import { font, themedStyles, useTheme } from '@/theme'
import { Button, RoundButton, Stepper, Tag, Thinking } from './Controls'
import { Tap } from './Tap'

/** One change the user made to a draft item before confirming. */
type Fix = { remove?: boolean; foodId?: FoodId; foodName?: string; grams?: number; quantity?: number; localDate?: string }

const spring = FadeInDown.springify().stiffness(300).damping(17)
const HALF_UNITS = new Set(['katori', 'bowl', 'glass', 'cup', 'plate', 'ladle'])

// "2", "1½" or "0.75" for a quantity.
function formatQuantity(q: number): string {
  const whole = Math.floor(q)
  if (q - whole === 0.5) return whole === 0 ? '½' : `${whole}½`
  return String(Math.round(q * 100) / 100)
}

/** What an item will log as, with the server preview scaled to the user's amount. */
function viewOf(item: DraftItem, fix: Fix) {
  const foodName = fix.foodName ?? item.food?.name ?? null
  const changedFood = fix.foodId !== undefined && fix.foodId !== item.food?._id
  const quantityMode = !changedFood && fix.grams === undefined && item.quantity !== null && item.unit !== null && item.grams !== null
  const grams = fix.grams ?? (changedFood ? null : item.grams)
  let factor = 1
  if (quantityMode && item.quantity) factor = (fix.quantity ?? item.quantity) / item.quantity
  else if (grams !== null && item.grams) factor = grams / item.grams
  // Display only: nutrients scale linearly with grams, and the server recomputes them on confirm.
  const kcal = changedFood || !item.preview ? null : item.preview.kcal * factor
  const protein = changedFood || !item.preview ? null : item.preview.protein * factor
  return { foodName, changedFood, quantityMode, grams, kcal, protein }
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

  if (draft === undefined) return <Thinking label="Opening the draft…" />
  if (draft === null || draft.status !== 'pending')
    return <Text style={s.note}>{draft ? 'This one is already handled. Check Today.' : 'This draft is gone.'}</Text>

  // Merges a change into one item's fix.
  const patch = (index: number, change: Fix) => setFixes((all) => ({ ...all, [index]: { ...all[index], ...change } }))

  const views = draft.items.map((item, i) => viewOf(item, fixes[i] ?? {}))
  const kept = draft.items.map((_, i) => i).filter((i) => fixes[i]?.remove !== true)
  const missingFood = kept.some((i) => views[i]?.foodName === null)
  const total = kept.reduce<number | null>((sum, i) => {
    const k = views[i]?.kcal
    return sum === null || k === null || k === undefined ? null : sum + k
  }, 0)
  const photo = draft.inputKind === 'photo'

  // Sends the fixes; the server resolves amounts to grams and computes every nutrient.
  async function confirm() {
    if (!draft) return
    setBusy('confirm')
    setProblem(null)
    const corrections = Object.entries(fixes)
      .map(([index, fix]) => {
        const item = draft.items[Number(index)]
        // Quantity previews already include any portion fraction; save those same grams.
        const scaledGrams = fix.quantity !== undefined && item?.grams !== null && item?.grams !== undefined &&
          item.quantity !== null && item.quantity > 0 && (fix.foodId === undefined || fix.foodId === item.food?._id)
          ? item.grams * fix.quantity / item.quantity : undefined
        const grams = fix.grams ?? scaledGrams
        return {
          index: Number(index),
          ...(fix.remove ? { remove: true } : {}),
          ...(fix.foodId ? { foodId: fix.foodId } : {}),
          ...(grams !== undefined ? { grams } : {}),
          ...(fix.quantity !== undefined && grams === undefined ? { quantity: fix.quantity } : {}),
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
        const view = views[i]
        if (!view) return null
        if (fix.remove)
          return (
            <Animated.View key={i} layout={LinearTransition.springify()} style={[s.item, s.removed]}>
              <Text style={[s.itemName, s.struck]} numberOfLines={1}>
                {view.foodName ?? item.text}
              </Text>
              <Text style={s.link} onPress={() => patch(i, { remove: false })} suppressHighlighting>
                Put back
              </Text>
            </Animated.View>
          )
        const asking = view.foodName === null || editing === i
        return (
          <Animated.View key={i} entering={spring.delay(i * 70)} layout={LinearTransition.springify()} style={s.item}>
            <Tap
              style={s.itemTop}
              scale={motion.press.rowScale}
              onPress={() => setEditing(editing === i ? null : i)}
              accessibilityRole="button"
              accessibilityLabel={`Change ${view.foodName ?? item.text}`}
            >
              <View style={s.grow}>
                <Text style={s.itemName}>{view.foodName ?? `"${item.text}"`}</Text>
                <View style={s.meta}>
                  <Text style={s.metaText}>
                    {view.quantityMode && item.unit
                      ? `${formatQuantity(fix.quantity ?? item.quantity ?? 1)} ${item.unit}`
                      : view.grams !== null
                        ? formatGrams(view.grams)
                        : view.foodName === null
                          ? 'not matched yet'
                          : 'amount on save'}
                    {view.protein !== null ? ` · ${Math.round(view.protein)} g protein` : ''}
                  </Text>
                  {item.estimated ? <Tag text="estimated" tone="est" /> : null}
                </View>
              </View>
              <Text style={s.itemKcal}>{view.kcal === null ? '–' : formatNumber(view.kcal)}</Text>
              <RoundButton icon="x" label={`Remove ${view.foodName ?? item.text}`} tone="plain" size={32} onPress={() => patch(i, { remove: true })} />
            </Tap>

            {view.foodName !== null ? (
              <View style={s.amount}>
                {view.quantityMode && item.quantity !== null && item.unit !== null ? (
                  <Stepper
                    value={formatQuantity(fix.quantity ?? item.quantity)}
                    label={item.unit}
                    onStep={(d) => {
                      const q = fix.quantity ?? item.quantity ?? 1
                      const unit = item.unit ?? ''
                      const step = HALF_UNITS.has(unit) || q <= 1 ? 0.5 : 1
                      patch(i, { quantity: Math.max(step, q + d * step) })
                    }}
                  />
                ) : (
                  <Stepper
                    value={view.grams === null ? 'grams' : formatGrams(view.grams)}
                    label="grams"
                    onStep={(d) => {
                      const g = view.grams ?? 100
                      const step = g < 50 ? 5 : g < 200 ? 10 : 25
                      patch(i, { grams: view.grams === null ? 100 : Math.min(5000, Math.max(step, g + d * step)) })
                    }}
                  />
                )}
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
          disabled={busy !== null || kept.length === 0 || missingFood}
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
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  metaText: { ...font('caption'), color: t.c.ink3 },
  itemKcal: { ...font('value'), color: t.c.ink },
  amount: { flexDirection: 'row', marginTop: 10 },
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
