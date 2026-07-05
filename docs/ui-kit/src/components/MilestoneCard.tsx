import { motion } from 'framer-motion'

export interface Milestone {
  label: string
  achieved: boolean
}

export interface MilestoneCardProps {
  milestones: Milestone[]
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, scale: 0.75 },
  show:   { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 20 } },
}

export function MilestoneCard({ milestones }: MilestoneCardProps) {
  const achieved = milestones.filter(m => m.achieved).length

  return (
    <motion.div
      className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/40 dark:text-white/40">
          Milestones
        </p>
        <span className="text-[13px] font-bold text-ink/40 dark:text-white/40 tabular-nums">
          {achieved}/{milestones.length}
        </span>
      </div>

      <motion.div
        className="flex flex-wrap gap-2"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {milestones.map((m, i) => (
          <motion.div
            key={i}
            variants={item}
            className={`
              rounded-full px-4 py-2 text-[13px] font-bold transition-colors
              ${m.achieved
                ? 'bg-ink text-white dark:bg-lavender dark:text-ink'
                : 'bg-transparent text-ink/40 dark:text-white/30 border-2 border-dashed border-ink/15 dark:border-white/15'
              }
            `}
          >
            {m.achieved && (
              <span className="mr-1.5 opacity-70">✓</span>
            )}
            {m.label}
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  )
}
