import { useContext, useState } from 'react'
import { Share, Text, TextInput, View } from 'react-native'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useAuth } from '@clerk/expo'
import { useAction, useConvex, useMutation, useQuery } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { motion, radii } from '@stride/ui-tokens'
import { Button, RoundButton } from '@/components/Controls'
import { ListCard, ListRow } from '@/components/ListRow'
import { Screen, ScreenTitle, Section } from '@/components/Screen'
import { Sheet } from '@/components/Sheet'
import { Tap } from '@/components/Tap'
import { TimeZoneGate } from '@/components/TimeZoneGate'
import { isDevChannel } from '@/lib/devUpdates'
import { plainError } from '@/lib/log'
import { HoldAppContext, savedUnits, type Units } from '@/lib/profile'
import { font, setThemePref, themedStyles, useThemePref, type ThemePref } from '@/theme'

type SheetKind = 'clear' | 'delete' | 'key'

const UNIT_OPTIONS: { value: Units; label: string }[] = [
  { value: 'metric', label: 'Metric' },
  { value: 'imperial', label: 'Imperial' },
]
const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]
const DELETE_WORD = 'DELETE'
const FOOD_CREDITS = 'Food data: IFCT 2017 (NIN, India), USDA FoodData Central, UK CoFID 2021, Open Food Facts (ODbL). Contains public sector information licensed under the Open Government Licence v3.0.'

// Settings route. Units, theme, data, account and about. Each change saves on its own.
export default function SettingsScreen() {
  return (
    <TimeZoneGate>
      <Settings />
    </TimeZoneGate>
  )
}

// The settings list, with the confirm sheet for clearing data or deleting the account.
function Settings() {
  const s = useStyles()
  const profile = useQuery(api.progress_v2.profile, {})
  const ownKey = useQuery(api.api_keys.openRouterKeyStatus, {})
  const pref = useThemePref()
  const convex = useConvex()
  const setUnits = useMutation(api.progress_v2.setUnits)
  const { signOut } = useAuth()
  const setHoldApp = useContext(HoldAppContext)
  const [unitsError, setUnitsError] = useState<string | null>(null)
  const [dataError, setDataError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [open, setOpen] = useState(false)
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  // True while a sheet action runs. The sheet ignores every close path until it finishes.
  const [sheetBusy, setSheetBusy] = useState(false)
  const units = savedUnits(profile?.units)
  const ownLast4 = ownKey?.set ? ownKey.last4 : null
  const keyValue = ownKey === undefined ? '…' : ownLast4 ? `Yours ••••${ownLast4}` : "Stride's key"

  // Saves the units choice on the server.
  async function chooseUnits(next: Units) {
    setUnitsError(null)
    try {
      await setUnits({ units: next })
    } catch (err) {
      setUnitsError(plainError(err))
    }
  }

  // Reads all of the caller's data and opens the share sheet with it as JSON.
  async function exportData() {
    setDataError(null)
    setExporting(true)
    try {
      const data = await convex.query(api.users.exportAllData, {})
      await Share.share({ title: 'Stride export', message: JSON.stringify(data, null, 2) })
    } catch (err) {
      setDataError(plainError(err))
    } finally {
      setExporting(false)
    }
  }

  // Opens the confirm sheet for a destructive action.
  function openSheet(kind: SheetKind) {
    setSheet(kind)
    setOpen(true)
  }

  return (
    <>
      <Screen>
        <RoundButton icon="back" label="Back" onPress={() => router.back()} />
        <ScreenTitle eyebrow="You" title="Settings" />

        <Section title="Preferences" />
        <ListCard>
          <SegmentRow
            label="Units"
            detail={units === 'metric' ? 'Kilograms and centimetres' : 'Pounds, feet and inches'}
            options={UNIT_OPTIONS}
            value={units}
            onChange={(next) => void chooseUnits(next)}
          />
          <SegmentRow
            label="Theme"
            detail={pref === 'system' ? 'Follows your phone' : pref === 'light' ? 'Always light' : 'Always dark'}
            options={THEME_OPTIONS}
            value={pref}
            onChange={setThemePref}
            last
          />
        </ListCard>
        {unitsError ? <Text style={s.error}>{unitsError}</Text> : null}

        <Section title="AI" />
        <ListCard>
          <ListRow
            label="OpenRouter key"
            detail="Use your own key. Your AI use then doesn't count against the daily allowance."
            value={keyValue}
            onPress={ownKey === undefined ? undefined : () => openSheet('key')}
            last
          />
        </ListCard>

        <Section title="Data" />
        <ListCard>
          <ListRow
            label={exporting ? 'Preparing export' : 'Export data'}
            detail="Everything you've logged, as JSON"
            busy={exporting}
            onPress={() => void exportData()}
          />
          <ListRow label="Clear all data" detail="Logs, weights, chats and profile" danger onPress={() => openSheet('clear')} last />
        </ListCard>
        {dataError ? <Text style={s.error}>{dataError}</Text> : null}

        <Section title="Account" />
        <ListCard>
          <ListRow label="Sign out" onPress={() => void signOut()} />
          <ListRow label="Delete account" detail="Your data and your sign-in" danger onPress={() => openSheet('delete')} last />
        </ListCard>

        <Section title="About" />
        <ListCard>
          <ListRow label="Version" value={Constants.expoConfig?.version ?? 'Unknown'} last={!isDevChannel} />
          {isDevChannel ? <ListRow label="Testing" value={process.env.EXPO_PUBLIC_BUILD_LABEL || 'APK only'} last /> : null}
        </ListCard>
        <Text style={s.caption}>{FOOD_CREDITS}</Text>
      </Screen>

      <Sheet
        open={open}
        onClose={() => {
          if (!sheetBusy) setOpen(false)
        }}
        onClosed={() => {
          setSheet(null)
          setHoldApp(false)
        }}
      >
        {sheet === 'clear' ? <ClearForm onDone={() => setOpen(false)} /> : null}
        {sheet === 'key' ? <KeyForm last4={ownLast4} onDone={() => setOpen(false)} onBusy={setSheetBusy} /> : null}
        {sheet === 'delete' ? <DeleteForm onDone={() => setOpen(false)} onBusy={setSheetBusy} /> : null}
      </Sheet>
    </>
  )
}

// A setting with its label and current meaning on top, and the choice underneath.
function SegmentRow<T extends string>({
  label,
  detail,
  options,
  value,
  onChange,
  last = false,
}: {
  label: string
  detail: string
  options: { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
  last?: boolean
}) {
  const s = useStyles()
  return (
    <View style={[s.segRow, !last && s.segRowLine]}>
      <Text style={s.segRowLabel}>{label}</Text>
      <Text style={s.segRowDetail}>{detail}</Text>
      <Segment label={label} options={options} value={value} onChange={onChange} />
    </View>
  )
}

// Side-by-side choice where the picked option is filled.
function Segment<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
}) {
  const s = useStyles()
  return (
    <View style={s.segment} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const on = option.value === value
        return (
          <Tap
            key={option.value}
            onPress={() => onChange(option.value)}
            scale={motion.press.rowScale}
            style={[s.segItem, on && s.segOn]}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={option.label}
          >
            <Text style={[s.segLabel, on && s.segLabelOn]}>{option.label}</Text>
          </Tap>
        )
      })}
    </View>
  )
}

