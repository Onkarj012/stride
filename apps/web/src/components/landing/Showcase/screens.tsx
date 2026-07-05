import {
  AgentBadge,
  CoachBubble,
  DailyGuidanceCard,
  InputBar,
  MacroCard,
  MealLogCard,
  MilestoneCard,
  NarrativeCard,
  StreakCard,
} from '@/components/ui-kit'
import {
  MACRO_TODAY, GUIDANCE, STREAK, MEALS, COACH,
  AGENT_TYPES, NARRATIVE_DAILY, NARRATIVE_WEEKLY, MILESTONES,
} from './showcaseData'

export type ScreenId = 'home' | 'nutrition' | 'coach' | 'insights'
export type Variant = 'phone' | 'desktop'

export const SCREENS: { id: ScreenId; label: string }[] = [
  { id: 'home',      label: 'Home' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'coach',     label: 'Coach' },
  { id: 'insights',  label: 'Insights' },
]

function ScrollShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="light h-full overflow-y-auto bg-bg text-text [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] px-4 py-5">
      <div className="flex flex-col gap-3">
        {children}
      </div>
    </div>
  )
}

/* ── Home ── */
function HomeScreen({ variant }: { variant: Variant }) {
  return (
    <ScrollShell>
      <DailyGuidanceCard {...GUIDANCE} />
      <MacroCard {...MACRO_TODAY} />
      {variant === 'desktop' && <StreakCard {...STREAK} />}
    </ScrollShell>
  )
}

/* ── Nutrition ── */
function NutritionScreen({ variant }: { variant: Variant }) {
  return (
    <ScrollShell>
      <InputBar activeMode="type" />
      {MEALS.map((m, i) => (
        <MealLogCard key={i} {...m} />
      ))}
      {variant === 'desktop' && <MacroCard {...MACRO_TODAY} />}
    </ScrollShell>
  )
}

/* ── Coach ── */
function CoachScreen({ variant }: { variant: Variant }) {
  return (
    <ScrollShell>
      <CoachBubble {...COACH} />
      {variant === 'desktop' && (
        <div className="bg-white rounded-[16px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]">
          <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/40 mb-3">
            7 specialists
          </p>
          <div className="flex flex-wrap gap-2">
            {AGENT_TYPES.map(t => <AgentBadge key={t} type={t} size="md" />)}
          </div>
        </div>
      )}
      {variant === 'desktop' && <NarrativeCard {...NARRATIVE_DAILY} />}
    </ScrollShell>
  )
}

/* ── Insights ── */
function InsightsScreen({ variant }: { variant: Variant }) {
  return (
    <ScrollShell>
      <MacroCard {...MACRO_TODAY} />
      <MilestoneCard milestones={MILESTONES} />
      {variant === 'desktop' && <NarrativeCard {...NARRATIVE_WEEKLY} />}
    </ScrollShell>
  )
}

export function MockScreen({ id, variant }: { id: ScreenId; variant: Variant }) {
  switch (id) {
    case 'home':      return <HomeScreen variant={variant} />
    case 'nutrition': return <NutritionScreen variant={variant} />
    case 'coach':     return <CoachScreen variant={variant} />
    case 'insights':  return <InsightsScreen variant={variant} />
  }
}
