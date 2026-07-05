import { motion } from 'framer-motion'

export type AgentType = 'diet' | 'workout' | 'sleep' | 'hydration' | 'habits' | 'mental' | 'overall'

const config: Record<AgentType, { label: string; bg: string; text: string }> = {
  diet:      { label: 'Diet',      bg: 'bg-peach',     text: 'text-ink' },
  workout:   { label: 'Workout',   bg: 'bg-mint',      text: 'text-ink' },
  sleep:     { label: 'Sleep',     bg: 'bg-sky',       text: 'text-ink' },
  hydration: { label: 'Hydration', bg: 'bg-sky',       text: 'text-ink' },
  habits:    { label: 'Habits',    bg: 'bg-lavender',  text: 'text-ink' },
  mental:    { label: 'Mental',    bg: 'bg-bubblegum', text: 'text-ink' },
  overall:   { label: 'Overall',   bg: 'bg-ink',       text: 'text-white' },
}

interface AgentBadgeProps {
  type: AgentType
  size?: 'sm' | 'md'
}

export function AgentBadge({ type, size = 'sm' }: AgentBadgeProps) {
  const c = config[type]
  return (
    <motion.span
      className={`
        inline-flex items-center gap-1.5 rounded-full font-extrabold tracking-wide
        ${c.bg} ${c.text}
        ${size === 'sm' ? 'text-[11px] px-3 py-1' : 'text-[13px] px-4 py-1.5'}
      `}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <span
        className={`rounded-full ${size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'}`}
        style={{ background: type === 'overall' ? 'rgba(255,255,255,0.4)' : 'rgba(13,16,27,0.25)' }}
      />
      {c.label}
    </motion.span>
  )
}
