import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { StrideMark } from '../components/StrideMark'
import { App as KitShowcase } from '../App'
import {
  HomePage, NutritionPage, WorkoutsPage, InsightsPage, HistoryPage,
  ChatPage, AccountPage, DayRail, CHAT_HISTORY,
} from './pages'

type Page = 'home' | 'nutrition' | 'workouts' | 'insights' | 'history' | 'chat' | 'account'

// ─── Icons ───────────────────────────────────────────────────────────────────

const I = {
  home:      <path d="M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />,
  nutrition: <><path d="M6 3v7a3 3 0 0 0 6 0V3M9 3v18" /><path d="M16 3c-1.5 1.5-2 4-2 6 0 2 1 3 2 3s2-1 2-3V3M18 12v9" /></>,
  workouts:  <path d="M6.5 6.5 17.5 17.5M4 8l-1 1 3 3-3 3 1 1M20 16l1-1-3-3 3-3-1-1M8 4 7 5l3 3M16 20l1-1-3-3" />,
  insights:  <path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6" />,
  history:   <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  chat:      <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-4.5A8 8 0 1 1 21 12z" />,
  account:   <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
}

const NAV: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: I.home },
  { id: 'nutrition', label: 'Nutrition', icon: I.nutrition },
  { id: 'workouts', label: 'Workouts', icon: I.workouts },
  { id: 'insights', label: 'Insights', icon: I.insights },
  { id: 'history', label: 'History', icon: I.history },
  { id: 'chat', label: 'AI Chat', icon: I.chat },
  { id: 'account', label: 'Account', icon: I.account },
]

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {children}
    </svg>
  )
}

// ─── Left sidebar ────────────────────────────────────────────────────────────

function LeftSidebar({ page, setPage, collapsed, onToggle, dark, onToggleDark }: {
  page: Page; setPage: (p: Page) => void; collapsed: boolean; onToggle: () => void; dark: boolean; onToggleDark: () => void
}) {
  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 220 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      className="shrink-0 h-screen bg-white dark:bg-[#11141f] border-r border-ink/8 dark:border-white/8 flex flex-col py-4 overflow-hidden"
    >
      <div className={`flex items-center gap-2.5 mb-6 ${collapsed ? 'px-4 justify-center' : 'px-5'}`}>
        <div className="w-9 h-9 rounded-full bg-ink dark:bg-[#1a1e2e] flex items-center justify-center text-lavender shrink-0">
          <StrideMark className="w-6 h-6" />
        </div>
        {!collapsed && <span className="text-[18px] font-extrabold text-ink dark:text-surface tracking-[-0.5px]">Stride</span>}
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {NAV.map(n => {
          const active = page === n.id
          return (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              title={n.label}
              className={`w-full flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors cursor-pointer ${collapsed ? 'justify-center' : ''} ${
                active ? 'bg-lavender/20 text-ink dark:text-lavender' : 'text-ink/55 dark:text-white/50 hover:bg-ink/5 dark:hover:bg-white/5'
              }`}
            >
              <NavIcon>{n.icon}</NavIcon>
              {!collapsed && <span className="text-[14px] font-bold">{n.label}</span>}
              {!collapsed && active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-lavender" />}
            </button>
          )
        })}
      </nav>

      <div className="px-3 space-y-1 mt-2">
        <button
          onClick={onToggleDark}
          className={`w-full flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-ink/55 dark:text-white/50 hover:bg-ink/5 dark:hover:bg-white/5 transition-colors cursor-pointer ${collapsed ? 'justify-center' : ''}`}
        >
          <NavIcon>
            {dark
              ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></>
              : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />}
          </NavIcon>
          {!collapsed && <span className="text-[14px] font-bold">{dark ? 'Light' : 'Dark'} mode</span>}
        </button>
        <button
          onClick={onToggle}
          className={`w-full flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-ink/45 dark:text-white/40 hover:bg-ink/5 dark:hover:bg-white/5 transition-colors cursor-pointer ${collapsed ? 'justify-center' : ''}`}
        >
          <NavIcon>{collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}</NavIcon>
          {!collapsed && <span className="text-[14px] font-bold">Collapse</span>}
        </button>
      </div>
    </motion.aside>
  )
}

