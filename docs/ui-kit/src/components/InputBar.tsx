import { motion } from 'framer-motion'

export type InputMode = 'type' | 'voice' | 'photo' | 'barcode' | 'ocr'

export interface InputBarProps {
  placeholder?: string
  activeMode: InputMode
  onModeChange?: (mode: InputMode) => void
}

const modes: { key: InputMode; label: string; icon: React.ReactNode }[] = [
  {
    key: 'type',
    label: 'Type',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-4.5A8 8 0 1 1 21 12z"/>
      </svg>
    ),
  },
  {
    key: 'voice',
    label: 'Voice',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/>
        <path d="M5 11v1a7 7 0 0 0 14 0v-1"/>
        <path d="M12 19v3"/>
      </svg>
    ),
  },
  {
    key: 'photo',
    label: 'Photo',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <circle cx="12" cy="13" r="3.5"/>
      </svg>
    ),
  },
  {
    key: 'barcode',
    label: 'Scan',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6v12M8 6v12M11 6v12M14 6v12M18 6v12M21 6v12"/>
      </svg>
    ),
  },
  {
    key: 'ocr',
    label: 'Label',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10"/>
      </svg>
    ),
  },
]

const placeholders: Record<InputMode, string> = {
  type:    'had a bowl of oats with banana and almonds...',
  voice:   'Listening...',
  photo:   'Photo analysed — reviewing macros...',
  barcode: 'Point camera at barcode...',
  ocr:     'Scanning nutrition label...',
}

export function InputBar({ activeMode, onModeChange }: InputBarProps) {
  const active = modes.find(m => m.key === activeMode)!

  return (
    <motion.div
      className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-4 shadow-[0_10px_30px_rgba(13,16,27,0.07)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
    >
      <div className="flex items-center gap-3 bg-surface dark:bg-ink/30 rounded-[14px] px-4 py-3.5">
        <span className="text-lavender shrink-0">{active.icon}</span>
        <span className="text-[15px] text-ink/40 dark:text-white/40 font-medium flex-1 truncate">
          {placeholders[activeMode]}
        </span>
        <span className="w-0.5 h-5 bg-ink dark:bg-white opacity-60 animate-[blink_1s_steps(1)_infinite]" />
      </div>

      <div className="flex gap-1.5 mt-3">
        {modes.map(m => (
          <button
            key={m.key}
            onClick={() => onModeChange?.(m.key)}
            className={`
              flex-1 flex flex-col items-center gap-1 py-2.5 rounded-[12px] transition-all duration-200 cursor-pointer border
              ${activeMode === m.key
                ? 'bg-lavender text-ink border-lavender'
                : 'bg-surface dark:bg-ink/30 text-ink/40 dark:text-white/40 border-transparent hover:bg-lavender/10'
              }
            `}
          >
            {m.icon}
            <span className="text-[10px] font-extrabold tracking-wide">{m.label}</span>
          </button>
        ))}
      </div>
    </motion.div>
  )
}
