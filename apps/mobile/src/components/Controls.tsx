import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { layout, motion, radii } from '@stride/ui-tokens'
import { font, themedStyles, useTheme } from '@/theme'
import { Icon, type IconName } from './Icon'
import { Tap } from './Tap'

type ButtonProps = {
  label: string
  onPress: () => void
  variant?: 'ink' | 'coral' | 'ghost'
  size?: 'md' | 'sm' | 'block'
  icon?: IconName
  iconAfter?: boolean
  disabled?: boolean
  busy?: boolean
  style?: StyleProp<ViewStyle>
}

// The mock's pill button in ink, coral or ghost, with an optional icon and a busy spinner.
export function Button({ label, onPress, variant = 'ink', size = 'md', icon, iconAfter, disabled, busy, style }: ButtonProps) {
  const t = useTheme()
  const s = useStyles()
  const ink = variant === 'ink' ? t.c.bg : variant === 'coral' ? t.c.onPolo : t.c.ink
  const glyph = icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} color={ink} /> : null
  return (
    <Tap
      onPress={onPress}
      disabled={disabled || busy}
      style={[s.btn, s[size], s[variant], (disabled || busy) && s.dim, style]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
    >
      {busy ? <ActivityIndicator color={ink} size="small" /> : null}
      {!busy && !iconAfter ? glyph : null}
      <Text style={[size === 'sm' ? s.labelSm : size === 'block' ? s.labelBlock : s.label, { color: ink }]} numberOfLines={1}>
        {label}
      </Text>
      {!busy && iconAfter ? glyph : null}
    </Tap>
  )
}

// Round icon button: soft (card-2 fill) or card (raised, as in the composer bar).
export function RoundButton({
  icon,
  label,
  onPress,
  tone = 'soft',
  size = layout.iconButton,
  disabled,
}: {
  icon: IconName
  label: string
  onPress: () => void
  tone?: 'soft' | 'card' | 'plain'
  size?: number
  disabled?: boolean
}) {
  const t = useTheme()
  const s = useStyles()
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      scale={motion.press.iconScale}
      style={[s.round, { width: size, height: size }, tone === 'soft' && s.soft, tone === 'card' && s.cardTone, disabled && s.dim]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={size < 36 ? 16 : layout.icon} color={t.c.ink} />
    </Tap>
  )
}

// True when typed text reads as a finite number. Partial input like "80." counts.
function readsAsNumber(text: string): boolean {
  return text.trim() !== '' && Number.isFinite(Number(text.replace(',', '.')))
}

// Minus, value, plus in one pill, like the mock's meal-sheet stepper. Tap the value to type it when onType is set; a held button keeps stepping.
export function Stepper({
  value,
  typeText,
  onStep,
  onType,
  label,
}: {
  value: string
  typeText?: string
  onStep: (direction: -1 | 1) => void
  onType?: (text: string) => void
  label: string
}) {
  const s = useStyles()
  const [typing, setTyping] = useState<string | null>(null)

  // Hands the typed text to the caller and goes back to showing the value.
  function commit() {
    if (typing !== null) onType?.(typing)
    setTyping(null)
  }

  return (
    <View style={s.step}>
      <StepButton dir={-1} icon="minus" label={`Less ${label}`} onStep={onStep} />
      {typing === null ? (
        <Tap
          onPress={() => setTyping(typeText ?? value)}
          disabled={!onType}
          scale={0.97}
          accessibilityRole="button"
          accessibilityLabel={`Type ${label}`}
        >
          <Text style={s.stepValue}>{value}</Text>
        </Tap>
      ) : (
        <TextInput
          value={typing}
          onChangeText={(text) => {
            setTyping(text)
            // Pushes each readable number up now, so a Save tapped while typing reads the new value.
            if (readsAsNumber(text)) onType?.(text)
          }}
          onSubmitEditing={commit}
          onBlur={commit}
          autoFocus
          keyboardType="decimal-pad"
          returnKeyType="done"
          selectTextOnFocus
          style={s.stepInput}
          accessibilityLabel={`${label} value`}
        />
      )}
      <StepButton dir={1} icon="plus" label={`More ${label}`} onStep={onStep} />
    </View>
  )
}

