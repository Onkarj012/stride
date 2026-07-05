import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { MealLogCard, type MealLogCardProps } from './MealLogCard'
import { WorkoutCard, type WorkoutCardProps } from './WorkoutCard'
import { MacroCard, type MacroData } from './MacroCard'
import { CoachBubble } from './CoachBubble'
import { DailyGuidanceCard, type DailyGuidanceCardProps } from './DailyGuidanceCard'
import { AgentBadge, type AgentType } from './AgentBadge'

// ─── Input modalities ──────────────────────────────────────────────────────────

type Modality = 'type' | 'voice' | 'photo' | 'barcode' | 'ocr'

const ICONS: Record<Modality, React.ReactNode> = {
  type: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-4.5A8 8 0 1 1 21 12z" />
    </svg>
  ),
  voice: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" /><path d="M5 11v1a7 7 0 0 0 14 0v-1" /><path d="M12 19v3" />
    </svg>
  ),
  photo: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" />
    </svg>
  ),
  barcode: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6v12M8 6v12M11 6v12M14 6v12M18 6v12M21 6v12" />
    </svg>
  ),
  ocr: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10" />
    </svg>
  ),
}

const MODALITY_LABEL: Record<Modality, string> = {
  type: 'Type', voice: 'Voice', photo: 'Photo', barcode: 'Scan', ocr: 'Label',
}

// ─── Message model ──────────────────────────────────────────────────────────────

type Block =
  | { kind: 'text'; text: string }
  | { kind: 'meal'; data: MealLogCardProps }
  | { kind: 'workout'; data: WorkoutCardProps }
  | { kind: 'macro'; data: MacroData }
  | { kind: 'coach'; data: { agentType: AgentType; messages: Record<'gentle' | 'motivating' | 'analytical', string> } }
  | { kind: 'guidance'; data: DailyGuidanceCardProps }

type Msg =
  | { id: number; role: 'user'; modality: Modality; text: string; chip?: string }
  | { id: number; role: 'assistant'; agent?: AgentType; typing: boolean; blocks: Block[] }

// ─── Hardcoded demos — one scripted exchange per input type ──────────────────────

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
    reply: 'Parsed and logged your breakfast — here\'s the breakdown.',
    blocks: [
      { kind: 'meal', data: { meal: 'Oat bowl', time: 'Breakfast · 8:14 AM', macros: { kcal: 410, protein: 14, carbs: 62, fat: 11 }, confirmed: true } },
      { kind: 'macro', data: { kcal: 410, protein: 14, carbs: 62, fat: 11 } },
      { kind: 'text', text: 'You\'re at 14g protein — about 96g to go for today\'s 110g target.' },
    ],
  },
  voice: {
    user: { modality: 'voice', text: '“Four sets of bench press at 80 kilos, eight reps each”', chip: 'Voice note · 0:08' },
    agent: 'workout',
    reply: 'Transcribed your voice note and logged the session.',
    blocks: [
      { kind: 'workout', data: { exercise: 'Bench press', sets: 4, reps: 8, weight: '80 kg', burnKcal: 240, date: 'Today · 5:12 PM' } },
      {
        kind: 'coach',
        data: {
          agentType: 'workout',
          messages: {
            gentle: 'Solid push session. Chest will want ~48h — tomorrow could be legs or rest.',
            motivating: '80kg for 4×8 — that\'s a strong day. Next time chase a 5th set or +2.5kg.',
            analytical: 'Volume: 4×8×80 = 2 560 kg. Est. burn 240 kcal. Recovery window 36–48h before next push.',
          },
        },
      },
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
      {
        kind: 'guidance',
        data: {
          doToday: 'Fits your snack budget — pair it with some protein.',
          recoverFrom: 'High carb, low protein — balance it at dinner.',
          ignoreToday: 'The sugar number alone — context is the day\'s total.',
        },
      },
    ],
  },
}

// ─── Bits ───────────────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full bg-ink/30 dark:bg-white/40"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  )
}

// Cards are shared app-wide; in chat they render ~28% denser via zoom (reflows, no gap).
function BlockView({ block }: { block: Block }) {
  if (block.kind === 'text')
    return <p className="text-[14px] font-medium text-ink dark:text-surface/90 leading-relaxed">{block.text}</p>

  const card =
    block.kind === 'meal' ? <MealLogCard {...block.data} />
    : block.kind === 'workout' ? <WorkoutCard {...block.data} />
    : block.kind === 'macro' ? <MacroCard {...block.data} />
    : block.kind === 'coach' ? <CoachBubble {...block.data} />
    : <DailyGuidanceCard {...block.data} />

  return <div style={{ zoom: 0.72 } as React.CSSProperties}>{card}</div>
}

