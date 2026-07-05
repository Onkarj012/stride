import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AgentBadge, type AgentType } from './AgentBadge'

type CoachStyle = 'gentle' | 'motivating' | 'analytical'

export interface CoachBubbleProps {
  messages: Record<CoachStyle, string>
  agentType: AgentType
  defaultStyle?: CoachStyle
}

const styleLabels: CoachStyle[] = ['gentle', 'motivating', 'analytical']

export function CoachBubble({ messages, agentType, defaultStyle = 'gentle' }: CoachBubbleProps) {
  const [style, setStyle] = useState<CoachStyle>(defaultStyle)

  return (
    <motion.div
      className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/40 dark:text-white/40">
          Stry says
        </p>
        <AgentBadge type={agentType} />
      </div>

      <div className="bg-lavender/15 dark:bg-lavender/10 rounded-[16px] p-4 min-h-[72px] relative">
        <AnimatePresence mode="wait">
          <motion.p
            key={style}
            className="text-[16px] font-medium text-ink dark:text-surface leading-relaxed"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            {messages[style]}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="flex gap-2 mt-4 flex-wrap">
        {styleLabels.map(s => (
          <button
            key={s}
            onClick={() => setStyle(s)}
            className={`
              font-bold text-[13px] rounded-full px-4 py-2 border transition-all duration-150 cursor-pointer
              ${style === s
                ? 'bg-ink text-white border-ink dark:bg-lavender dark:text-ink dark:border-lavender'
                : 'bg-white dark:bg-transparent text-ink/50 dark:text-white/50 border-ink/15 dark:border-white/15 hover:border-ink/30'
              }
            `}
          >
            {s}
          </button>
        ))}
      </div>
    </motion.div>
  )
}