// Minus or plus in the stepper. A tap steps once; holding keeps stepping every 80 ms until the finger lifts.
function StepButton({ dir, icon, label, onStep }: { dir: -1 | 1; icon: IconName; label: string; onStep: (direction: -1 | 1) => void }) {
  const t = useTheme()
  const s = useStyles()
  // The repeat timer reads the latest onStep, so each tick sees the value the last one produced.
  const latest = useRef(onStep)
  const repeat = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  useEffect(() => {
    latest.current = onStep
  }, [onStep])
  useEffect(() => stopRepeat, [])

  // Clears the repeat timer if one is running.
  function stopRepeat() {
    clearInterval(repeat.current)
    repeat.current = undefined
  }

  return (
    <Tap
      onPress={() => onStep(dir)}
      onLongPress={() => {
        stopRepeat()
        repeat.current = setInterval(() => latest.current(dir), 80)
      }}
      onPressOut={stopRepeat}
      scale={0.85}
      style={s.stepBtn}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={16} color={t.c.ink} />
    </Tap>
  )
}

// Small uppercase label; "est" is the coral estimated badge for photo items.
export function Tag({ text, tone = 'plain' }: { text: string; tone?: 'plain' | 'est' }) {
  const s = useStyles()
  return (
    <View style={[s.tag, tone === 'est' && s.tagEst]}>
      <Text style={[s.tagText, tone === 'est' && s.tagTextEst]}>{text}</Text>
    </View>
  )
}

// One bouncing dot of the thinking indicator.
function Dot({ index }: { index: number }) {
  const s = useStyles()
  const y = useSharedValue(0)
  useEffect(() => {
    y.value = withDelay(
      index * 150,
      withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0, { duration: 600 })), -1),
    )
  }, [index, y])
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -5 * y.value }], opacity: 1 - 0.6 * y.value }))
  return <Animated.View style={[s.dot, style]} />
}

// "Thinking" row: three bouncing dots and a short line of what is happening.
export function Thinking({ label }: { label: string }) {
  const s = useStyles()
  return (
    <View style={s.thinking} accessibilityLiveRegion="polite">
      <View style={s.dots}>
        <Dot index={0} />
        <Dot index={1} />
        <Dot index={2} />
      </View>
      <Text style={s.thinkingText}>{label}</Text>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radii.pill,
    paddingHorizontal: 18,
  },
  md: { height: 44 },
  sm: { height: 34, paddingHorizontal: 13 },
  block: { height: 52, alignSelf: 'stretch' },
  ink: { backgroundColor: t.c.ink },
  coral: { backgroundColor: t.c.polo },
  ghost: { backgroundColor: t.c.card2 },
  dim: { opacity: 0.5 },
  label: { ...font('button') },
  labelSm: { ...font('buttonSmall') },
  labelBlock: { ...font('button'), fontSize: 15.5 },
  round: { borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  soft: { backgroundColor: t.c.card2 },
  cardTone: { backgroundColor: t.c.card, boxShadow: t.shadow.card },
  step: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.c.card2, borderRadius: radii.pill, height: 36 },
  stepBtn: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepValue: { ...font('calloutStrong'), color: t.c.ink, minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] },
  stepInput: {
    ...font('calloutStrong'),
    color: t.c.ink,
    minWidth: 64,
    padding: 0,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  tag: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: radii.tag, backgroundColor: t.c.card2 },
  tagEst: { backgroundColor: t.c.poloSoft },
  tagText: { ...font('tag'), color: t.c.ink2 },
  tagTextEst: { color: t.c.poloInk },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.c.ink3 },
  thinkingText: { ...font('callout'), color: t.c.ink2, flex: 1 },
}))
