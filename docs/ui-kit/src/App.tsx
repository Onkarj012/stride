import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useRotate } from './hooks/useRotate'
import { MacroCard } from './components/MacroCard'
import { StatChip } from './components/StatChip'
import { WaterTracker } from './components/WaterTracker'
import { StreakCard } from './components/StreakCard'
import { DailyGuidanceCard } from './components/DailyGuidanceCard'
import { InputBar, type InputMode } from './components/InputBar'
import { MealLogCard, MealLogCardEmpty } from './components/MealLogCard'
import { WorkoutCard, WorkoutCardEmpty } from './components/WorkoutCard'
import { CoachBubble } from './components/CoachBubble'
import { AgentBadge, type AgentType } from './components/AgentBadge'
import { NarrativeCard } from './components/NarrativeCard'
import { MilestoneCard } from './components/MilestoneCard'

// ─── Demo data ────────────────────────────────────────────────────────────────

const MACROS = [
  { kcal: 410,  protein: 14,  carbs: 62,  fat: 11 },
  { kcal: 720,  protein: 52,  carbs: 48,  fat: 28 },
  { kcal: 280,  protein: 8,   carbs: 38,  fat: 9  },
  { kcal: 1840, protein: 95,  carbs: 210, fat: 62 },
]

const STAT_GROUPS = [
  [
    { label: 'Weight',  value: '74 kg',    color: 'mint'      as const },
    { label: 'Goal',    value: 'Fat loss',  color: 'sky'       as const },
    { label: 'Daily',   value: '1 800 cal', color: 'peach'     as const },
  ],
  [
    { label: 'Weight',  value: '68 kg',    color: 'mint'      as const },
    { label: 'Goal',    value: 'Muscle',    color: 'bubblegum' as const },
    { label: 'Daily',   value: '2 600 cal', color: 'peach'     as const },
  ],
  [
    { label: 'Weight',  value: '91 kg',    color: 'mint'      as const },
    { label: 'Goal',    value: 'Maintain',  color: 'sky'       as const },
    { label: 'Daily',   value: '2 200 cal', color: 'peach'     as const },
  ],
]

const GUIDANCE = [
  { doToday: 'Hit 110g protein — you\'re halfway there.', recoverFrom: 'Light legs today after yesterday\'s run.', ignoreToday: 'The scale this morning — it\'s water, not fat.' },
  { doToday: 'Get a 20-min walk in after lunch.', recoverFrom: 'Shoulders are fatigued — skip overhead work.', ignoreToday: 'Yesterday\'s missed workout — fresh start today.' },
  { doToday: 'Eat your biggest meal around your workout.', recoverFrom: 'Sleep debt from the weekend — take it easy.', ignoreToday: 'The number on the scale — focus on the trend.' },
]

const MEALS = [
  { meal: 'Oat bowl',       time: 'Breakfast · 8:14 AM', macros: { kcal: 410, protein: 14, carbs: 62, fat: 11 }, confirmed: true  },
  { meal: 'Chicken salad',  time: 'Lunch · 1:02 PM',     macros: { kcal: 520, protein: 44, carbs: 18, fat: 22 }, confirmed: true  },
  { meal: 'Protein shake',  time: 'Post-workout · 5:30 PM', macros: { kcal: 180, protein: 30, carbs: 12, fat: 3  }, confirmed: true  },
  { meal: 'Greek yogurt',   time: 'Snack · 10:20 AM',    macros: { kcal: 150, protein: 17, carbs: 10, fat: 4  }, confirmed: false },
]

const WORKOUTS = [
  { exercise: 'Bench press', sets: 4, reps: 8,  weight: '80 kg',  burnKcal: 240, date: 'Today · 5:12 PM'      },
  { exercise: 'Deadlift',    sets: 3, reps: 5,  weight: '120 kg', burnKcal: 310, date: 'Yesterday · 6:00 PM'  },
  { exercise: 'Pull-ups',    sets: 4, reps: 10, weight: 'BW',     burnKcal: 190, date: 'Monday · 7:30 AM'     },
  { exercise: '5 km run',    sets: 1, reps: 1,  weight: '',       burnKcal: 420, date: 'Sunday · 8:00 AM'     },
]

