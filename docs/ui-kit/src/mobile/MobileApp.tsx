import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { StrideMark } from '../components/StrideMark'
import { ChatPanel } from '../components/ChatPage'
import { MealLogCard, MealLogCardEmpty, type MealLogCardProps } from '../components/MealLogCard'
import { WorkoutSessionCard } from '../components/WorkoutSessionCard'
import { RecipeCard, RecipeDetailModal, RecipeCreateModal } from '../components/RecipeViews'
import { MacroCard, type MacroData } from '../components/MacroCard'
import { StatChip } from '../components/StatChip'
import { StreakCard } from '../components/StreakCard'
import { WaterTracker } from '../components/WaterTracker'
import { NarrativeCard } from '../components/NarrativeCard'
import { MilestoneCard } from '../components/MilestoneCard'
import { AgentBadge } from '../components/AgentBadge'
import {
  MACRO_TOTALS, MACRO_TARGET, TODAY_MEALS, RECIPES, TODAY_SESSION,
  STATS, STREAK, MILESTONES, INSIGHTS, HISTORY_DAYS, dayDetail,
  type Recipe,
} from '../app/data'

// ─── Tabs / routing ────────────────────────────────────────────────────────────

type Tab = 'today' | 'nutrition' | 'workouts' | 'insights'
type Overlay = 'history' | 'account' | null

// ─── Icons ─────────────────────────────────────────────────────────────────────

const I = {
  today:     <path d="M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />,
  nutrition: <><path d="M6 3v7a3 3 0 0 0 6 0V3M9 3v18" /><path d="M16 3c-1.5 1.5-2 4-2 6 0 2 1 3 2 3s2-1 2-3V3M18 12v9" /></>,
  workouts:  <path d="M6.5 6.5 17.5 17.5M4 8l-1 1 3 3-3 3 1 1M20 16l1-1-3-3 3-3-1-1M8 4 7 5l3 3M16 20l1-1-3-3" />,
  insights:  <path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6" />,
  calendar:  <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  back:      <path d="M15 6l-6 6 6 6" />,
}

function Icon({ children, size = 22, sw = 2 }: { children: React.ReactNode; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {children}
    </svg>
  )
}

// ─── Status bar ──────────────────────────────────────────────────────────────────

function StatusBar() {
  return (
    <div className="relative h-12 shrink-0 flex items-end justify-between px-7 pb-1 text-ink dark:text-surface">
      <span className="text-[15px] font-extrabold tracking-tight tabular-nums">9:41</span>
      <div className="absolute left-1/2 -translate-x-1/2 top-2 w-[105px] h-[30px] rounded-full bg-ink dark:bg-black" />
      <div className="flex items-center gap-1.5">
        <Icon size={16} sw={2.4}><path d="M2 20h.01M6 20v-4M10 20v-8M14 20v-12M18 20V6" /></Icon>
        <Icon size={16} sw={2.4}><path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M12 20h.01" /></Icon>
        <svg width="26" height="14" viewBox="0 0 26 14" fill="none" className="text-ink dark:text-surface">
          <rect x="1" y="2" width="20" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <rect x="3" y="4" width="15" height="6" rx="1.5" fill="currentColor" />
          <rect x="23" y="5" width="2" height="4" rx="1" fill="currentColor" opacity="0.5" />
        </svg>
      </div>
    </div>
  )
}

// ─── Shared mobile bits ──────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/35 dark:text-white/35 mb-3">{children}</p>
}

function ScreenHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-[26px] font-extrabold text-ink dark:text-surface tracking-[-1px] leading-tight">{title}</h1>
        {sub && <p className="text-[13px] font-medium text-ink/45 dark:text-white/45 mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

// Compact macro summary card for the Today dashboard
const MACRO_META: { key: keyof MacroData; label: string; bar: string }[] = [
  { key: 'kcal',    label: 'Calories', bar: 'bg-peach' },
  { key: 'protein', label: 'Protein',  bar: 'bg-mint' },
  { key: 'carbs',   label: 'Carbs',    bar: 'bg-sky' },
  { key: 'fat',     label: 'Fat',      bar: 'bg-bubblegum' },
]

function MacroSummary({ totals, target }: { totals: MacroData; target: MacroData }) {
  const left = Math.max(target.kcal - totals.kcal, 0)
  return (
    <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]">
      <div className="flex items-end justify-between mb-4">
        <div>
          <Eyebrow>Today's fuel</Eyebrow>
          <p className="text-[34px] font-extrabold text-ink dark:text-surface tracking-[-1.5px] tabular-nums leading-none">
            {left.toLocaleString()}<span className="text-[15px] font-bold text-ink/35 dark:text-white/35 ml-1.5">kcal left</span>
          </p>
        </div>
        <span className="text-[12px] font-extrabold text-ink/40 dark:text-white/40 tabular-nums">
          {totals.kcal} / {target.kcal}
        </span>
      </div>
      <div className="space-y-2.5">
        {MACRO_META.map(m => {
          const pct = Math.min(totals[m.key] / target[m.key], 1)
          return (
            <div key={m.key}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[12px] font-bold text-ink/55 dark:text-white/55">{m.label}</span>
                <span className="text-[12px] font-extrabold text-ink dark:text-surface tabular-nums">
                  {totals[m.key]}<span className="text-ink/30 dark:text-white/30"> / {target[m.key]}{m.key === 'kcal' ? '' : 'g'}</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface dark:bg-ink/40 overflow-hidden">
                <motion.div className={`h-full rounded-full ${m.bar}`} initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ type: 'spring', stiffness: 140, damping: 24 }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Today ───────────────────────────────────────────────────────────────────────

function TodayScreen({ openChat, openAccount, openHistory }: { openChat: () => void; openAccount: () => void; openHistory: () => void }) {
  return (
    <div className="px-5 pt-4 pb-6">
      <ScreenHeader
        title="Good evening"
        sub="Wednesday, June 25"
        right={
          <div className="flex items-center gap-2 pt-1">
            <button onClick={openHistory} aria-label="History" className="w-10 h-10 rounded-full bg-white dark:bg-[#1a1e2e] shadow-[0_6px_18px_rgba(13,16,27,0.08)] flex items-center justify-center text-ink/60 dark:text-white/60 active:scale-95 transition-transform">
              <Icon size={18}>{I.calendar}</Icon>
            </button>
            <button onClick={openAccount} aria-label="Account" className="w-10 h-10 rounded-full bg-lavender flex items-center justify-center text-[16px] font-extrabold text-ink active:scale-95 transition-transform">O</button>
          </div>
        }
      />

      <div className="space-y-4">
        {/* Peak: AI daily insight */}
        <NarrativeCard type={INSIGHTS.today.type} narrative={INSIGHTS.today.narrative} date={INSIGHTS.today.date} />

        <MacroSummary totals={MACRO_TOTALS} target={MACRO_TARGET} />

        <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STATS.map(s => <StatChip key={s.label} {...s} />)}
        </div>

        <StreakCard days={STREAK.days} quote={STREAK.quote} />
        <WaterTracker initial={1200} target={2500} unit="ml" />

        {/* Ask-Stry prompt → conversational logging is the hero */}
        <button
          onClick={openChat}
          className="w-full text-left bg-ink dark:bg-lavender rounded-[20px] p-5 shadow-[0_14px_38px_rgba(13,16,27,0.22)] active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-full bg-white/15 dark:bg-ink/15 flex items-center justify-center text-white dark:text-ink shrink-0">
              <StrideMark className="w-7 h-7" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-extrabold text-white dark:text-ink">Tell Stry about your day</p>
              <p className="text-[13px] font-medium text-white/55 dark:text-ink/55 mt-0.5 truncate">Type, speak, or snap a photo to log</p>
            </div>
            <span className="ml-auto text-white/60 dark:text-ink/60"><Icon size={20}><path d="M9 6l6 6-6 6" /></Icon></span>
          </div>
        </button>
      </div>
    </div>
  )
}

// ─── Nutrition ─────────────────────────────────────────────────────────────────

function SegToggle<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex w-full bg-white dark:bg-[#1a1e2e] rounded-[14px] p-1 shadow-[0_8px_24px_rgba(13,16,27,0.06)]">
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)} className="relative flex-1 py-2.5 text-[13px] font-bold rounded-[10px] transition-colors">
          {value === o.id && <motion.span layoutId="m-nutri-seg" className="absolute inset-0 bg-ink dark:bg-lavender rounded-[10px]" transition={{ type: 'spring', stiffness: 320, damping: 30 }} />}
          <span className={`relative z-10 ${value === o.id ? 'text-white dark:text-ink' : 'text-ink/55 dark:text-white/55'}`}>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

const MODALITIES: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: 'type',    label: 'Type it',        icon: <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-4.5A8 8 0 1 1 21 12z" /> },
  { id: 'voice',   label: 'Voice note',     icon: <><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" /><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3" /></> },
  { id: 'photo',   label: 'Photo of meal',  icon: <><path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></> },
  { id: 'barcode', label: 'Scan barcode',   icon: <path d="M4 6v12M8 6v12M11 6v12M14 6v12M18 6v12M21 6v12" /> },
  { id: 'ocr',     label: 'Nutrition label', icon: <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10" /> },
]

function AddSheet({ onClose, onPick }: { onClose: () => void; onPick: () => void }) {
  return (
    <motion.div className="absolute inset-0 z-30 flex items-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <motion.div
        className="relative w-full bg-surface dark:bg-[#11141f] rounded-t-[28px] p-5 pb-8 shadow-[0_-20px_60px_rgba(13,16,27,0.25)]"
        initial={{ y: 360 }} animate={{ y: 0 }} exit={{ y: 360 }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      >
        <div className="w-10 h-1 rounded-full bg-ink/15 dark:bg-white/15 mx-auto mb-5" />
        <h3 className="text-[18px] font-extrabold text-ink dark:text-surface mb-1">Log anything</h3>
        <p className="text-[13px] font-medium text-ink/45 dark:text-white/45 mb-5">Stry parses it into a meal automatically</p>
        <div className="grid grid-cols-1 gap-2">
          {MODALITIES.map(m => (
            <button key={m.id} onClick={onPick} className="flex items-center gap-3 rounded-[14px] bg-white dark:bg-[#1a1e2e] px-4 py-3.5 text-left active:scale-[0.98] transition-transform shadow-[0_4px_14px_rgba(13,16,27,0.05)]">
              <span className="w-10 h-10 rounded-full bg-lavender/15 flex items-center justify-center text-lavender shrink-0"><Icon size={20}>{m.icon}</Icon></span>
              <span className="text-[15px] font-bold text-ink dark:text-surface">{m.label}</span>
              <span className="ml-auto text-ink/25 dark:text-white/25"><Icon size={18}><path d="M9 6l6 6-6 6" /></Icon></span>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

function NutritionScreen() {
  const [view, setView] = useState<'today' | 'recipes'>('today')
  const [meals, setMeals] = useState<MealLogCardProps[]>(TODAY_MEALS)
  const [recipes, setRecipes] = useState<Recipe[]>(RECIPES)
  const [open, setOpen] = useState<Recipe | null>(null)
  const [creating, setCreating] = useState(false)
  const [adding, setAdding] = useState(false)

  function logRecipe(r: Recipe) {
    setMeals(m => [...m, { meal: r.name, time: `${r.tag} · just now`, macros: r.macros, confirmed: true }])
  }

  return (
    <div className="px-5 pt-4 pb-6">
      <ScreenHeader title="Nutrition" sub="Today's meals & recipes" />
      <div className="mb-5">
        <SegToggle value={view} onChange={setView} options={[{ id: 'today', label: "Today's meals" }, { id: 'recipes', label: 'Recipes' }]} />
      </div>

      {view === 'today' ? (
        <div className="space-y-4">
          <MacroCard {...MACRO_TOTALS} />
          {meals.map((m, i) => <MealLogCard key={i} {...m} />)}
          <MealLogCardEmpty />
        </div>
      ) : (
        <div className="space-y-4">
          <button
            onClick={() => setCreating(true)}
            className="w-full flex items-center justify-center gap-1.5 rounded-[14px] bg-ink dark:bg-lavender text-white dark:text-ink py-3 text-[14px] font-extrabold active:scale-[0.98] transition-transform"
          >
            <Icon size={18} sw={2.6}><path d="M12 5v14M5 12h14" /></Icon>
            New recipe
          </button>
          <div className="grid grid-cols-1 gap-4">
            {recipes.map(r => <RecipeCard key={r.name} recipe={r} onOpen={() => setOpen(r)} />)}
          </div>
        </div>
      )}

      {/* Add FAB (thumb zone) */}
      {view === 'today' && (
        <button
          onClick={() => setAdding(true)}
          aria-label="Log meal"
          className="absolute right-5 bottom-28 z-20 w-14 h-14 rounded-full bg-ink dark:bg-lavender text-white dark:text-ink flex items-center justify-center shadow-[0_16px_40px_rgba(13,16,27,0.3)] active:scale-90 transition-transform"
        >
          <Icon size={26} sw={2.6}><path d="M12 5v14M5 12h14" /></Icon>
        </button>
      )}

      <AnimatePresence>
        {adding && <AddSheet key="sheet" onClose={() => setAdding(false)} onPick={() => setAdding(false)} />}
        {open && <RecipeDetailModal key="detail" recipe={open} onClose={() => setOpen(null)} onLog={logRecipe} />}
        {creating && <RecipeCreateModal key="create" onClose={() => setCreating(false)} onCreate={r => setRecipes(list => [r, ...list])} />}
      </AnimatePresence>
    </div>
  )
}

// ─── Workouts ─────────────────────────────────────────────────────────────────

function WorkoutsScreen() {
  const s = TODAY_SESSION
  const totalSets = s.exercises.reduce((n, e) => n + e.sets.length, 0)
  return (
    <div className="px-5 pt-4 pb-6">
      <ScreenHeader title="Workouts" sub="Today's session" />
      <div className="flex flex-wrap gap-2 mb-5">
        <span className="bg-ink dark:bg-lavender text-white dark:text-ink rounded-full px-3.5 py-1.5 text-[12px] font-extrabold">{s.exercises.length} exercises</span>
        <span className="bg-sky text-ink rounded-full px-3.5 py-1.5 text-[12px] font-extrabold tabular-nums">{totalSets} sets</span>
        <span className="bg-peach text-ink rounded-full px-3.5 py-1.5 text-[12px] font-extrabold tabular-nums">{s.burnKcal} kcal</span>
        <span className="bg-mint text-ink rounded-full px-3.5 py-1.5 text-[12px] font-extrabold tabular-nums">{s.durationMin} min</span>
      </div>
      <WorkoutSessionCard session={s} />
    </div>
  )
}

// ─── Insights ─────────────────────────────────────────────────────────────────

function InsightsScreen() {
  const [range, setRange] = useState<'today' | 'week' | 'month'>('week')
  const ins = INSIGHTS[range]
  return (
    <div className="px-5 pt-4 pb-6">
      <ScreenHeader title="Insights" sub="What's working, what to watch" />
      <div className="flex gap-2 mb-5">
        {(['today', 'week', 'month'] as const).map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 py-2 rounded-full text-[13px] font-bold capitalize transition-colors border ${
              range === r ? 'bg-ink text-white border-ink dark:bg-lavender dark:text-ink dark:border-lavender' : 'bg-white dark:bg-[#1a1e2e] text-ink/55 dark:text-white/55 border-ink/12 dark:border-white/12'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        <NarrativeCard key={range} type={ins.type} narrative={ins.narrative} date={ins.date} />
        <MacroCard {...MACRO_TOTALS} />
        <StreakCard days={STREAK.days} quote={STREAK.quote} />
        <MilestoneCard milestones={MILESTONES} />
      </div>
    </div>
  )
}

// ─── Stry (AI chat) ───────────────────────────────────────────────────────────

const CHAT_HISTORY = [
  { title: 'Today', active: true },
  { title: 'Protein targets this week', active: false },
  { title: 'Deload week plan', active: false },
  { title: 'Why am I bloated after oats?', active: false },
  { title: 'Cutting vs recomp', active: false },
]

function ChatHistoryDrawer({ close }: { close: () => void }) {
  return (
    <motion.div className="absolute inset-0 z-50 flex" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="relative w-[82%] max-w-[320px] h-full bg-surface dark:bg-[#0b0d15] shadow-[20px_0_60px_rgba(13,16,27,0.25)] flex flex-col"
        initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 36 }}
      >
        <StatusBar />
        <div className="flex items-center justify-between px-5 pt-1 pb-4">
          <h2 className="text-[18px] font-extrabold text-ink dark:text-surface tracking-[-0.5px]">Chats</h2>
          <button onClick={close} aria-label="Close history" className="w-9 h-9 rounded-full bg-white dark:bg-[#1a1e2e] shadow-[0_4px_14px_rgba(13,16,27,0.08)] flex items-center justify-center text-ink/55 dark:text-white/55 active:scale-90 transition-transform">
            <Icon size={20}><path d="M6 6l12 12M18 6L6 18" /></Icon>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-1.5">
          <button onClick={close} className="w-full flex items-center gap-2 rounded-[12px] bg-ink dark:bg-lavender text-white dark:text-ink px-3 py-3 text-[13px] font-extrabold mb-2 active:scale-[0.98] transition-transform">
            <Icon size={16} sw={2.4}><path d="M12 5v14M5 12h14" /></Icon>
            New chat
          </button>
          {CHAT_HISTORY.map((c, i) => (
            <button key={i} onClick={close} className={`w-full text-left rounded-[10px] px-3 py-3 text-[13px] font-bold truncate transition-colors ${
              c.active ? 'bg-lavender/20 text-ink dark:text-lavender' : 'text-ink/55 dark:text-white/55 active:bg-ink/5 dark:active:bg-white/5'
            }`}>
              {c.title}
            </button>
          ))}
        </div>
      </motion.div>
      <button className="flex-1 h-full bg-ink/40 backdrop-blur-[2px]" onClick={close} aria-label="Close history" />
    </motion.div>
  )
}

function StryOverlay({ close }: { close: () => void }) {
  const [historyOpen, setHistoryOpen] = useState(false)
  return (
    <motion.div
      className="absolute inset-0 z-40 bg-surface dark:bg-[#090b12] flex flex-col"
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 34 }}
    >
      <StatusBar />
      {/* Slim chat header — history · title · close */}
      <div className="px-4 pt-1 pb-3 shrink-0 flex items-center gap-2.5 border-b border-ink/6 dark:border-white/6">
        <button onClick={() => setHistoryOpen(true)} aria-label="Chat history" className="w-9 h-9 rounded-full bg-white dark:bg-[#1a1e2e] shadow-[0_4px_14px_rgba(13,16,27,0.08)] flex items-center justify-center text-ink/55 dark:text-white/55 active:scale-90 transition-transform shrink-0">
          <Icon size={19} sw={2.2}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 4v4h4M12 8v4l3 2" /></Icon>
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-[17px] font-extrabold text-ink dark:text-surface tracking-[-0.5px]">Stry</h1>
            <AgentBadge type="overall" />
          </div>
          <p className="text-[11px] font-medium text-ink/40 dark:text-white/40 leading-tight">ask anything about your day</p>
        </div>
        <button onClick={close} aria-label="Close chat" className="ml-auto w-9 h-9 rounded-full bg-white dark:bg-[#1a1e2e] shadow-[0_4px_14px_rgba(13,16,27,0.08)] flex items-center justify-center text-ink/55 dark:text-white/55 active:scale-90 transition-transform shrink-0">
          <Icon size={20}><path d="M6 6l12 12M18 6L6 18" /></Icon>
        </button>
      </div>
      <div className="flex-1 min-h-0"><ChatPanel /></div>

      <AnimatePresence>
        {historyOpen && <ChatHistoryDrawer key="hist" close={() => setHistoryOpen(false)} />}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── History overlay ──────────────────────────────────────────────────────────

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const scoreColor = ['bg-ink/8 dark:bg-white/8', 'bg-peach/50', 'bg-sky/60', 'bg-mint']

function HistoryScreen({ back }: { back: () => void }) {
  const [selected, setSelected] = useState(25)
  const detail = dayDetail(selected)
  return (
    <div className="px-5 pt-2 pb-6">
      <OverlayHeader title="History" back={back} />

      <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)] mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[16px] font-extrabold text-ink dark:text-surface">June 2026</h3>
          <div className="flex items-center gap-2 text-[10px] font-bold text-ink/45 dark:text-white/45">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-mint" />full</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-sky/60" />partial</span>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {WEEKDAYS.map((d, i) => <div key={i} className="text-center text-[11px] font-extrabold text-ink/30 dark:text-white/30">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {HISTORY_DAYS.map(d => (
            <button
              key={d.day}
              onClick={() => setSelected(d.day)}
              className={`aspect-square rounded-[10px] flex items-center justify-center text-[13px] font-bold tabular-nums transition-all ${scoreColor[d.score]} ${
                d.score >= 2 ? 'text-ink' : 'text-ink/55 dark:text-white/55'
              } ${selected === d.day ? 'ring-2 ring-lavender ring-offset-2 ring-offset-white dark:ring-offset-[#1a1e2e]' : 'active:scale-95'}`}
            >
              {d.day}
            </button>
          ))}
        </div>
      </div>

      <motion.div key={selected} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <h2 className="text-[17px] font-extrabold text-ink dark:text-surface tracking-[-0.5px]">June {selected}, 2026</h2>

        <div>
          <Eyebrow>Workout</Eyebrow>
          {detail.workout
            ? <WorkoutSessionCard session={detail.workout} />
            : <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)] text-[14px] font-medium text-ink/40 dark:text-white/40">Rest day — no workout logged.</div>}
        </div>

        <div>
          <Eyebrow>Meals · {detail.meals.length} logged</Eyebrow>
          <div className="space-y-4">{detail.meals.map((m, i) => <MealLogCard key={i} {...m} />)}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-4 shadow-[0_10px_30px_rgba(13,16,27,0.07)]">
            <Eyebrow>Sleep</Eyebrow>
            <p className="text-[24px] font-extrabold text-ink dark:text-surface tracking-[-1px] tabular-nums">{detail.sleepHrs.toFixed(1)}<span className="text-[13px] text-ink/35 dark:text-white/35 ml-1">h</span></p>
            <div className="mt-2 h-2 rounded-full bg-surface dark:bg-ink/40 overflow-hidden"><div className="h-full rounded-full bg-sky" style={{ width: `${Math.min(detail.sleepHrs / 8, 1) * 100}%` }} /></div>
          </div>
          <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-4 shadow-[0_10px_30px_rgba(13,16,27,0.07)]">
            <Eyebrow>Water</Eyebrow>
            <p className="text-[24px] font-extrabold text-ink dark:text-surface tracking-[-1px] tabular-nums">{(detail.waterMl / 1000).toFixed(1)}<span className="text-[13px] text-ink/35 dark:text-white/35 ml-1">L</span></p>
            <div className="mt-2 h-2 rounded-full bg-surface dark:bg-ink/40 overflow-hidden"><div className="h-full rounded-full bg-bubblegum" style={{ width: `${Math.min(detail.waterMl / 2500, 1) * 100}%` }} /></div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Account overlay ──────────────────────────────────────────────────────────

function OverlayHeader({ title, back, right }: { title: string; back: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-5 pt-2">
      <button onClick={back} aria-label="Back" className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-ink/70 dark:text-white/70 active:scale-90 transition-transform">
        <Icon size={24}>{I.back}</Icon>
      </button>
      <h1 className="text-[22px] font-extrabold text-ink dark:text-surface tracking-[-0.5px]">{title}</h1>
      <div className="ml-auto">{right}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-ink/8 dark:border-white/8 last:border-0">
      <span className="text-[14px] font-medium text-ink/55 dark:text-white/55">{label}</span>
      <span className="text-[14px] font-extrabold text-ink dark:text-surface">{value}</span>
    </div>
  )
}

function Toggle({ label, on }: { label: string; on: boolean }) {
  const [v, setV] = useState(on)
  return (
    <button onClick={() => setV(x => !x)} className="w-full flex items-center justify-between py-3 border-b border-ink/8 dark:border-white/8 last:border-0">
      <span className="text-[14px] font-medium text-ink/70 dark:text-white/70">{label}</span>
      <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${v ? 'bg-lavender' : 'bg-ink/15 dark:bg-white/15'}`}>
        <motion.span layout className="block w-5 h-5 rounded-full bg-white shadow" style={{ marginLeft: v ? 20 : 0 }} />
      </span>
    </button>
  )
}

function AccountScreen({ back, dark, onToggleDark }: { back: () => void; dark: boolean; onToggleDark: () => void }) {
  return (
    <div className="px-5 pt-2 pb-6">
      <OverlayHeader
        title="Account"
        back={back}
        right={
          <button onClick={onToggleDark} aria-label="Toggle theme" className="w-10 h-10 rounded-full bg-white dark:bg-[#1a1e2e] shadow-[0_6px_18px_rgba(13,16,27,0.08)] flex items-center justify-center text-ink/60 dark:text-white/60 active:scale-90 transition-transform">
            <Icon size={18}>{dark
              ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></>
              : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />}</Icon>
          </button>
        }
      />

      <div className="flex items-center gap-4 mb-6 bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]">
        <div className="w-14 h-14 rounded-full bg-lavender flex items-center justify-center text-[22px] font-extrabold text-ink">O</div>
        <div>
          <h3 className="text-[18px] font-extrabold text-ink dark:text-surface">Onkar</h3>
          <p className="text-[13px] font-medium text-ink/45 dark:text-white/45">onkarj012@gmail.com</p>
        </div>
      </div>

      <Eyebrow>Goals</Eyebrow>
      <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] px-5 py-1 shadow-[0_10px_30px_rgba(13,16,27,0.07)] mb-6">
        <Field label="Primary goal" value="Fat loss" />
        <Field label="Current weight" value="74 kg" />
        <Field label="Goal weight" value="68 kg" />
        <Field label="Daily calories" value="1 800 kcal" />
        <Field label="Protein target" value="130 g" />
        <Field label="Activity level" value="Active · 4×/wk" />
      </div>

      <Eyebrow>Settings</Eyebrow>
      <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] px-5 py-1 shadow-[0_10px_30px_rgba(13,16,27,0.07)]">
        <Toggle label="Daily morning insight" on />
        <Toggle label="Workout reminders" on />
        <Toggle label="Water nudges" on={false} />
        <Toggle label="Weekly recap email" on />
      </div>
    </div>
  )
}

// ─── Bottom tab bar ───────────────────────────────────────────────────────────

// Left/right tab clusters flank the center Stry launcher
const LEFT_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'today', label: 'Today', icon: I.today },
  { id: 'nutrition', label: 'Food', icon: I.nutrition },
]
const RIGHT_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'workouts', label: 'Train', icon: I.workouts },
  { id: 'insights', label: 'Insights', icon: I.insights },
]

function TabButton({ t, tab, setTab }: { t: { id: Tab; label: string; icon: React.ReactNode }; tab: Tab; setTab: (t: Tab) => void }) {
  const active = tab === t.id
  return (
    <button onClick={() => setTab(t.id)} className="flex flex-col items-center gap-1 flex-1 py-1" aria-label={t.label}>
      <span className={active ? 'text-ink dark:text-lavender' : 'text-ink/40 dark:text-white/40'}><Icon size={24}>{t.icon}</Icon></span>
      <span className={`text-[10px] font-bold ${active ? 'text-ink dark:text-lavender' : 'text-ink/40 dark:text-white/40'}`}>{t.label}</span>
    </button>
  )
}

function TabBar({ tab, setTab, onStry }: { tab: Tab; setTab: (t: Tab) => void; onStry: () => void }) {
  return (
    <div className="relative z-10 shrink-0 px-4 pt-2 pb-6 bg-surface/80 dark:bg-[#090b12]/80 backdrop-blur-xl border-t border-ink/6 dark:border-white/6">
      <div className="flex items-end justify-between gap-1 overflow-visible">
        {LEFT_TABS.map(t => <TabButton key={t.id} t={t} tab={tab} setTab={setTab} />)}

        {/* Center launcher — opens immersive chat */}
        <button onClick={onStry} className="flex flex-col items-center gap-1 -mt-6 px-2" aria-label="Open Stry">
          <span className="w-14 h-14 rounded-full bg-lavender flex items-center justify-center shadow-[0_12px_30px_rgba(179,160,255,0.5)] transition-transform active:scale-90">
            <StrideMark className="w-8 h-8 text-ink" />
          </span>
          <span className="text-[10px] font-extrabold text-ink/45 dark:text-white/45">Stry</span>
        </button>

        {RIGHT_TABS.map(t => <TabButton key={t.id} t={t} tab={tab} setTab={setTab} />)}
      </div>
    </div>
  )
}

// ─── Phone shell ──────────────────────────────────────────────────────────────

export function MobileApp({ onExit }: { onExit?: () => void }) {
  const [tab, setTab] = useState<Tab>('today')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [dark, setDark] = useState(false)

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  const screen =
    tab === 'today' ? <TodayScreen openChat={() => setChatOpen(true)} openAccount={() => setOverlay('account')} openHistory={() => setOverlay('history')} />
    : tab === 'nutrition' ? <NutritionScreen />
    : tab === 'workouts' ? <WorkoutsScreen />
    : <InsightsScreen />

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-5 py-8 bg-[radial-gradient(circle_at_30%_20%,#ECE7FF,transparent_55%),radial-gradient(circle_at_80%_80%,#DDEBFF,transparent_50%)] dark:bg-[#05060a]">

      {/* Device */}
      <div className="relative w-[393px] h-[852px] rounded-[54px] bg-ink dark:bg-black p-[5px] shadow-[0_50px_120px_-20px_rgba(13,16,27,0.55)]">
        <div className="relative w-full h-full rounded-[49px] overflow-hidden bg-surface dark:bg-[#090b12] flex flex-col">
          <StatusBar />

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="h-full"
              >
                {screen}
              </motion.div>
            </AnimatePresence>
          </div>

          <TabBar tab={tab} setTab={setTab} onStry={() => setChatOpen(true)} />

          {/* Immersive AI chat — full screen, no tab bar, composer owns thumb zone */}
          <AnimatePresence>
            {chatOpen && <StryOverlay key="stry" close={() => setChatOpen(false)} />}
          </AnimatePresence>

          {/* Pushed full-screen overlays */}
          <AnimatePresence>
            {overlay && (
              <motion.div
                key={overlay}
                className="absolute inset-0 z-40 bg-surface dark:bg-[#090b12] flex flex-col"
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 36 }}
              >
                <StatusBar />
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {overlay === 'history'
                    ? <HistoryScreen back={() => setOverlay(null)} />
                    : <AccountScreen back={() => setOverlay(null)} dark={dark} onToggleDark={() => setDark(d => !d)} />}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {onExit && (
        <button onClick={onExit} className="text-[13px] font-bold text-ink/45 dark:text-white/45 hover:text-ink dark:hover:text-white transition-colors">
          ← Back to desktop UI
        </button>
      )}
    </div>
  )
}
