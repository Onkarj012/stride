import { useEffect, useRef, useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useAction, useMutation } from 'convex/react'
import { useAuth } from '@clerk/expo'
import type { FunctionArgs } from 'convex/server'
import { inferSlot } from '@stride/core'
import { api } from 'stride-backend/convex/_generated/api'
import { motion, radii } from '@stride/ui-tokens'
import { formatClock, formatGrams, formatNumber } from '@/lib/format'
import {
  SLOT_NAMES,
  linesKcal,
  newSubmissionId,
  plainError,
  PlainError,
  readAudioBase64,
  uploadPhoto,
  type BarcodeFood,
  type DraftId,
  type EntryId,
  type LogLine,
  type LogResult,
  type MealSlot,
} from '@/lib/log'
import { font, themedStyles, useTheme } from '@/theme'
import { BarcodeScanner, PhotoCapture, ScanningPhoto, VoiceCapture } from './Capture'
import { Button, RoundButton, Stepper, Tag, Thinking } from './Controls'
import { DraftCard } from './DraftCard'
import { useLog } from './LogProvider'
import { Polo, type PoloMood } from './Polo'
import { Tap } from './Tap'

export type ComposeMode = 'text' | 'voice' | 'photo' | 'barcode'

type LogInput = FunctionArgs<typeof api.pipeline.log.logInput>['input']

type Phase =
  | { kind: 'input' }
  | { kind: 'voice' }
  | { kind: 'photo' }
  | { kind: 'barcode' }
  | { kind: 'working'; label: string; photoUri?: string }
  | { kind: 'committed'; lines: LogLine[] }
  | { kind: 'draft'; draftId: DraftId }
  | { kind: 'product'; food: BarcodeFood }
  | { kind: 'empty' }
  | { kind: 'error'; message: string; retry?: () => void }

const EXAMPLES = [
  '2 roti, katori dal, bhindi, chai',
  'chicken biryani from the canteen',
  '3 idli, sambar and filter coffee',
  'a bowl of poha and a banana',
]

const WORKING_TEXT = 'Matching to IFCT and your usuals…'

// Toast line for a log: the food names, shortened.
function namesOf(lines: LogLine[]): string {
  const names = lines.map((l) => l.foodName ?? l.text)
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
}