const COACH_DATA: { agentType: AgentType; messages: Record<'gentle'|'motivating'|'analytical', string> }[] = [
  {
    agentType: 'diet',
    messages: {
      gentle:     'No rush — aim for ~110g protein today. You\'re halfway there. Want a high-protein snack idea?',
      motivating: 'Let\'s GO — 110g target, you\'re at 55g. One solid meal and it\'s yours.',
      analytical: 'Target: 110g (1.6g/kg BW). Current: 55g. Delta: +55g needed. Add ~1 protein portion at dinner.',
    },
  },
  {
    agentType: 'workout',
    messages: {
      gentle:     'Your legs are probably asking for a rest today after that run. A walk is plenty.',
      motivating: 'Upper body is FRESH — let\'s make today count. Push or pull day, your call.',
      analytical: 'Leg stimulus from yesterday: high. Recovery time est. 36–48h. Recommend upper body or rest.',
    },
  },
  {
    agentType: 'sleep',
    messages: {
      gentle:     'You logged 6.2h — not your best. No pressure, just try to be in bed 30 min earlier tonight.',
      motivating: 'Sleep is training too. 7.5h is the target — you\'ve hit it 5 days this week. Keep the streak.',
      analytical: 'Avg sleep this week: 6.8h. Recommended: 7.5h. Deficit: 0.7h/night. Compounding by day 5.',
    },
  },
]

const NARRATIVES = [
  { type: 'daily' as const, narrative: 'Strong, steady day — protein gap closed and you moved well. Tomorrow, watch the weekend carb drift.', date: 'Today' },
  { type: 'weekly' as const, narrative: 'Best week in a month. 5 workouts, protein target hit 6/7 days, and that streak is real. Keep the same inputs next week.', date: 'This week' },
  { type: 'daily' as const, narrative: 'Rest day well handled — hit your water and protein targets without a workout. That\'s the hard part of fat loss.', date: 'Yesterday' },
]

const MILESTONES_SETS = [
  [
    { label: 'First log',        achieved: true  },
    { label: '3-day streak',     achieved: true  },
    { label: '7-day streak',     achieved: true  },
    { label: '110g protein',     achieved: true  },
    { label: '30-day streak',    achieved: false },
    { label: '10 kg lost',       achieved: false },
    { label: '100 workouts',     achieved: false },
    { label: 'Goal weight',      achieved: false },
  ],
  [
    { label: 'First log',        achieved: true  },
    { label: '7-day streak',     achieved: true  },
    { label: '50 workouts',      achieved: true  },
    { label: 'PR deadlift',      achieved: true  },
    { label: '100 workouts',     achieved: true  },
    { label: '30-day streak',    achieved: false },
    { label: '+10 kg muscle',    achieved: false },
    { label: 'Elite lifts',      achieved: false },
  ],
]

const STREAK_VALUES = [
  { days: 12,  quote: 'Strong, steady week. The streak is the story.' },
  { days: 3,   quote: 'Back on track — three in a row counts.' },
  { days: 47,  quote: 'This is a lifestyle now, not a challenge.' },
  { days: 1,   quote: 'Day one is still a win.' },
]

const INPUT_MODES: InputMode[] = ['type', 'voice', 'photo', 'barcode', 'ocr']
const AGENT_TYPES: AgentType[] = ['diet', 'workout', 'sleep', 'hydration', 'habits', 'mental', 'overall']