// Confirm step for clearing data. The root gate sends the user to onboarding once the profile is gone.
function ClearForm({ onDone }: { onDone: () => void }) {
  const s = useStyles()
  const clearAllData = useMutation(api.users.clearAllData)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Deletes the caller's logs, weights, chats and profile.
  async function clear() {
    setBusy(true)
    setError(null)
    try {
      await clearAllData({})
      onDone()
    } catch (err) {
      setError(plainError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View>
      <Text style={s.sheetEyebrow}>Data</Text>
      <Text style={s.sheetTitle}>Clear all data?</Text>
      <Text style={s.body}>This deletes your logs, weights, chats and profile. It can&apos;t be undone. Your account stays.</Text>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Button label="Clear all data" variant="coral" icon="trash" size="block" busy={busy} onPress={() => void clear()} style={s.danger} />
      <Button label="Cancel" variant="ghost" size="block" disabled={busy} onPress={onDone} style={s.gap} />
    </View>
  )
}

// Confirm step for deleting the account. Delete stays off until DELETE is typed. A failure keeps the sheet open.
function DeleteForm({ onDone, onBusy }: { onDone: () => void; onBusy: (busy: boolean) => void }) {
  const s = useStyles()
  const deleteAccount = useAction(api.users.deleteAccount)
  const { signOut } = useAuth()
  const setHoldApp = useContext(HoldAppContext)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Deletes the caller's data and Clerk user, then signs out. Holds the app mounted so a failure can show here.
  async function remove() {
    setBusy(true)
    onBusy(true)
    setError(null)
    setHoldApp(true)
    try {
      await deleteAccount({})
      await signOut()
      // Settings unmounts once signed out, so release the hold here rather than on sheet close.
      setHoldApp(false)
      onDone()
    } catch (err) {
      setError(plainError(err))
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }

  return (
    <View>
      <Text style={s.sheetEyebrow}>Account</Text>
      <Text style={s.sheetTitle}>Delete account?</Text>
      <Text style={s.body}>This deletes your data and your sign-in. It can&apos;t be undone. Type {DELETE_WORD} to confirm.</Text>
      <TextInput
        value={typed}
        onChangeText={setTyped}
        placeholder={DELETE_WORD}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy}
        style={s.input}
        accessibilityLabel={`Type ${DELETE_WORD} to confirm`}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Button
        label="Delete account"
        variant="coral"
        icon="trash"
        size="block"
        disabled={typed !== DELETE_WORD}
        busy={busy}
        onPress={() => void remove()}
        style={s.danger}
      />
      <Button label="Cancel" variant="ghost" size="block" disabled={busy} onPress={onDone} style={s.gap} />
    </View>
  )
}

// Sheet for the user's own OpenRouter key. The server checks a saved key with OpenRouter. Once set, the key can be replaced or removed.
function KeyForm({ last4, onDone, onBusy }: { last4: string | null; onDone: () => void; onBusy: (busy: boolean) => void }) {
  const s = useStyles()
  const saveKey = useAction(api.api_keys.saveOpenRouterKey)
  const removeKey = useMutation(api.api_keys.removeOpenRouterKey)
  const [draft, setDraft] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [pending, setPending] = useState<'save' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const editing = last4 === null || replacing

  // Saves the typed key. The field is cleared on success before the sheet closes.
  async function save() {
    setPending('save')
    onBusy(true)
    setError(null)
    try {
      await saveKey({ key: draft.trim() })
      setDraft('')
      onDone()
    } catch (err) {
      setError(plainError(err))
    } finally {
      setPending(null)
      onBusy(false)
    }
  }

  // Removes the saved key, so Stride's key is used again.
  async function remove() {
    setPending('remove')
    onBusy(true)
    setError(null)
    try {
      await removeKey({})
      onDone()
    } catch (err) {
      setError(plainError(err))
    } finally {
      setPending(null)
      onBusy(false)
    }
  }

  return (
    <View>
      <Text style={s.sheetEyebrow}>AI</Text>
      <Text style={s.sheetTitle}>OpenRouter key</Text>
      {editing ? (
        <>
          <Text style={s.body}>Stride stores it on the server and never shows it again.</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="sk-or-…"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={pending === null}
            style={s.input}
            accessibilityLabel="OpenRouter key"
          />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Button label="Save key" size="block" disabled={draft.trim() === ''} busy={pending === 'save'} onPress={() => void save()} />
        </>
      ) : (
        <>
          <Text style={s.body}>Using your key ending ••••{last4}.</Text>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Button label="Replace key" variant="ghost" size="block" disabled={pending !== null} onPress={() => setReplacing(true)} style={s.gap} />
          <Button
            label="Remove key"
            variant="coral"
            icon="trash"
            size="block"
            disabled={pending !== null}
            busy={pending === 'remove'}
            onPress={() => void remove()}
            style={[s.danger, s.gap]}
          />
        </>
      )}
      <Button label="Cancel" variant="ghost" size="block" disabled={pending !== null} onPress={onDone} style={s.gap} />
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  segRow: { paddingVertical: 14 },
  segRowLine: { borderBottomWidth: 1, borderBottomColor: t.c.line },
  segRowLabel: { ...font('bodyStrong'), color: t.c.ink },
  segRowDetail: { ...font('caption'), color: t.c.ink3, marginTop: 2, marginBottom: 12 },
  segment: { flexDirection: 'row', backgroundColor: t.c.card2, borderRadius: radii.pill, padding: 4, gap: 4 },
  segItem: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
  segOn: { backgroundColor: t.c.card, boxShadow: t.shadow.card },
  segLabel: { ...font('callout'), color: t.c.ink3 },
  segLabelOn: { ...font('calloutStrong'), color: t.c.ink },
  caption: { ...font('caption'), color: t.c.ink3, marginTop: 12, marginHorizontal: 2 },
  error: { ...font('callout'), color: t.c.poloInk, marginTop: 10, marginHorizontal: 2 },
  sheetEyebrow: { ...font('eyebrow'), color: t.c.ink3 },
  sheetTitle: { ...font('cardTitle'), color: t.c.ink, marginTop: 4, marginBottom: 8 },
  body: { ...font('callout'), color: t.c.ink2, marginBottom: 18 },
  input: {
    ...font('input'),
    color: t.c.ink,
    height: 52,
    paddingHorizontal: 16,
    marginBottom: 18,
    borderRadius: radii.card,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  danger: { backgroundColor: t.c.poloInk },
  gap: { marginTop: 10 },
}))

export { RouteError as ErrorBoundary } from '@/components/RouteError'
