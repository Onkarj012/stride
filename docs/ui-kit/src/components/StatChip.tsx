import { motion } from 'framer-motion'

type ChipColor = 'mint' | 'sky' | 'peach' | 'bubblegum'

interface StatChipProps {
  label: string
  value: string
  color: ChipColor
}

const bg: Record<ChipColor, string> = {
  mint:      'bg-mint',
  sky:       'bg-sky',
  peach:     'bg-peach',
  bubblegum: 'bg-bubblegum',
}

export function StatChip({ label, value, color }: StatChipProps) {
  return (
    <motion.div
      className={`${bg[color]} rounded-[16px] px-5 py-3 flex flex-col items-start min-w-[100px]`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      <span className="text-[11px] font-bold text-ink/50 uppercase tracking-widest mb-0.5">{label}</span>
      <span className="text-[20px] font-extrabold text-ink leading-tight tabular-nums">{value}</span>
    </motion.div>
  )
}
