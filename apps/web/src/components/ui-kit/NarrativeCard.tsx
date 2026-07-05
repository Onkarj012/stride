import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { SPRING_CARD } from '@/lib/motion'

export interface NarrativeCardProps {
  type: 'daily' | 'weekly'
  narrative: string
  date: string
}

export function NarrativeCard({ type, narrative, date }: NarrativeCardProps) {
  const [displayed, setDisplayed] = useState('')

  useEffect(() => {
    setDisplayed('')
    let i = 0
    const id = setInterval(() => {
      if (i >= narrative.length) { clearInterval(id); return }
      setDisplayed(narrative.slice(0, ++i))
    }, 18)
    return () => clearInterval(id)
  }, [narrative])

  const eyebrow = type === 'daily' ? 'Morning insight' : 'Weekly recap'
  const accent   = type === 'daily' ? '#FDB572' : '#B3A0FF'

  return (
    <motion.div
      className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CARD}
    >
      <div className="flex items-center gap-2 mb-4">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: accent }}
        />
        <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/40 dark:text-white/40">
          {eyebrow}
        </p>
        <span className="ml-auto text-[12px] font-medium text-ink/30 dark:text-white/30">{date}</span>
      </div>

      <div className="min-h-[72px]">
        <p className="text-[16px] font-medium text-ink dark:text-surface/90 leading-relaxed">
          {displayed}
          {displayed.length < narrative.length && (
            <span className="inline-block w-0.5 h-4 bg-ink dark:bg-surface ml-0.5 animate-[blink_1s_steps(1)_infinite] align-middle" />
          )}
        </p>
      </div>
    </motion.div>
  )
}
