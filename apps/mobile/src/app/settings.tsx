import { useState } from 'react'
import { Share, Text, TextInput, View } from 'react-native'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useAuth } from '@clerk/expo'
import { useAction, useConvex, useMutation, useQuery } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { motion, radii } from '@stride/ui-tokens'
import { Button, RoundButton } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { Screen, ScreenTitle, Section } from '@/components/Screen'
import { Sheet } from '@/components/Sheet'
import { Tap } from '@/components/Tap'
import { TimeZoneGate } from '@/components/TimeZoneGate'
import { plainError } from '@/lib/log'
import { deviceUnits, type Units } from '@/lib/profile'
import { font, setThemePref, themedStyles, useTheme, useThemePref, type ThemePref } from '@/theme'

type SheetKind = 'clear' | 'delete'

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
const FOOD_CREDITS = 'Food data: IFCT 2017 (NIN, India), USDA FoodData Central, Open Food Facts (ODbL).'

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
  const pref = useThemePref()
  const convex = useConvex()
  const setUnits = useMutation(api.progress_v2.setUnits)
  const { signOut } = useAuth()
  const [unitsError, setUnitsError] = useState<string | null>(null)
  const [dataError, setDataError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [open, setOpen] = useState(false)
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const units = unitsOf(profile?.units)

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

        <Section title="Units" />
        <View style={s.card}>
          <View style={s.pad}>
            <Segment options={UNIT_OPTIONS} value={units} onChange={(next) => void chooseUnits(next)} />
          </View>
        </View>
        {unitsError ? <Text style={s.error}>{unitsError}</Text> : null}

        <Section title="Theme" />
        <View style={s.card}>
          <View style={s.pad}>
            <Segment options={THEME_OPTIONS} value={pref} onChange={setThemePref} />
          </View>
        </View>

        <Section title="Data" />
        <View style={s.card}>
          <Row label={exporting ? 'Preparing export' : 'Export data'} onPress={exporting ? undefined : () => void exportData()} />
          <Row label="Clear all data" danger onPress={() => openSheet('clear')} />
        </View>
        {dataError ? <Text style={s.error}>{dataError}</Text> : null}

        <Section title="Account" />
        <View style={s.card}>
          <Row label="Sign out" onPress={() => void signOut()} />
          <Row label="Delete account" danger onPress={() => openSheet('delete')} />
        </View>

        <Section title="About" />
        <View style={s.card}>
          <Row label="Version" value={Constants.expoConfig?.version ?? 'Unknown'} />
        </View>
        <Text style={s.caption}>{FOOD_CREDITS}</Text>
      </Screen>

      <Sheet open={open} onClose={() => setOpen(false)} onClosed={() => setSheet(null)}>
        {sheet === 'clear' ? <ClearForm onDone={() => setOpen(false)} /> : null}
        {sheet === 'delete' ? <DeleteForm onDone={() => setOpen(false)} /> : null}
      </Sheet>
    </>
  )
}

// One list row with a label, an optional value, or a chevron when tappable. Danger rows use the warning color.
function Row({ label, value, onPress, danger = false }: { label: string; value?: string; onPress?: () => void; danger?: boolean }) {
  const s = useStyles()
  const t = useTheme()
  return (
    <Tap
      onPress={onPress}
      disabled={!onPress}
      scale={motion.press.rowScale}
      style={s.row}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
    >
      <Text style={[s.rowLabel, danger && s.dangerText]}>{label}</Text>
      {value !== undefined ? (
        <Text style={s.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : onPress ? (
        <Icon name="chevron" size={18} color={t.c.ink3} />
      ) : null}
    </Tap>
  )
}

// Side-by-side choice where the picked option is filled.
function Segment<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (next: T) => void }) {
  const s = useStyles()
  return (
    <View style={s.segment}>
      {options.map((option) => {
        const on = option.value === value
        return (
          <Tap
            key={option.value}
            onPress={() => onChange(option.value)}
            scale={motion.press.rowScale}
            style={[s.segItem, on && s.segOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
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
      <Text style={s.sheetTitle}>Clear all data?</Text>
      <Text style={s.body}>This deletes your logs, weights, chats and profile. It can&apos;t be undone. Your account stays.</Text>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Button label="Clear all data" variant="coral" size="block" busy={busy} onPress={() => void clear()} style={s.danger} />
      <Button label="Cancel" variant="ghost" size="block" disabled={busy} onPress={onDone} style={s.gap} />
    </View>
  )
}

// Confirm step for deleting the account. Delete stays off until DELETE is typed. A failure keeps the sheet open.
function DeleteForm({ onDone }: { onDone: () => void }) {
  const s = useStyles()
  const deleteAccount = useAction(api.users.deleteAccount)
  const { signOut } = useAuth()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Deletes the caller's data and Clerk user, then signs out.
  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await deleteAccount({})
      await signOut()
      onDone()
    } catch (err) {
      setError(plainError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View>
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

// Saved units, or the device's units when none are saved.
function unitsOf(saved: string | undefined): Units {
  return saved === 'metric' || saved === 'imperial' ? saved : deviceUnits()
}

const useStyles = themedStyles((t) => ({
  card: { backgroundColor: t.c.card, borderRadius: radii.card, boxShadow: t.shadow.card, paddingHorizontal: 16 },
  pad: { paddingVertical: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: t.c.line,
  },
  rowLabel: { ...font('callout'), color: t.c.ink },
  dangerText: { color: t.c.poloInk },
  rowValue: { ...font('callout'), color: t.c.ink3, flexShrink: 1, textAlign: 'right' },
  segment: { flexDirection: 'row', backgroundColor: t.c.card2, borderRadius: radii.pill, padding: 4, gap: 4 },
  segItem: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
  segOn: { backgroundColor: t.c.card, boxShadow: t.shadow.card },
  segLabel: { ...font('callout'), color: t.c.ink3 },
  segLabelOn: { color: t.c.ink },
  caption: { ...font('caption'), color: t.c.ink3, marginTop: 10, marginHorizontal: 2 },
  error: { ...font('callout'), color: t.c.poloInk, marginTop: 14, marginHorizontal: 2 },
  sheetTitle: { ...font('cardTitle'), color: t.c.ink, marginBottom: 10 },
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
