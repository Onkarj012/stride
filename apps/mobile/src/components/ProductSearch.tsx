import { useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { useAction } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from 'stride-backend/convex/_generated/api'
import { motion, radii } from '@stride/ui-tokens'
import { formatGrams, formatNumber } from '@/lib/format'
import { plainError } from '@/lib/log'
import { font, themedStyles, useTheme } from '@/theme'
import { Button } from './Controls'
import { Tap } from './Tap'

type ProductHit = FunctionReturnType<typeof api.pipeline.barcode.searchProducts>[number]

/** Finds a packaged product by name on Open Food Facts and hands back the picked barcode. */
export function ProductSearch({ initialQuery, busyBarcode, onPick, onCancel }: {
  initialQuery: string
  busyBarcode: string | null
  onPick: (barcode: string, query: string) => void
  onCancel: () => void
}) {
  const t = useTheme()
  const s = useStyles()
  const searchProducts = useAction(api.pipeline.barcode.searchProducts)
  const [query, setQuery] = useState(initialQuery)
  const [hits, setHits] = useState<ProductHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  // Runs one search for the typed name.
  async function search() {
    if (query.trim().length < 2 || busy) return
    setBusy(true)
    setProblem(null)
    try {
      setHits(await searchProducts({ query: query.trim() }))
    } catch (err) {
      setProblem(plainError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={s.card}>
      <Text style={s.title}>Find a product</Text>
      <Text style={s.note}>Brand and product name, like "Pintola high protein oats". Values come from the pack label on Open Food Facts.</Text>
      <View style={s.row}>
        <TextInput
          style={[s.input, s.grow]}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void search()}
          returnKeyType="search"
          autoFocus
          placeholder="Product name"
          placeholderTextColor={t.c.ink3}
          accessibilityLabel="Product name"
        />
        <Button label="Search" variant="coral" size="sm" busy={busy} disabled={query.trim().length < 2} onPress={() => void search()} />
      </View>
      {problem ? <Text style={s.problem}>{problem}</Text> : null}
      {hits?.length === 0 ? <Text style={s.note}>No match with label values. Try fewer words, scan the barcode, or read the label.</Text> : null}
      {hits?.map((hit) => (
        <Tap
          key={hit.barcode}
          style={s.hit}
          scale={motion.press.rowScale}
          disabled={busyBarcode !== null}
          onPress={() => onPick(hit.barcode, query.trim())}
          accessibilityRole="button"
          accessibilityLabel={`Log ${hit.name}`}
        >
          <View style={s.grow}>
            <Text style={s.hitName}>{hit.name}</Text>
            <Text style={s.note}>
              {formatNumber(hit.per100g.kcal)} kcal · {Math.round(hit.per100g.protein)} g protein per 100 g
              {hit.servingGrams ? ` · serving ${formatGrams(hit.servingGrams)}` : ''}
            </Text>
          </View>
          {busyBarcode === hit.barcode ? <Text style={s.note}>Opening…</Text> : null}
        </Tap>
      ))}
      <View style={s.actions}>
        <Button label="Back" variant="ghost" onPress={onCancel} />
      </View>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  card: { marginTop: 18, padding: 16, borderRadius: radii.md, backgroundColor: t.c.card, boxShadow: t.shadow.card, gap: 12 },
  title: { ...font('emptyTitle'), color: t.c.ink, fontSize: 21 },
  note: { ...font('caption'), color: t.c.ink3, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  input: { ...font('body'), color: t.c.ink, backgroundColor: t.c.card2, borderRadius: radii.sm, paddingVertical: 12, paddingHorizontal: 12 },
  hit: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.c.line },
  hitName: { ...font('bodyStrong'), color: t.c.ink },
  problem: { ...font('caption'), color: t.c.poloInk },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
}))
