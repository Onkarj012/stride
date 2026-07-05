import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type InputMode = 'type' | 'voice' | 'photo' | 'barcode' | 'ocr'

export interface AttachItem {
  key: string
  label: string
  mode?: InputMode
  icon?: React.ReactNode
  disabled?: boolean
  onSelect: () => void
}

export interface InputBarProps {
  placeholder?: string
  activeMode?: InputMode
  onModeChange?: (mode: InputMode) => void
  value?: string
  onValueChange?: (value: string) => void
  onSubmit?: () => void
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
  disabled?: boolean
  busy?: boolean
  attachItems?: AttachItem[]
  onVoice?: () => void
  voiceState?: 'idle' | 'recording' | 'transcribing'
  hideVoiceWhenTyping?: boolean
  submitEnabled?: boolean
  ariaLabel?: string
  className?: string
}

const icons: Record<InputMode, React.ReactNode> = {
  type: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-4.5A8 8 0 1 1 21 12z" />
    </svg>
  ),
  voice: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" /><path d="M5 11v1a7 7 0 0 0 14 0v-1" /><path d="M12 19v3" />
    </svg>
  ),
  photo: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" />
    </svg>
  ),
  barcode: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6v12M8 6v12M11 6v12M14 6v12M18 6v12M21 6v12" />
    </svg>
  ),
  ocr: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10" />
    </svg>
  ),
}

const sendIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
)

export function InputBar({
  placeholder = 'Message Stry — what did you eat or train?',
  activeMode = 'type',
  onModeChange,
  value = '',
  onValueChange,
  onSubmit,
  inputRef,
  disabled = false,
  busy = false,
  attachItems = [],
  onVoice,
  voiceState = 'idle',
  hideVoiceWhenTyping = true,
  submitEnabled,
  ariaLabel = 'Message Stry',
  className,
}: InputBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const attachRef = useRef<HTMLDivElement>(null)
  const canSubmit = submitEnabled ?? !!value.trim()

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: PointerEvent) {
      if (attachRef.current?.contains(event.target as Node)) return
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  function resize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  return (
    <div
      data-active-mode={activeMode}
      className={cn('relative flex items-center gap-1.5 bg-white dark:bg-[#1a1e2e] rounded-[26px] p-1.5 shadow-[0_10px_34px_rgba(13,16,27,0.14)]', className)}
    >
      <div ref={attachRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen(o => !o)}
          disabled={disabled || attachItems.length === 0}
          aria-label="Add document or media"
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 ${
            menuOpen ? 'bg-lavender text-ink rotate-45' : 'bg-surface dark:bg-ink/40 text-ink/60 dark:text-white/60 hover:bg-lavender/20'
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.16 }}
              className="absolute bottom-11 left-0 w-52 bg-white dark:bg-[#1a1e2e] rounded-[16px] p-2 shadow-[0_16px_44px_rgba(13,16,27,0.18)] border border-ink/8 dark:border-white/10 z-10"
            >
              {attachItems.map(item => (
                <button
                  key={item.key}
                  type="button"
                  disabled={item.disabled}
                  onMouseDown={e => {
                    e.preventDefault()
                    setMenuOpen(false)
                    item.onSelect()
                    if (item.mode) onModeChange?.(item.mode)
                  }}
                  className="w-full flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-bold text-ink/75 dark:text-white/75 hover:bg-lavender/15 transition-colors cursor-pointer disabled:opacity-40"
                >
                  <span className="text-lavender">{item.icon ?? (item.mode ? icons[item.mode] : icons.type)}</span>
                  {item.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <textarea
        ref={inputRef}
        value={value}
        onChange={e => {
          onValueChange?.(e.target.value)
          resize(e.target)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit?.()
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled || voiceState === 'recording' || voiceState === 'transcribing'}
        rows={1}
        style={{ resize: 'none', height: 'auto', maxHeight: 120, overflowY: 'auto', lineHeight: 1.5 }}
        className="flex-1 min-w-0 bg-transparent text-[14px] font-medium text-ink dark:text-surface placeholder:text-ink/35 dark:placeholder:text-white/35 outline-none px-1 py-2.5 disabled:opacity-50"
      />

      <button
        type="button"
        onClick={onVoice}
        disabled={disabled || voiceState === 'transcribing'}
        aria-label={voiceState === 'recording' ? 'Stop listening' : 'Voice input'}
        className={cn(
          'relative shrink-0 w-10 h-10 rounded-full bg-surface dark:bg-ink/40 text-ink/60 dark:text-white/60 hover:bg-lavender/20 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40',
          hideVoiceWhenTyping && value.trim() ? 'hidden lg:flex' : '',
          voiceState === 'recording' ? 'bg-peach text-ink hover:bg-peach' : '',
        )}
      >
        {voiceState === 'recording' && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bubblegum opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-bubblegum ring-2 ring-white dark:ring-[#1a1e2e]" />
          </span>
        )}
        {voiceState === 'transcribing' ? <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={2} /> : icons.voice}
      </button>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit || busy}
        aria-label="Send"
        className="shrink-0 w-10 h-10 rounded-full bg-ink dark:bg-lavender text-white dark:text-ink flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
      >
        {sendIcon}
      </button>
    </div>
  )
}
