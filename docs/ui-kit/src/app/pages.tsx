import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

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
} from './data'

// ─── Shared bits ─────────────────────────────────────────────────────────────

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-[28px] font-extrabold text-ink dark:text-surface tracking-[-1px] leading-tight">{title}</h1>
      {subtitle && <p className="text-[14px] font-medium text-ink/45 dark:text-white/45 mt-1">{subtitle}</p>}
    </div>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/35 dark:text-white/35 mb-3">{children}</p>
}

const MACRO_META: { key: keyof MacroData; label: string; bar: string }[] = [
  { key: 'kcal',    label: 'kcal',    bar: 'bg-peach' },
  { key: 'protein', label: 'protein', bar: 'bg-mint' },
  { key: 'carbs',   label: 'carbs',   bar: 'bg-sky' },
  { key: 'fat',     label: 'fat',     bar: 'bg-bubblegum' },
]

function MacroProgress({ totals, target }: { totals: MacroData; target: MacroData }) {
  return (
    <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]">
      <Eyebrow>Today's macros</Eyebrow>
      <div className="space-y-3.5">
        {MACRO_META.map(m => {
          const pct = Math.min(totals[m.key] / target[m.key], 1)
          return (
            <div key={m.key}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[12px] font-bold text-ink/55 dark:text-white/55 capitalize">{m.label}</span>
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

// ─── Right rail: day macros + progress ────────────────────────────────────────

export function DayRail() {
  return (
    <div className="space-y-4">
      <MacroProgress totals={MACRO_TOTALS} target={MACRO_TARGET} />
      <div className="flex flex-wrap gap-2">
        {STATS.map(s => <StatChip key={s.label} {...s} />)}
      </div>
      <WaterTracker initial={1200} target={2500} unit="ml" />
      <StreakCard days={STREAK.days} quote={STREAK.quote} />
    </div>
  )
}

// ─── Home ──────────────────────────────────────────────────────────────────────

export function HomePage() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-5 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-extrabold text-ink dark:text-surface tracking-[-0.5px]">Today</h1>
          <AgentBadge type="overall" />
        </div>
        <p className="text-[13px] font-medium text-ink/45 dark:text-white/45 mt-0.5">Wednesday, June 25 · your day, in conversation</p>
      </div>
      <div className="flex-1 min-h-0">
        <ChatPanel />
      </div>
    </div>
  )
}

// ─── Nutrition ───────────────────────────────────────────────────────────────

function SegToggle<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex bg-white dark:bg-[#1a1e2e] rounded-[14px] p-1 shadow-[0_10px_30px_rgba(13,16,27,0.07)]">
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className="relative px-5 py-2 text-[13px] font-bold rounded-[10px] cursor-pointer transition-colors"
        >
          {value === o.id && (
            <motion.span layoutId="nutri-seg" className="absolute inset-0 bg-ink dark:bg-lavender rounded-[10px]" transition={{ type: 'spring', stiffness: 320, damping: 30 }} />
          )}
          <span className={`relative z-10 ${value === o.id ? 'text-white dark:text-ink' : 'text-ink/55 dark:text-white/55'}`}>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function NutritionPage() {
  const [view, setView] = useState<'today' | 'recipes'>('today')
  const [meals, setMeals] = useState<MealLogCardProps[]>(TODAY_MEALS)
  const [recipes, setRecipes] = useState<Recipe[]>(RECIPES)
  const [open, setOpen] = useState<Recipe | null>(null)
  const [creating, setCreating] = useState(false)

  function logRecipe(r: Recipe) {
    setMeals(m => [...m, { meal: r.name, time: `${r.tag} · just now`, macros: r.macros, confirmed: true }])
  }

  return (
    <div className="p-6">
      <PageHeader title="Nutrition" subtitle="Today's meals and your saved recipes" />

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <SegToggle
          value={view}
          onChange={setView}
          options={[{ id: 'today', label: "Today's meals" }, { id: 'recipes', label: 'Recipes' }]}
        />
        {view === 'recipes' && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-[12px] bg-ink dark:bg-lavender text-white dark:text-ink px-4 py-2.5 text-[13px] font-extrabold hover:scale-[1.02] active:scale-95 transition-transform cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            New recipe
          </button>
        )}
      </div>

      {view === 'today' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {meals.map((m, i) => <MealLogCard key={i} {...m} />)}
          <MealLogCardEmpty />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {recipes.map(r => <RecipeCard key={r.name} recipe={r} onOpen={() => setOpen(r)} />)}
        </div>
      )}

      <AnimatePresence>
        {open && <RecipeDetailModal key="detail" recipe={open} onClose={() => setOpen(null)} onLog={logRecipe} />}
        {creating && (
          <RecipeCreateModal
            key="create"
            onClose={() => setCreating(false)}
            onCreate={r => setRecipes(list => [r, ...list])}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Workouts ────────────────────────────────────────────────────────────────

export function WorkoutsPage() {
  const s = TODAY_SESSION
  const totalSets = s.exercises.reduce((n, e) => n + e.sets.length, 0)
  return (
    <div className="p-6 max-w-[760px]">
      <PageHeader title="Workouts" subtitle="Today's full session" />
      <div className="flex flex-wrap gap-2 mb-6">
        <span className="bg-ink dark:bg-lavender text-white dark:text-ink rounded-full px-4 py-2 text-[13px] font-extrabold">{s.exercises.length} exercises</span>
        <span className="bg-sky text-ink rounded-full px-4 py-2 text-[13px] font-extrabold tabular-nums">{totalSets} sets</span>
        <span className="bg-peach text-ink rounded-full px-4 py-2 text-[13px] font-extrabold tabular-nums">{s.burnKcal} kcal burned</span>
        <span className="bg-mint text-ink rounded-full px-4 py-2 text-[13px] font-extrabold tabular-nums">{s.durationMin} min</span>
      </div>
      <WorkoutSessionCard session={s} />
    </div>
  )
}

// ─── Insights ────────────────────────────────────────────────────────────────

export function InsightsPage() {
  const [range, setRange] = useState<'today' | 'week' | 'month'>('today')
  const ins = INSIGHTS[range]
  return (
    <div className="p-6 max-w-[920px]">
      <PageHeader title="Insights" subtitle="What's working, what to watch" />
      <div className="flex gap-2 mb-6">
        {(['today', 'week', 'month'] as const).map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-4 py-2 rounded-full text-[13px] font-bold capitalize transition-colors cursor-pointer border ${
              range === r ? 'bg-ink text-white border-ink dark:bg-lavender dark:text-ink dark:border-lavender' : 'bg-white dark:bg-[#1a1e2e] text-ink/55 dark:text-white/55 border-ink/12 dark:border-white/12 hover:border-ink/30'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NarrativeCard key={range} type={ins.type} narrative={ins.narrative} date={ins.date} />
        <MacroCard {...MACRO_TOTALS} />
        <StreakCard days={STREAK.days} quote={STREAK.quote} />
        <MilestoneCard milestones={MILESTONES} />
      </div>
    </div>
  )
}

// ─── History (calendar) ──────────────────────────────────────────────────────

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const scoreColor = ['bg-ink/8 dark:bg-white/8', 'bg-peach/50', 'bg-sky/60', 'bg-mint']

function TrackTile({ label, value, unit, accent, icon }: { label: string; value: string; unit?: string; accent: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-[#1a1e2e] rounded-[14px] p-3.5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`w-6 h-6 rounded-full flex items-center justify-center ${accent}`}>{icon}</span>
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-ink/40 dark:text-white/40">{label}</span>
      </div>
      <p className="text-[20px] font-extrabold text-ink dark:text-surface tracking-[-0.5px] tabular-nums leading-none">
        {value}{unit && <span className="text-[12px] font-bold text-ink/35 dark:text-white/35 ml-0.5">{unit}</span>}
      </p>
    </div>
  )
}

function ti(path: React.ReactNode) {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-ink">{path}</svg>
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </div>
  )
}

export function HistoryPage() {
  const [selected, setSelected] = useState<number>(25)
  const detail = dayDetail(selected)
  const workoutMin = detail.workout ? detail.workout.durationMin : 0

  return (
    <div className="p-6">
      <PageHeader title="History" subtitle="Every logged day, at a glance" />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_1fr] gap-6 items-start">

        {/* Left: tracking tiles + calendar */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <TrackTile label="Calories" value={detail.caloriesIn.toLocaleString()} accent="bg-peach" icon={ti(<path d="M12 2s5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 1-3" />)} />
            <TrackTile label="Workout" value={workoutMin ? String(workoutMin) : '—'} unit={workoutMin ? 'min' : undefined} accent="bg-mint" icon={ti(<path d="M6.5 6.5 17.5 17.5M4 8l-1 1 3 3M20 16l1-1-3-3" />)} />
            <TrackTile label="Sleep" value={detail.sleepHrs.toFixed(1)} unit="h" accent="bg-sky" icon={ti(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />)} />
            <TrackTile label="Water" value={(detail.waterMl / 1000).toFixed(1)} unit="L" accent="bg-bubblegum" icon={ti(<path d="M12 2.5S6 9 6 14a6 6 0 0 0 12 0c0-5-6-11.5-6-11.5z" />)} />
          </div>

          <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-extrabold text-ink dark:text-surface">June 2026</h3>
              <div className="flex items-center gap-2.5 text-[10px] font-bold text-ink/45 dark:text-white/45">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-mint" />full</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-sky/60" />partial</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-ink/8 dark:bg-white/8" />none</span>
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
                  className={`aspect-square rounded-[10px] flex items-center justify-center text-[13px] font-bold tabular-nums transition-all cursor-pointer ${scoreColor[d.score]} ${
                    d.score >= 2 ? 'text-ink' : 'text-ink/55 dark:text-white/55'
                  } ${selected === d.day ? 'ring-2 ring-lavender ring-offset-2 ring-offset-white dark:ring-offset-[#1a1e2e]' : 'hover:scale-105'}`}
                >
                  {d.day}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: day detail */}
        <motion.div key={selected} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <h2 className="text-[18px] font-extrabold text-ink dark:text-surface tracking-[-0.5px]">June {selected}, 2026</h2>

          <InfoBlock title="Workout">
            {detail.workout
              ? <WorkoutSessionCard session={detail.workout} />
              : <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)] text-[14px] font-medium text-ink/40 dark:text-white/40">Rest day — no workout logged.</div>}
          </InfoBlock>

          <InfoBlock title={`Meals · ${detail.meals.length} logged`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {detail.meals.map((m, i) => <MealLogCard key={i} {...m} />)}
            </div>
          </InfoBlock>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoBlock title="Sleep">
              <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]">
                <p className="text-[28px] font-extrabold text-ink dark:text-surface tracking-[-1px] tabular-nums">{detail.sleepHrs.toFixed(1)}<span className="text-[15px] text-ink/35 dark:text-white/35 ml-1">hrs</span></p>
                <p className="text-[13px] font-medium text-ink/45 dark:text-white/45 mt-1">{detail.sleepHrs >= 7.5 ? 'Well rested' : detail.sleepHrs >= 6.5 ? 'A touch short' : 'Under target'}</p>
                <div className="mt-3 h-2 rounded-full bg-surface dark:bg-ink/40 overflow-hidden">
                  <div className="h-full rounded-full bg-sky" style={{ width: `${Math.min(detail.sleepHrs / 8, 1) * 100}%` }} />
                </div>
              </div>
            </InfoBlock>

            <InfoBlock title="Water">
              <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]">
                <p className="text-[28px] font-extrabold text-ink dark:text-surface tracking-[-1px] tabular-nums">{(detail.waterMl / 1000).toFixed(1)}<span className="text-[15px] text-ink/35 dark:text-white/35 ml-1">L</span></p>
                <p className="text-[13px] font-medium text-ink/45 dark:text-white/45 mt-1">of 2.5 L goal</p>
                <div className="mt-3 h-2 rounded-full bg-surface dark:bg-ink/40 overflow-hidden">
                  <div className="h-full rounded-full bg-bubblegum" style={{ width: `${Math.min(detail.waterMl / 2500, 1) * 100}%` }} />
                </div>
              </div>
            </InfoBlock>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

// ─── AI Chat (with chat-history rail handled by Shell) ────────────────────────

export function ChatPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-5 pb-3 shrink-0 flex items-center gap-2">
        <h1 className="text-[22px] font-extrabold text-ink dark:text-surface tracking-[-0.5px]">Stry</h1>
        <AgentBadge type="overall" />
        <span className="text-[13px] font-medium text-ink/45 dark:text-white/45 ml-1">ask anything about your day</span>
      </div>
      <div className="flex-1 min-h-0"><ChatPanel /></div>
    </div>
  )
}

export const CHAT_HISTORY = [
  { title: 'Today', active: true },
  { title: 'Protein targets this week', active: false },
  { title: 'Deload week plan', active: false },
  { title: 'Why am I bloated after oats?', active: false },
  { title: 'Cutting vs recomp', active: false },
]

// ─── Account ─────────────────────────────────────────────────────────────────

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
    <button onClick={() => setV(x => !x)} className="w-full flex items-center justify-between py-3 border-b border-ink/8 dark:border-white/8 last:border-0 cursor-pointer">
      <span className="text-[14px] font-medium text-ink/70 dark:text-white/70">{label}</span>
      <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${v ? 'bg-lavender' : 'bg-ink/15 dark:bg-white/15'}`}>
        <motion.span layout className="block w-5 h-5 rounded-full bg-white shadow" style={{ marginLeft: v ? 20 : 0 }} />
      </span>
    </button>
  )
}

export function AccountPage({ onOpenKit }: { onOpenKit?: () => void }) {
  return (
    <div className="p-6 max-w-[680px]">
      <PageHeader title="Account" subtitle="Goals, profile and settings" />

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
      <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] px-5 py-1 shadow-[0_10px_30px_rgba(13,16,27,0.07)] mb-6">
        <Toggle label="Daily morning insight" on />
        <Toggle label="Workout reminders" on />
        <Toggle label="Water nudges" on={false} />
        <Toggle label="Weekly recap email" on />
      </div>

      {onOpenKit && (
        <button onClick={onOpenKit} className="text-[13px] font-bold text-ink/45 dark:text-white/45 hover:text-ink dark:hover:text-white transition-colors cursor-pointer">
          View component UI Kit →
        </button>
      )}
    </div>
  )
}