// ─── Showcase shell ───────────────────────────────────────────────────────────

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-[14px] font-bold text-white/60 hover:text-white transition-colors px-3 py-1.5 rounded-full hover:bg-white/10"
    >
      {children}
    </a>
  )
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-10">
        <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/35 dark:text-white/35 mb-2">{eyebrow}</p>
        <h2 className="text-[36px] font-extrabold text-ink dark:text-surface tracking-[-1px] leading-tight">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function ComponentFrame({ label, children, onMouseEnter, onMouseLeave }: {
  label: string
  children: React.ReactNode
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  return (
    <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/25 dark:text-white/25 mb-3">{label}</p>
      {children}
    </div>
  )
}

function Grid({ cols, children }: { cols?: 1 | 2 | 3; children: React.ReactNode }) {
  const colClass = cols === 3 ? 'grid-cols-1 sm:grid-cols-3' : cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
  return <div className={`grid ${colClass} gap-4`}>{children}</div>
}

// ─── App ─────────────────────────────────────────────────────────────────────

export function App({ onExit }: { onExit?: () => void } = {}) {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  // Rotations
  const macros       = useRotate(MACROS)
  const statGroup    = useRotate(STAT_GROUPS)
  const guidance     = useRotate(GUIDANCE)
  const meal         = useRotate(MEALS)
  const workout      = useRotate(WORKOUTS)
  const coachData    = useRotate(COACH_DATA)
  const narrative    = useRotate(NARRATIVES)
  const milestones   = useRotate(MILESTONES_SETS)
  const streak       = useRotate(STREAK_VALUES)
  const inputMode    = useRotate(INPUT_MODES, 4200)

  return (
    <div className="min-h-screen bg-surface dark:bg-[#090b12] transition-colors duration-300">

      {/* Floating nav */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-ink dark:bg-[#1a1e2e] rounded-full flex items-center gap-1 px-3 py-2 shadow-[0_8px_32px_rgba(13,16,27,0.24)]">
        <span className="text-white font-extrabold text-[16px] tracking-[-0.5px] mr-3 ml-2">stride ui-kit</span>
        <div className="hidden sm:flex items-center gap-0.5">
          <NavLink href="#dashboard">Dashboard</NavLink>
          <NavLink href="#logging">Logging</NavLink>
          <NavLink href="#coach">Coach</NavLink>
          <NavLink href="#progress">Progress</NavLink>
        </div>
        {onExit && (
          <button
            onClick={onExit}
            className="ml-2 text-[14px] font-bold text-ink bg-lavender hover:bg-lavender/85 transition-colors px-4 py-1.5 rounded-full cursor-pointer"
          >
            ← App
          </button>
        )}
        <button
          onClick={() => setDark(d => !d)}
          className="ml-2 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
          aria-label="Toggle dark mode"
        >
          {dark ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
      </nav>

      {/* Hero */}
      <div className="max-w-[1080px] mx-auto px-6 pt-36 pb-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/35 dark:text-white/35 mb-3">
            Design review · 12 components
          </p>
          <h1 className="text-[52px] sm:text-[72px] font-extrabold text-ink dark:text-surface tracking-[-3px] leading-[0.92] mb-5">
            Every surface,<br />one kit.
          </h1>
          <p className="text-[18px] text-ink/50 dark:text-white/50 font-medium max-w-[480px] leading-relaxed">
            Hover any card to pause auto-rotation. Toggle dark mode in the nav.
          </p>
        </motion.div>
      </div>

      <div className="max-w-[1080px] mx-auto px-6 pb-32 space-y-24 mt-16">

        {/* ── Section 1: Dashboard ── */}
        <Section id="dashboard" eyebrow="01 — Dashboard" title="Day at a glance">
          <div className="space-y-4">

            <Grid cols={2}>
              <ComponentFrame label="MacroCard" onMouseEnter={macros.pause} onMouseLeave={macros.resume}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={macros.index}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    <MacroCard {...macros.current} />
                  </motion.div>
                </AnimatePresence>
              </ComponentFrame>

              <ComponentFrame label="DailyGuidanceCard" onMouseEnter={guidance.pause} onMouseLeave={guidance.resume}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={guidance.index}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    <DailyGuidanceCard {...guidance.current} />
                  </motion.div>
                </AnimatePresence>
              </ComponentFrame>
            </Grid>

            <Grid cols={3}>
              {statGroup.current.map((chip, i) => (
                <ComponentFrame
                  key={i}
                  label={i === 0 ? 'StatChip' : ''}
                  onMouseEnter={statGroup.pause}
                  onMouseLeave={statGroup.resume}
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={statGroup.index}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, delay: i * 0.04 }}
                    >
                      <StatChip {...chip} />
                    </motion.div>
                  </AnimatePresence>
                </ComponentFrame>
              ))}
            </Grid>

            <Grid cols={2}>
              <ComponentFrame label="WaterTracker">
                <WaterTracker initial={1200} target={2500} unit="ml" />
              </ComponentFrame>

              <ComponentFrame label="StreakCard" onMouseEnter={streak.pause} onMouseLeave={streak.resume}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={streak.index}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    <StreakCard {...streak.current} />
                  </motion.div>
                </AnimatePresence>
              </ComponentFrame>
            </Grid>

          </div>
        </Section>

        {/* ── Section 2: Logging ── */}
        <Section id="logging" eyebrow="02 — Logging" title="Every way in">
          <div className="space-y-4">

            <ComponentFrame label="InputBar" onMouseEnter={inputMode.pause} onMouseLeave={inputMode.resume}>
              <InputBar activeMode={inputMode.current} />
            </ComponentFrame>

            <Grid cols={2}>
              <ComponentFrame label="MealLogCard · populated" onMouseEnter={meal.pause} onMouseLeave={meal.resume}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={meal.index}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    <MealLogCard {...meal.current} />
                  </motion.div>
                </AnimatePresence>
              </ComponentFrame>

              <ComponentFrame label="MealLogCard · empty state">
                <MealLogCardEmpty />
              </ComponentFrame>
            </Grid>

            <Grid cols={2}>
              <ComponentFrame label="WorkoutCard · populated" onMouseEnter={workout.pause} onMouseLeave={workout.resume}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={workout.index}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    <WorkoutCard {...workout.current} />
                  </motion.div>
                </AnimatePresence>
              </ComponentFrame>

              <ComponentFrame label="WorkoutCard · empty state">
                <WorkoutCardEmpty />
              </ComponentFrame>
            </Grid>

          </div>
        </Section>

        {/* ── Section 3: Coach ── */}
        <Section id="coach" eyebrow="03 — Coach" title="Stry in action">
          <div className="space-y-4">

            <ComponentFrame label="CoachBubble" onMouseEnter={coachData.pause} onMouseLeave={coachData.resume}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={coachData.index}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="max-w-[540px]"
                >
                  <CoachBubble {...coachData.current} />
                </motion.div>
              </AnimatePresence>
            </ComponentFrame>

            <ComponentFrame label="AgentBadge · all 7 specialists">
              <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-6 shadow-[0_14px_40px_rgba(13,16,27,0.08)]">
                <div className="flex flex-wrap gap-2">
                  {AGENT_TYPES.map(type => (
                    <AgentBadge key={type} type={type} size="md" />
                  ))}
                </div>
              </div>
            </ComponentFrame>

            <Grid cols={2}>
              <ComponentFrame label="NarrativeCard" onMouseEnter={narrative.pause} onMouseLeave={narrative.resume}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={narrative.index}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    <NarrativeCard {...narrative.current} />
                  </motion.div>
                </AnimatePresence>
              </ComponentFrame>

              <ComponentFrame label="NarrativeCard · weekly">
                <NarrativeCard
                  type="weekly"
                  narrative="Best week in a month. 5 workouts, protein target hit 6/7 days, and that streak is real. Keep the same inputs."
                  date="This week"
                />
              </ComponentFrame>
            </Grid>

          </div>
        </Section>

        {/* ── Section 4: Progress ── */}
        <Section id="progress" eyebrow="04 — Progress" title="The long game">
          <div className="space-y-4">

            <Grid cols={2}>
              <ComponentFrame label="MilestoneCard" onMouseEnter={milestones.pause} onMouseLeave={milestones.resume}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={milestones.index}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    <MilestoneCard milestones={milestones.current} />
                  </motion.div>
                </AnimatePresence>
              </ComponentFrame>

              <div className="space-y-4">
                {STREAK_VALUES.map((sv, i) => (
                  <ComponentFrame key={i} label={i === 0 ? 'StreakCard · all states' : ''}>
                    <StreakCard {...sv} />
                  </ComponentFrame>
                ))}
              </div>
            </Grid>

          </div>
        </Section>

      </div>

      {/* Footer */}
      <footer className="text-center pb-16 pt-4">
        <p className="text-[13px] font-medium text-ink/30 dark:text-white/30">
          Stride UI Kit · 12 components · Manrope · Framer Motion + GSAP
        </p>
      </footer>

    </div>
  )
}
