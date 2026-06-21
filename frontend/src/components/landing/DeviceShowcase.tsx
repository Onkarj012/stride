import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Home, UtensilsCrossed, Sparkles, BarChart3 } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { StrideMark } from "@/components/primitives/StrideMark";
import { cn } from "@/lib/utils";
import { MockScreen, SCREENS, type ScreenId, type Variant } from "./mockScreens";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const CYCLE_MS = 4200;

const NAV_ICON: Record<ScreenId, typeof Home> = {
  home: Home,
  nutrition: UtensilsCrossed,
  coach: Sparkles,
  insights: BarChart3,
};

const screenVariants = {
  initial: { opacity: 0, x: 28 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -28 },
};

function ScreenSwap({ active, variant }: { active: ScreenId; variant: Variant }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={active}
        variants={screenVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.4, ease: EASE }}
        className="h-full w-full"
      >
        <MockScreen id={active} variant={variant} />
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Desktop browser + app chrome ── */
function DesktopFrame({ active }: { active: ScreenId }) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[var(--shadow-float)]">
      {/* Browser top bar */}
      <div className="flex items-center gap-2 border-b border-border bg-bg/60 px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <div className="mx-auto flex items-center gap-1.5 rounded-full bg-input px-3 py-1 text-[11px] text-text-subtle">
          <span className="h-1.5 w-1.5 rounded-full bg-mint" />
          app.stride.fit
        </div>
      </div>
      {/* App shell: rail + content */}
      <div className="flex h-[520px]">
        <div className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-bg/40 py-5">
          <StrideMark className="mb-4 h-7 w-7" />
          {SCREENS.map((s) => {
            const Icon = NAV_ICON[s.id];
            const on = s.id === active;
            return (
              <div
                key={s.id}
                className={cn(
                  "grid h-10 w-10 place-items-center rounded-2xl transition-colors duration-300",
                  on ? "bg-lavender text-ink" : "text-text-subtle",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={on ? 2.4 : 2} />
              </div>
            );
          })}
        </div>
        <div className="min-w-0 flex-1">
          <ScreenSwap active={active} variant="desktop" />
        </div>
      </div>
    </div>
  );
}

/* ── Phone ── */
function PhoneFrame({ active, float }: { active: ScreenId; float: boolean }) {
  return (
    <motion.div
      animate={float ? { y: [0, -10, 0] } : { y: 0 }}
      transition={float ? { duration: 5.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
      className="w-[272px] rounded-[42px] border-[6px] border-ink bg-ink p-0 shadow-[var(--shadow-float)]"
    >
      <div className="relative overflow-hidden rounded-[36px] bg-card">
        {/* notch */}
        <div className="absolute left-1/2 top-2.5 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-ink" />
        <div className="h-[560px]">
          <ScreenSwap active={active} variant="phone" />
        </div>
        {/* bottom tab bar */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-around border-t border-border bg-card/95 px-2 py-2.5 backdrop-blur">
          {SCREENS.map((s) => {
            const Icon = NAV_ICON[s.id];
            const on = s.id === active;
            return (
              <Icon
                key={s.id}
                className={cn("h-5 w-5 transition-colors duration-300", on ? "text-lavender" : "text-text-subtle")}
                strokeWidth={on ? 2.5 : 2}
              />
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

export function DeviceShowcase() {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [idx, setIdx] = useState(0);
  const active = SCREENS[idx].id;

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % SCREENS.length), CYCLE_MS);
    return () => clearInterval(t);
  }, [reduce]);

  return (
    <div className="flex flex-col items-center gap-7">
      <div className="relative mx-auto w-full max-w-4xl">
        {/* ambient glow behind devices */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-10 -inset-y-8 -z-10 rounded-[40px] bg-gradient-to-tr from-lavender/25 via-sky/15 to-peach/20 blur-3xl"
        />
        {/* Desktop only from md up */}
        <div className="hidden md:block md:pr-32 lg:pr-44">
          <DesktopFrame active={active} />
        </div>
        {/* Phone: centered on mobile, overlapping desktop on md+ */}
        <div className="flex justify-center md:absolute md:-bottom-12 md:right-0 md:z-20 md:block">
          <PhoneFrame active={active} float={!reduce} />
        </div>
      </div>

      {/* Screen selector / progress */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {SCREENS.map((s, i) => {
          const on = i === idx;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setIdx(i)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                on ? "bg-ink text-text-on-ink" : "bg-card text-text-muted border border-border hover:text-text",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
