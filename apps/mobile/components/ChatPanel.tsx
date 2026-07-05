import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated'
import * as Haptics from '../lib/haptics'
import { AgentBadge } from './AgentBadge'
import { MealLogCard } from './MealLogCard'
import { MacroCard } from './MacroCard'
import { Icon } from './Icon'
import { useTheme, SPACE, TAP_MIN } from './theme'
import { IconBadge } from './ui'
import type { AgentType, MacroData, MealLogCardProps } from '../data'

type Modality = 'type' | 'voice' | 'photo' | 'barcode' | 'ocr'

type Block =
  | { kind: 'text'; text: string }
  | { kind: 'meal'; data: MealLogCardProps }
  | { kind: 'macro'; data: MacroData }

type Msg =
  | { id: number; role: 'user'; modality: Modality; text: string; chip?: string }
  | { id: number; role: 'assistant'; agent?: AgentType; typing: boolean; blocks: Block[] }

interface Demo {
  user: { modality: Modality; text: string; chip?: string }
  agent: AgentType
  reply: string
  blocks: Block[]
}

const DEMOS: Record<Modality, Demo> = {
  type: {
    user: { modality: 'type', text: 'Had a bowl of oats with banana and almonds for breakfast' },
    agent: 'diet',
    reply: "Parsed and logged your breakfast — here's the breakdown.",
    blocks: [
      { kind: 'meal', data: { meal: 'Oat bowl', time: 'Breakfast · 8:14 AM', macros: { kcal: 410, protein: 14, carbs: 62, fat: 11 }, confirmed: true } },
      { kind: 'macro', data: { kcal: 410, protein: 14, carbs: 62, fat: 11 } },
      { kind: 'text', text: "You're at 14g protein — about 96g to go for today's 110g target." },
    ],
  },
  voice: {
    user: { modality: 'voice', text: '"Four sets of bench press at 80 kilos, eight reps each"', chip: 'Voice note · 0:08' },
    agent: 'workout',
    reply: 'Transcribed your voice note and logged the session.',
    blocks: [
      { kind: 'text', text: '80kg for 4×8 — strong push session. Recovery window 36–48h before next push.' },
    ],
  },
  photo: {
    user: { modality: 'photo', text: 'Photo of lunch', chip: 'lunch.jpg · 2.1 MB' },
    agent: 'diet',
    reply: 'Analysed the photo — detected grilled chicken, greens and olive oil dressing.',
    blocks: [
      { kind: 'meal', data: { meal: 'Chicken salad', time: 'Lunch · 1:02 PM', macros: { kcal: 520, protein: 44, carbs: 18, fat: 22 }, confirmed: true } },
      { kind: 'text', text: 'Confidence 92%. Tap a chip to adjust portions if this looks off.' },
    ],
  },
  barcode: {
    user: { modality: 'barcode', text: 'Scanned barcode', chip: '5012345 678900' },
    agent: 'diet',
    reply: 'Matched the barcode to a product in the database.',
    blocks: [
      { kind: 'meal', data: { meal: 'Protein shake', time: 'Post-workout · 5:30 PM', macros: { kcal: 180, protein: 30, carbs: 12, fat: 3 }, confirmed: true } },
      { kind: 'text', text: 'Optimum Whey RTD · 330ml. Logged 1 serving.' },
    ],
  },
  ocr: {
    user: { modality: 'ocr', text: 'Nutrition label photo', chip: 'label.jpg' },
    agent: 'diet',
    reply: 'Read the nutrition label — values are per serving.',
    blocks: [
      { kind: 'macro', data: { kcal: 280, protein: 8, carbs: 38, fat: 9 } },
      { kind: 'text', text: 'Fits your snack budget — pair it with some protein to balance the macros.' },
    ],
  },
}

const GREETING: Msg = {
  id: 0, role: 'assistant', agent: 'overall', typing: false,
  blocks: [
    { kind: 'text', text: "Hey — I'm Stry. Tell me what you ate or trained, any way you like. Type it, speak it, snap a photo, or scan a barcode." },
  ],
}

let uid = 1
const nextId = () => uid++

function TypingDots() {
  const t = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 4, paddingVertical: 8 }}>
      {[0, 1, 2].map(i => (
        <Animated.View
          key={i}
          entering={FadeInDown.delay(i * 120).springify().stiffness(220).damping(26)}
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.textMuted }}
        />
      ))}
    </View>
  )
}

function BlockView({ block }: { block: Block }) {
  const t = useTheme()
  if (block.kind === 'text') {
    return (
      <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 14, color: t.text, lineHeight: 21 }}>
        {block.text}
      </Text>
    )
  }
  if (block.kind === 'meal') return <MealLogCard {...block.data} />
  if (block.kind === 'macro') return <MacroCard {...block.data} />
  return null
}

function UserBubble({ msg }: { msg: Extract<Msg, { role: 'user' }> }) {
  const t = useTheme()
  return (
    <Animated.View entering={FadeInDown.springify().stiffness(220).damping(26)} style={{ alignItems: 'flex-end' }}>
      {msg.chip && (
        <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: 10, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
          {msg.chip}
        </Text>
      )}
      <View style={{
        maxWidth: '80%',
        backgroundColor: t.chatUserBg,
        borderRadius: 18,
        borderBottomRightRadius: 5,
        paddingHorizontal: 14,
        paddingVertical: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 4,
      }}>
        <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 14, color: t.chatUserText, lineHeight: 21 }}>
          {msg.text}
        </Text>
      </View>
    </Animated.View>
  )
}