function UserBubble({ msg }: { msg: Extract<Msg, { role: 'user' }> }) {
  return (
    <motion.div
      className="flex justify-end"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 24 }}
    >
      <div className="max-w-[80%]">
        {msg.chip && (
          <div className="flex items-center justify-end gap-1.5 mb-1.5 text-ink/45 dark:text-white/45">
            <span className="w-3.5 h-3.5">{ICONS[msg.modality]}</span>
            <span className="text-[10px] font-extrabold uppercase tracking-wide">{MODALITY_LABEL[msg.modality]} · {msg.chip}</span>
          </div>
        )}
        <div className="bg-ink dark:bg-lavender text-white dark:text-ink rounded-[16px] rounded-br-[5px] px-3.5 py-2.5 text-[14px] font-medium leading-relaxed shadow-[0_8px_24px_rgba(13,16,27,0.12)]">
          {msg.text}
        </div>
      </div>
    </motion.div>
  )
}

function AssistantMessage({ msg }: { msg: Extract<Msg, { role: 'assistant' }> }) {
  return (
    <motion.div
      className="flex flex-col max-w-[92%]"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 24 }}
    >
      <div className="min-w-0">
        {msg.agent && (
          <div className="mb-1.5">
            <AgentBadge type={msg.agent} />
          </div>
        )}
        {msg.typing ? (
          <div className="bg-white dark:bg-[#1a1e2e] rounded-[16px] rounded-tl-[5px] inline-block px-3 shadow-[0_8px_24px_rgba(13,16,27,0.06)]">
            <TypingDots />
          </div>
        ) : (
          <div className="space-y-2.5">
            {msg.blocks.map((b, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.12 }}
              >
                <BlockView block={b} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────────

let uid = 1
const nextId = () => uid++

const GREETING: Msg = {
  id: 0,
  role: 'assistant',
  agent: 'overall',
  typing: false,
  blocks: [
    { kind: 'text', text: 'Hey — I\'m Stry. Tell me what you ate or trained, any way you like. Type it, speak it, snap a photo, scan a barcode or a nutrition label. Try a demo below 👇' },
  ],
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const after = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)) }

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

    after(1300, () => {
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

  const attachItems: { modality: Modality; label: string }[] = [
    { modality: 'photo', label: 'Photo of meal' },
    { modality: 'barcode', label: 'Scan barcode' },
    { modality: 'ocr', label: 'Nutrition label' },
  ]

  return (
    <div className="h-full flex flex-col bg-surface dark:bg-[#090b12] transition-colors duration-300">

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-4 pt-5 pb-3 space-y-4">
          {messages.map(msg =>
            msg.role === 'user'
              ? <UserBubble key={msg.id} msg={msg} />
              : <AssistantMessage key={msg.id} msg={msg} />,
          )}
        </div>
      </div>

      {/* Composer — floating pill, no divider */}
      <div className="shrink-0">
        <div className="max-w-[720px] mx-auto px-3 pb-3 pt-1">

          {/* Input row: + (doc adder) · textbox · mic · send */}
          <div className="relative flex items-center gap-1.5 bg-white dark:bg-[#1a1e2e] rounded-[18px] p-1.5 shadow-[0_10px_34px_rgba(13,16,27,0.14)]">

            {/* + attach / document adder */}
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen(o => !o)}
                disabled={running}
                aria-label="Add document or media"
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 ${
                  menuOpen ? 'bg-lavender text-ink rotate-45' : 'bg-surface dark:bg-ink/40 text-ink/60 dark:text-white/60 hover:bg-lavender/20'
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.16 }}
                    className="absolute bottom-11 left-0 w-52 bg-white dark:bg-[#1a1e2e] rounded-[16px] p-2 shadow-[0_16px_44px_rgba(13,16,27,0.18)] border border-ink/8 dark:border-white/10 z-10"
                  >
                    {attachItems.map(item => (
                      <button
                        key={item.modality}
                        onClick={() => runDemo(item.modality)}
                        className="w-full flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-bold text-ink/75 dark:text-white/75 hover:bg-lavender/15 transition-colors cursor-pointer"
                      >
                        <span className="text-lavender">{ICONS[item.modality]}</span>
                        {item.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Text box */}
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
              placeholder="Message Stry — what did you eat or train?"
              className="flex-1 min-w-0 bg-transparent text-[14px] font-medium text-ink dark:text-surface placeholder:text-ink/35 dark:placeholder:text-white/35 outline-none px-1"
            />

            {/* Mic */}
            <button
              onClick={() => runDemo('voice')}
              disabled={running}
              aria-label="Voice input"
              className="shrink-0 w-10 h-10 rounded-full bg-surface dark:bg-ink/40 text-ink/60 dark:text-white/60 hover:bg-lavender/20 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
            >
              {ICONS.voice}
            </button>

            {/* Send */}
            <button
              onClick={handleSend}
              disabled={running || !input.trim()}
              aria-label="Send"
              className="shrink-0 w-10 h-10 rounded-full bg-ink dark:bg-lavender text-white dark:text-ink flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