// The compose sheet (mock #/compose): type, talk, snap or scan; then auto-log with undo, or a draft that asks.
export function Compose({ initialMode, defaultSlot, initialDraftId, onClose }: { initialMode: ComposeMode; defaultSlot?: MealSlot; initialDraftId?: DraftId; onClose: () => void }) {
  const t = useTheme()
  const s = useStyles()
  const { toast, undoFor } = useLog()
  const { getToken } = useAuth()
  const logInput = useAction(api.pipeline.log.logInput)
  const lookupBarcode = useAction(api.pipeline.barcode.lookupBarcode)
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl)
  const [phase, setPhase] = useState<Phase>(() => initialDraftId ? { kind: 'draft', draftId: initialDraftId } : (initialMode === 'text' ? { kind: 'input' } : { kind: initialMode }))
  const [text, setText] = useState('')
  const [hops, setHops] = useState(1)
  const alive = useRef(true)
  const now = new Date()
  const slot = SLOT_NAMES[defaultSlot ?? inferSlot(now.getHours(), now.getMinutes())]
  const clock = formatClock(`${now.getHours()}:${now.getMinutes()}`, true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // Sets the phase only while the sheet is still showing.
  function go(next: Phase) {
    if (alive.current) setPhase(next)
  }

  // Tells the user what was saved, with the 10 s undo, and closes the sheet.
  function announce(entryIds: EntryId[], lines: LogLine[], sub?: string) {
    const kcal = linesKcal(lines)
    toast({
      title: kcal === null ? 'Logged' : `Logged · ${formatNumber(kcal)} kcal`,
      sub: sub ?? namesOf(lines),
      undo: undoFor(entryIds),
    })
  }

  // Routes a pipeline result: committed shows the lines and closes, draft asks, empty explains.
  function handle(result: LogResult) {
    if (result.kind === 'committed') {
      announce(result.entryIds, result.lines)
      go({ kind: 'committed', lines: result.lines })
      setHops((n) => n + 1)
      setTimeout(() => alive.current && onClose(), 900)
    } else if (result.kind === 'draft') go({ kind: 'draft', draftId: result.draftId })
    else go({ kind: 'empty' })
  }

  // Sends one input through logInput. A retry reuses the submission id, so the server logs it at most once.
  async function run(input: LogInput, label: string, submissionId = newSubmissionId(), photoUri?: string) {
    go({ kind: 'working', label, photoUri })
    try {
      handle(await logInput({ submissionId, input, ...(defaultSlot ? { defaultSlot } : {}) }))
    } catch (err) {
      go({ kind: 'error', message: plainError(err), retry: () => void run(input, label, submissionId, photoUri) })
    }
  }

  // Logs what is typed in the box.
  function submitText(value = text) {
    const trimmed = value.trim()
    if (!trimmed) {
      setHops((n) => n + 1)
      return
    }
    setText(trimmed)
    void run({ kind: 'text', text: trimmed }, WORKING_TEXT)
  }

  // Sends a finished voice note; reading the file is retried along with the call.
  async function submitVoice(uri: string) {
    const submissionId = newSubmissionId()
    const attempt = async () => {
      go({ kind: 'working', label: 'Listening back…' })
      try {
        const audio = await readAudioBase64(uri)
        await run({ kind: 'voice', audio, mimeType: 'audio/mp4' }, 'Listening back…', submissionId)
      } catch (err) {
        go({ kind: 'error', message: plainError(err), retry: () => void attempt() })
      }
    }
    await attempt()
  }

  // Uploads a photo, records it as the user's, then asks the pipeline to read it.
  async function submitPhoto(uri: string) {
    const submissionId = newSubmissionId()
    const attempt = async () => {
      go({ kind: 'working', label: 'Looking at your plate…', photoUri: uri })
      try {
        const token = await getToken({ template: 'convex' })
        if (!token) throw new PlainError('You are signed out. Sign in again.')
        const storageId = await uploadPhoto(await generateUploadUrl({}), uri, token)
        await run({ kind: 'photo', storageId }, 'Looking at your plate…', submissionId, uri)
      } catch (err) {
        go({ kind: 'error', message: plainError(err), retry: () => void attempt() })
      }
    }
    await attempt()
  }

  // Looks a scanned barcode up in the cache or Open Food Facts.
  async function submitCode(code: string) {
    go({ kind: 'working', label: 'Checking Open Food Facts…' })
    try {
      const food = await lookupBarcode({ barcode: code })
      go(food ? { kind: 'product', food } : { kind: 'error', message: "That barcode isn't in Open Food Facts yet. Type the food instead." })
    } catch (err) {
      go({ kind: 'error', message: plainError(err), retry: () => void submitCode(code) })
    }
  }

  const mood: PoloMood =
    phase.kind === 'committed' ? 'happy' : phase.kind === 'voice' || phase.kind === 'error' || phase.kind === 'empty' ? 'wow' : 'idle'
  const showBox = phase.kind === 'input' || phase.kind === 'empty'

  return (
    <View>
      <View style={s.head}>
        <Polo size={46} mood={mood} hop={hops} />
        <View style={s.headText}>
          <Text style={s.headTitle}>
            {phase.kind === 'photo' ? 'Show me the plate.' : phase.kind === 'barcode' ? 'Scan the pack.' : 'What did you have?'}
          </Text>
          <Text style={s.slot}>
            Logging to <Text style={s.slotName}>{slot}</Text> · {clock}
          </Text>
        </View>
      </View>

      {showBox ? (
        <>
          <TextInput
            style={s.box}
            value={text}
            onChangeText={setText}
            placeholder="2 roti, katori dal, bhindi, chai"
            placeholderTextColor={t.c.ink3}
            multiline
            autoFocus={initialMode === 'text'}
            submitBehavior="blurAndSubmit"
            returnKeyType="send"
            onSubmitEditing={() => submitText()}
            maxLength={2000}
            accessibilityLabel="What did you have?"
          />
          <View style={s.bar}>
            <RoundButton icon="cam" label="Photo" tone="card" size={46} onPress={() => go({ kind: 'photo' })} />
            <RoundButton icon="mic" label="Voice" tone="card" size={46} onPress={() => go({ kind: 'voice' })} />
            <RoundButton icon="barcode" label="Scan a barcode" tone="card" size={46} onPress={() => go({ kind: 'barcode' })} />
            <View style={s.grow} />
            <Button label="Log it" variant="coral" icon="up" iconAfter onPress={() => submitText()} />
          </View>
          {phase.kind === 'empty' ? (
            <Text style={s.note}>I didn't catch any food there. Try "2 roti and dal".</Text>
          ) : (
            <View>
              <Text style={s.chipsLabel}>Try one</Text>
              <View style={s.chips}>
                {EXAMPLES.map((example) => (
                  <Tap
                    key={example}
                    style={s.chip}
                    scale={motion.press.cardScale}
                    onPress={() => {
                      setText(example)
                      submitText(example)
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={s.chipText}>{example}</Text>
                  </Tap>
                ))}
              </View>
              <Text style={s.hint}>
                Say it however you'd say it. Katori, glass, roti and plate all count. Clear matches log straight away with
                an undo. Anything fuzzy, I'll ask.
              </Text>
            </View>
          )}
        </>
      ) : null}

      {phase.kind === 'voice' ? (
        <VoiceCapture onDone={(uri) => void submitVoice(uri)} onCancel={() => go({ kind: 'input' })} />
      ) : null}
      {phase.kind === 'photo' ? (
        <PhotoCapture onPhoto={(uri) => void submitPhoto(uri)} onCancel={() => go({ kind: 'input' })} />
      ) : null}
      {phase.kind === 'barcode' ? (
        <BarcodeScanner onCode={(code) => void submitCode(code)} onCancel={() => go({ kind: 'input' })} />
      ) : null}

      {phase.kind === 'working' ? (
        <View>
          {phase.photoUri ? <ScanningPhoto uri={phase.photoUri} /> : null}
          {!phase.photoUri && text ? <Text style={s.echo}>{text}</Text> : null}
          <Thinking label={phase.label} />
        </View>
      ) : null}

      {phase.kind === 'committed' ? (
        <View style={s.result}>
          <LineList title={`Looks like ${slot.toLowerCase()}`} lines={phase.lines} />
          <Thinking label="All clear matches. Logged." />
        </View>
      ) : null}

      {phase.kind === 'draft' ? (
        <DraftCard
          draftId={phase.draftId}
          onCommitted={(result) => {
            if (result.kind === 'committed') announce(result.entryIds, result.lines, 'Confirmed · edit anytime')
            onClose()
          }}
          onDiscarded={() => {
            toast({ title: 'Discarded. Nothing logged.' })
            onClose()
          }}
        />
      ) : null}

      {phase.kind === 'product' ? (
        <BarcodeProduct
          food={phase.food}
          defaultSlot={defaultSlot}
          onLogged={(entryIds, kcal) => {
            toast({
              title: `Logged · ${formatNumber(kcal)} kcal`,
              sub: `${phase.food.name} · Open Food Facts`,
              undo: undoFor(entryIds),
            })
            onClose()
          }}
          onRescan={() => go({ kind: 'barcode' })}
        />
      ) : null}

      {phase.kind === 'error' ? (
        <Animated.View entering={FadeInDown.springify().stiffness(300).damping(17)} style={s.ask}>
          <Text style={s.askTitle}>That didn't go through.</Text>
          <Text style={s.askBody}>{phase.message}</Text>
          <View style={s.askRow}>
            {phase.retry ? <Button label="Try again" onPress={phase.retry} /> : null}
            <Button label={phase.retry ? 'Edit' : 'Back'} variant="ghost" onPress={() => go({ kind: 'input' })} />
          </View>
        </Animated.View>
      ) : null}
    </View>
  )
}

// Server-computed lines of a log as draft-style rows (mock .ditem).
export function LineList({ title, lines }: { title: string; lines: LogLine[] }) {
  const s = useStyles()
  const kcal = linesKcal(lines)
  return (
    <View>
      <View style={s.listHead}>
        <Text style={s.listTitle}>{title}</Text>
        {kcal === null ? null : <Text style={s.listKcal}>{formatNumber(kcal)} kcal</Text>}
      </View>
      {lines.map((line, i) => (
        <Animated.View
          key={`${line.text}-${i}`}
          entering={FadeInDown.delay(i * 70).springify().stiffness(300).damping(17)}
          style={s.item}
        >
          <View style={s.grow}>
            <Text style={s.itemName}>{line.foodName ?? line.text}</Text>
            <View style={s.itemMeta}>
              <Text style={s.itemQ}>{line.grams === null ? line.text : formatGrams(line.grams)}</Text>
              {line.estimated ? <Tag text="estimated" tone="est" /> : null}
            </View>
          </View>
          <Text style={s.itemKcal}>{line.kcal === null ? '?' : formatNumber(line.kcal)}</Text>
        </Animated.View>
      ))}
    </View>
  )
}

// A scanned product: pick the grams, then log it with addEntries. Nutrients come back from the server.
function BarcodeProduct({
  food,
  defaultSlot,
  onLogged,
  onRescan,
}: {
  food: BarcodeFood
  defaultSlot?: MealSlot
  onLogged: (entryIds: EntryId[], kcal: number) => void
  onRescan: () => void
}) {
  const s = useStyles()
  const addEntries = useMutation(api.entries.addEntries)
  const [grams, setGrams] = useState(Math.round(food.servingGrams ?? 100))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const submissionId = useRef(newSubmissionId())
  const step = grams < 50 ? 5 : grams < 200 ? 10 : 25
  // Preview only: the server's per-100 g value times the chosen grams. The stored entry is computed server-side.
  const kcal = (food.per100g.kcal * grams) / 100

  // Writes the entry; retries reuse the same submission id.
  async function log() {
    setBusy(true)
    setProblem(null)
    try {
      const ids = await addEntries({ submissionId: submissionId.current, items: [{ foodId: food.foodId, grams, source: 'barcode', ...(defaultSlot ? { slot: defaultSlot } : {}) }] })
      onLogged(ids, kcal)
    } catch (err) {
      setProblem(plainError(err))
      setBusy(false)
    }
  }

  return (
    <Animated.View entering={FadeInDown.springify().stiffness(300).damping(17)} style={s.ask}>
      <Text style={s.askTitle}>{food.name}</Text>
      <Text style={s.askBody}>
        {formatNumber(food.per100g.kcal)} kcal per 100 g · {Math.round(food.per100g.protein)} g protein
        {food.servingGrams ? ` · a serving is ${formatGrams(food.servingGrams)}` : ''}
      </Text>
      <View style={s.productRow}>
        <Stepper
          value={formatGrams(grams)}
          label="grams"
          onStep={(d) => setGrams((g) => Math.min(5000, Math.max(step, g + d * step)))}
        />
        <Text style={s.productKcal}>{formatNumber(kcal)} kcal</Text>
      </View>
      {problem ? <Text style={s.problem}>{problem}</Text> : null}
      <View style={s.askRow}>
        <Button label="Scan again" variant="ghost" disabled={busy} onPress={onRescan} />
        <Button label="Log it" variant="coral" busy={busy} onPress={() => void log()} style={s.grow} />
      </View>
    </Animated.View>
  )
}

const useStyles = themedStyles((t) => ({
  grow: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  headText: { flex: 1 },
  headTitle: { ...font('emptyTitle'), fontSize: 21, color: t.c.ink },
  slot: { ...font('link'), fontFamily: font('secondary').fontFamily, color: t.c.ink2, marginTop: 2 },
  slotName: { color: t.c.ink, textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  box: {
    ...font('emptyTitle'),
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: t.c.ink,
    marginTop: 18,
    minHeight: 64,
    padding: 0,
    textAlignVertical: 'top',
  },
  echo: { ...font('emptyTitle'), fontSize: 25, lineHeight: 30, letterSpacing: -0.5, color: t.c.ink3, marginTop: 18 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  chipsLabel: { ...font('label'), color: t.c.ink3, marginTop: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  chipText: { ...font('secondary'), fontFamily: font('bodyStrong').fontFamily, color: t.c.ink },
  hint: { ...font('caption'), lineHeight: 19, color: t.c.ink3, marginTop: 18 },
  note: { ...font('callout'), color: t.c.ink2, marginTop: 16 },
  result: { marginTop: 18 },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  listTitle: { ...font('section'), fontSize: 18, color: t.c.ink },
  listKcal: { ...font('value'), fontSize: 15, color: t.c.ink },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: t.c.card,
    borderRadius: 16,
    boxShadow: t.shadow.card,
    marginBottom: 8,
  },
  itemName: { ...font('bodyStrong'), color: t.c.ink },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  itemQ: { ...font('caption'), color: t.c.ink3 },
  itemKcal: { ...font('value'), color: t.c.ink },
  ask: {
    marginTop: 18,
    padding: 16,
    borderRadius: radii.md,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  askTitle: { ...font('section'), color: t.c.ink },
  askBody: { ...font('caption'), color: t.c.ink3, marginTop: 4 },
  askRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  productRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  productKcal: { ...font('value'), color: t.c.ink },
  problem: { ...font('caption'), color: t.c.poloInk, marginTop: 10 },
}))