function AssistantMessage({ msg }: { msg: Extract<Msg, { role: 'assistant' }> }) {
  const t = useTheme()
  return (
    <Animated.View entering={FadeInDown.springify().stiffness(220).damping(26)} style={{ maxWidth: '92%' }}>
      {msg.agent && (
        <View style={{ marginBottom: 6 }}>
          <AgentBadge type={msg.agent} />
        </View>
      )}
      {msg.typing ? (
        <View style={{
          backgroundColor: t.card,
          borderRadius: 18,
          borderTopLeftRadius: 5,
          paddingHorizontal: 12,
          ...t.cardShadow,
          alignSelf: 'flex-start',
        }}>
          <TypingDots />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {msg.blocks.map((b, i) => (
            <Animated.View key={i} entering={FadeInDown.delay(i * 100).springify().stiffness(220).damping(26)}>
              <BlockView block={b} />
            </Animated.View>
          ))}
        </View>
      )}
    </Animated.View>
  )
}

const ATTACH_ITEMS: { modality: Modality; label: string; icon: 'camera' | 'barcode' | 'ocr' }[] = [
  { modality: 'photo',   label: 'Photo of meal',   icon: 'camera' },
  { modality: 'barcode', label: 'Scan barcode',    icon: 'barcode' },
  { modality: 'ocr',    label: 'Nutrition label',  icon: 'ocr' },
]

export function ChatPanel() {
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const insets = useSafeAreaInsets()
  const t = useTheme()

  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])

  const after = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms))
  }

  function runDemo(modality: Modality, overrideText?: string) {
    if (running) return
    setRunning(true)
    setMenuOpen(false)

    const demo = DEMOS[modality]
    const userMsg: Msg = {
      id: nextId(), role: 'user', modality,
      text: overrideText ?? demo.user.text,
      chip: overrideText ? undefined : demo.user.chip,
    }
    const botId = nextId()

    setMessages(m => [...m, userMsg, { id: botId, role: 'assistant', agent: demo.agent, typing: true, blocks: [] }])

    after(1400, () => {
      setMessages(m => m.map(msg =>
        msg.id === botId && msg.role === 'assistant'
          ? { ...msg, typing: false, blocks: [{ kind: 'text', text: demo.reply }, ...demo.blocks] }
          : msg,
      ))
      setRunning(false)
    })
  }

  function handleSend() {
    const text = input.trim()
    if (!text || running) return
    setInput('')
    runDemo('type', text)
  }

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
  }, [messages])

  const composerBottom = Math.max(insets.bottom, 12)

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16, gap: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {messages.map(msg =>
            msg.role === 'user'
              ? <UserBubble key={msg.id} msg={msg} />
              : <AssistantMessage key={msg.id} msg={msg} />,
          )}
        </ScrollView>

        {/* Attach menu — above composer, horizontal icon row */}
        {menuOpen && (
          <Animated.View
            entering={FadeInUp.springify().stiffness(260).damping(28)}
            style={{
              position: 'absolute',
              bottom: composerBottom + 76,
              left: 12,
              right: 12,
              backgroundColor: t.card,
              borderRadius: 20,
              padding: 16,
              ...t.floatShadow,
              borderWidth: 1,
              borderColor: t.border,
              zIndex: 10,
              flexDirection: 'row',
              justifyContent: 'space-around',
            }}
          >
            {ATTACH_ITEMS.map(item => (
              <Pressable
                key={item.modality}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); runDemo(item.modality) }}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 14,
                  paddingHorizontal: SPACE.sm,
                  paddingVertical: SPACE.sm,
                  opacity: pressed ? 0.7 : 1,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
              >
                <IconBadge
                  icon={item.icon}
                  size={22}
                  badgeSize={52}
                  bg={'rgba(179,160,255,0.15)'}
                  color={t.accent}
                />
                <Text numberOfLines={1} style={{ fontFamily: 'Manrope_700Bold', fontSize: 12, color: t.textMuted }}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </Animated.View>
        )}

        {/* Composer */}
        <View style={{
          paddingHorizontal: 12,
          paddingBottom: composerBottom,
          paddingTop: 8,
        }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: t.card,
            borderRadius: 28,
            paddingHorizontal: 10,
            paddingVertical: 10,
            ...t.floatShadow,
          }}>
            {/* Attach */}
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMenuOpen(o => !o) }}
              disabled={running}
              style={({ pressed }) => ({
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: menuOpen ? t.accent : t.dimBgMid,
                alignItems: 'center', justifyContent: 'center',
                opacity: running ? 0.4 : pressed ? 0.8 : 1,
                transform: [{ rotate: menuOpen ? '45deg' : '0deg' }],
              })}
            >
              <Icon name="plus" size={20} color={menuOpen ? t.fabIcon : t.textMuted} />
            </Pressable>

            {/* Input */}
            <TextInput
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              placeholder="Message Stry…"
              placeholderTextColor={t.textSubtle}
              style={{
                flex: 1,
                fontFamily: 'Manrope_500Medium',
                fontSize: 15,
                color: t.text,
                paddingHorizontal: 4,
                paddingVertical: 4,
                minHeight: 40,
              }}
              returnKeyType="send"
              multiline={false}
            />

            {/* Voice */}
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); runDemo('voice') }}
              disabled={running}
              style={({ pressed }) => ({
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: t.dimBgMid,
                alignItems: 'center', justifyContent: 'center',
                opacity: running ? 0.4 : pressed ? 0.7 : 1,
              })}
            >
              <Icon name="mic" size={19} color={t.textMuted} />
            </Pressable>

            {/* Send — theme-aware: primary bg when active, muted when idle */}
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleSend() }}
              disabled={running || !input.trim()}
              style={({ pressed }) => ({
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: !running && input.trim() ? t.buttonPrimaryBg : t.dimBgMid,
                alignItems: 'center', justifyContent: 'center',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Icon name="send" size={17} color={!running && input.trim() ? t.buttonPrimaryText : t.textSubtle} />
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