// ─── Collapsible right rail wrapper ──────────────────────────────────────────

function RightRail({ collapsed, onToggle, title, children }: {
  collapsed: boolean; onToggle: () => void; title: string; children: React.ReactNode
}) {
  return (
    <motion.aside
      animate={{ width: collapsed ? 48 : 312 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      className="shrink-0 h-screen border-l border-ink/8 dark:border-white/8 bg-surface dark:bg-[#090b12] overflow-hidden"
    >
      {collapsed ? (
        <button onClick={onToggle} className="w-12 h-full flex flex-col items-center pt-5 gap-3 text-ink/45 dark:text-white/40 hover:text-ink dark:hover:text-white cursor-pointer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          <span className="[writing-mode:vertical-rl] text-[11px] font-extrabold uppercase tracking-widest">{title}</span>
        </button>
      ) : (
        <div className="h-full overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-extrabold uppercase tracking-[2px] text-ink/35 dark:text-white/35">{title}</span>
            <button onClick={onToggle} aria-label="Collapse" className="w-7 h-7 rounded-full hover:bg-ink/5 dark:hover:bg-white/10 flex items-center justify-center text-ink/45 dark:text-white/40 cursor-pointer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </motion.aside>
  )
}

function ChatHistoryRail() {
  return (
    <div className="space-y-1.5">
      <button className="w-full flex items-center gap-2 rounded-[12px] bg-ink dark:bg-lavender text-white dark:text-ink px-3 py-2.5 text-[13px] font-extrabold mb-3 cursor-pointer hover:opacity-90 transition-opacity">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        New chat
      </button>
      {CHAT_HISTORY.map((c, i) => (
        <button key={i} className={`w-full text-left rounded-[10px] px-3 py-2.5 text-[13px] font-bold truncate transition-colors cursor-pointer ${
          c.active ? 'bg-lavender/20 text-ink dark:text-lavender' : 'text-ink/55 dark:text-white/50 hover:bg-ink/5 dark:hover:bg-white/5'
        }`}>
          {c.title}
        </button>
      ))}
    </div>
  )
}

// ─── Shell ───────────────────────────────────────────────────────────────────

export function Shell() {
  const [page, setPage] = useState<Page>('home')
  const [dark, setDark] = useState(false)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [kit, setKit] = useState(false)

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  if (kit) return <KitShowcase onExit={() => setKit(false)} />

  const center =
    page === 'home' ? <HomePage />
    : page === 'nutrition' ? <NutritionPage />
    : page === 'workouts' ? <WorkoutsPage />
    : page === 'insights' ? <InsightsPage />
    : page === 'history' ? <HistoryPage />
    : page === 'chat' ? <ChatPage />
    : <AccountPage onOpenKit={() => setKit(true)} />

  const rightKind: 'day' | 'chat' | null =
    page === 'home' || page === 'nutrition' || page === 'workouts' ? 'day'
    : page === 'chat' ? 'chat'
    : null

  const chatLike = page === 'home' || page === 'chat'

  return (
    <div className="h-screen flex bg-surface dark:bg-[#090b12] transition-colors duration-300">
      <LeftSidebar
        page={page} setPage={setPage}
        collapsed={leftCollapsed} onToggle={() => setLeftCollapsed(c => !c)}
        dark={dark} onToggleDark={() => setDark(d => !d)}
      />

      <main className="flex-1 min-w-0 flex">
        <section className={`flex-1 min-w-0 ${chatLike ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="h-full"
            >
              {center}
            </motion.div>
          </AnimatePresence>
        </section>

        {rightKind && (
          <RightRail
            collapsed={rightCollapsed}
            onToggle={() => setRightCollapsed(c => !c)}
            title={rightKind === 'day' ? 'Your day' : 'Chats'}
          >
            {rightKind === 'day' ? <DayRail /> : <ChatHistoryRail />}
          </RightRail>
        )}
      </main>
    </div>
  )
}
