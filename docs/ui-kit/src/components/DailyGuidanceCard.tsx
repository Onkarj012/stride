import { motion } from 'framer-motion'

export interface DailyGuidanceCardProps {
  doToday: string
  recoverFrom: string
  ignoreToday: string
}

const rows = [
  { key: 'doToday',     label: 'do',      bg: 'bg-mint',      text: 'text-ink' },
  { key: 'recoverFrom', label: 'recover', bg: 'bg-sky',       text: 'text-ink' },
  { key: 'ignoreToday', label: 'ignore',  bg: 'bg-[#e7e2db]', text: 'text-[#6b5e4e]' },
] as const

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}
const row = {
  hidden: { opacity: 0, x: -12 },
  show:   { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 200, damping: 22 } },
}

export function DailyGuidanceCard(props: DailyGuidanceCardProps) {
  return (
    <motion.div
      className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
    >
      <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/40 dark:text-white/40 mb-4">
        Today's plan
      </p>
      <motion.div className="space-y-2.5" variants={container} initial="hidden" animate="show">
        {rows.map(r => (
          <motion.div
            key={r.key}
            variants={row}
            className="flex items-center gap-3 bg-surface dark:bg-ink/30 rounded-[14px] px-4 py-3.5"
          >
            <span className={`${r.bg} ${r.text} text-[10px] font-extrabold uppercase tracking-widest rounded-full px-2.5 py-1 shrink-0`}>
              {r.label}
            </span>
            <span className="text-[15px] font-medium text-ink dark:text-surface/90 leading-snug">
              {props[r.key]}
            </span>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  )
}
