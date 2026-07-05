import { motion } from 'motion/react'
import type { Agent } from '@/lib/storage'
import { AGENT_META } from '@/data/mock'
import { cn } from '@/lib/utils'

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

const agentToType: Record<Agent, AgentType> = {
  main: 'overall',
  diet: 'diet',
  workout: 'workout',
  sleep: 'sleep',
  water: 'hydration',
  habit: 'habits',
  wellness: 'mental',
}

interface AgentBadgeProps {
  type?: AgentType
  agent?: Agent
  size?: 'sm' | 'md'
  className?: string
}

export function AgentBadge({ type, agent, size = 'sm', className }: AgentBadgeProps) {
  const resolvedType = type ?? (agent ? agentToType[agent] : 'overall')
  const meta = agent ? AGENT_META[agent] : undefined
  const c = config[resolvedType]

  return (
    <motion.span
      className={cn(`
        inline-flex items-center gap-1.5 rounded-full font-extrabold tracking-wide
        ${c.bg} ${c.text}
        ${size === 'sm' ? 'text-[11px] px-3 py-1' : 'text-[13px] px-4 py-1.5'}
      `, className)}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <span
        className={`rounded-full ${size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'}`}
        style={{ background: resolvedType === 'overall' ? 'rgba(255,255,255,0.4)' : 'rgba(13,16,27,0.25)' }}
      />
      {meta?.label ?? c.label}
    </motion.span>
  )
}
