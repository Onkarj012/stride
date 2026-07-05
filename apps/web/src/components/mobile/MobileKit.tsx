import { motion } from "motion/react";
import { useLocation, useNavigate } from "react-router-dom";
import { StrideMark } from "@/components/ui-kit";
import type { MacroData } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { SPRING_PILL } from "@/lib/motion";

export function MobileIcon({ children, size = 22, sw = 2 }: { children: React.ReactNode; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {children}
    </svg>
  );
}

export function StatusBar() {
  return (
    <div className="relative h-12 shrink-0 flex items-end justify-between px-7 pb-1 text-ink dark:text-surface">
      <span className="text-[15px] font-extrabold tracking-tight tabular-nums">9:41</span>
      <div className="absolute left-1/2 -translate-x-1/2 top-2 w-[105px] h-[30px] rounded-full bg-ink dark:bg-black" />
      <div className="flex items-center gap-1.5">
        <MobileIcon size={16} sw={2.4}><path d="M2 20h.01M6 20v-4M10 20v-8M14 20v-12M18 20V6" /></MobileIcon>
        <MobileIcon size={16} sw={2.4}><path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M12 20h.01" /></MobileIcon>
        <svg width="26" height="14" viewBox="0 0 26 14" fill="none" className="text-ink dark:text-surface">
          <rect x="1" y="2" width="20" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <rect x="3" y="4" width="15" height="6" rx="1.5" fill="currentColor" />
          <rect x="23" y="5" width="2" height="4" rx="1" fill="currentColor" opacity="0.5" />
        </svg>
      </div>
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/35 dark:text-white/35 mb-3">{children}</p>;
}

export function ScreenHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-[26px] font-extrabold text-ink dark:text-surface tracking-[-1px] leading-tight">{title}</h1>
        {sub && <p className="text-[13px] font-medium text-ink/45 dark:text-white/45 mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function OverlayHeader({ title, back, right }: { title: string; back: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-5 pt-2">
      <button onClick={back} aria-label="Back" className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-ink/70 dark:text-white/70 active:scale-90 transition-transform">
        <MobileIcon size={24}><path d="M15 6l-6 6 6 6" /></MobileIcon>
      </button>
      <h1 className="text-[22px] font-extrabold text-ink dark:text-surface tracking-[-0.5px]">{title}</h1>
      <div className="ml-auto">{right}</div>
    </div>
  );
}

const MACRO_META: { key: keyof MacroData; label: string; bar: string; unit: string }[] = [
  { key: "kcal", label: "Calories", bar: "bg-peach", unit: "" },
  { key: "protein", label: "Protein", bar: "bg-mint", unit: "g" },
  { key: "carbs", label: "Carbs", bar: "bg-sky", unit: "g" },
  { key: "fat", label: "Fat", bar: "bg-bubblegum", unit: "g" },
];

export function MacroSummary({ totals, target }: { totals: MacroData; target: MacroData }) {
  const left = Math.max(target.kcal - totals.kcal, 0);
  return (
    <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]">
      <div className="flex items-end justify-between mb-4">
        <div>
          <Eyebrow>Today's fuel</Eyebrow>
          <p className="text-[34px] font-extrabold text-ink dark:text-surface tracking-[-1.5px] tabular-nums leading-none">
            {left.toLocaleString()}<span className="text-[15px] font-bold text-ink/35 dark:text-white/35 ml-1.5">kcal left</span>
          </p>
        </div>
        <span className="text-[12px] font-extrabold text-ink/40 dark:text-white/40 tabular-nums">
          {totals.kcal} / {target.kcal}
        </span>
      </div>
      <div className="space-y-2.5">
        {MACRO_META.map((m) => {
          const pct = Math.min(totals[m.key] / Math.max(target[m.key], 1), 1);
          return (
            <div key={m.key}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[12px] font-bold text-ink/55 dark:text-white/55">{m.label}</span>
                <span className="text-[12px] font-extrabold text-ink dark:text-surface tabular-nums">
                  {totals[m.key]}<span className="text-ink/30 dark:text-white/30"> / {target[m.key]}{m.unit}</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface dark:bg-ink/40 overflow-hidden">
                <motion.div className={`h-full rounded-full ${m.bar}`} initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ type: "spring", stiffness: 260, damping: 30 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SegToggle<T extends string>({ value, options, onChange, layoutId }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; layoutId: string }) {
  return (
    <div className="inline-flex w-full bg-white dark:bg-[#1a1e2e] rounded-[14px] p-1 shadow-[0_8px_24px_rgba(13,16,27,0.06)]">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} className="relative flex-1 py-2.5 text-[13px] font-bold rounded-[10px]">
          {value === o.id && <motion.span layoutId={layoutId} className="absolute inset-0 bg-ink dark:bg-lavender rounded-[10px]" transition={SPRING_PILL} />}
          <span className={cn("relative z-10 transition-colors duration-150", value === o.id ? "text-white dark:text-ink" : "text-ink/55 dark:text-white/55")}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

const tabs = [
  { to: "/", label: "Today", icon: <path d="M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" /> },
  { to: "/nutrition", label: "Food", icon: <><path d="M6 3v7a3 3 0 0 0 6 0V3M9 3v18" /><path d="M16 3c-1.5 1.5-2 4-2 6 0 2 1 3 2 3s2-1 2-3V3M18 12v9" /></> },
  { to: "/workouts", label: "Train", icon: <path d="M6.5 6.5 17.5 17.5M4 8l-1 1 3 3-3 3 1 1M20 16l1-1-3-3 3-3-1-1M8 4 7 5l3 3M16 20l1-1-3-3" /> },
  { to: "/insights", label: "Insights", icon: <path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6" /> },
] as const;

function activeFor(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

function TabButton({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = activeFor(pathname, to);
  return (
    <button onClick={() => navigate(to)} className="flex flex-col items-center gap-1 flex-1 py-1" aria-label={label}>
      <span className={active ? "text-ink dark:text-lavender" : "text-ink/40 dark:text-white/40"}><MobileIcon size={24}>{icon}</MobileIcon></span>
      <span className={cn("text-[10px] font-bold", active ? "text-ink dark:text-lavender" : "text-ink/40 dark:text-white/40")}>{label}</span>
    </button>
  );
}

export function MobileTabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const stryActive = pathname.startsWith("/coach");
  return (
    <div className="shrink-0 px-4 pt-2 bg-surface/80 dark:bg-[#090b12]/80 backdrop-blur-xl border-t border-ink/6 dark:border-white/6" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)" }}>
      <div className="flex items-end justify-between gap-1">
        {tabs.slice(0, 2).map((t) => <TabButton key={t.to} {...t} />)}
        <button onClick={() => navigate("/coach")} className="flex flex-col items-center gap-1 -mt-6 px-2" aria-label="Open Stry">
          <span className="w-14 h-14 rounded-full bg-lavender flex items-center justify-center shadow-[0_12px_30px_rgba(179,160,255,0.5)] transition-transform active:scale-90">
            <StrideMark className="w-8 h-8 text-ink" />
          </span>
          <span className={cn("text-[10px] font-extrabold", stryActive ? "text-ink dark:text-lavender" : "text-ink/45 dark:text-white/45")}>Stry</span>
        </button>
        {tabs.slice(2).map((t) => <TabButton key={t.to} {...t} />)}
      </div>
    </div>
  );
}
