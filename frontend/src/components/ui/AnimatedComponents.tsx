import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useSpring, useTransform } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { springs, celebrateScale, confettiParticle } from "../../lib/animations";

// ─── Animated Number Counter ────────────────────────────────────────────────
export function AnimatedNumber({
  value,
  duration = 0.5,
  className = "",
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const spring = useSpring(0, { stiffness: 100, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  useEffect(() => {
    return display.on("change", (v) => setDisplayValue(v));
  }, [display]);

  return (
    <motion.span
      className={className}
      key={value}
      initial={{ scale: 1 }}
      animate={{ scale: [1, 1.1, 1] }}
      transition={{ duration: 0.2 }}
    >
      {displayValue}
    </motion.span>
  );
}

// ─── Skeleton Loader ────────────────────────────────────────────────────────
export function Skeleton({
  className = "",
  variant = "text",
}: {
  className?: string;
  variant?: "text" | "circle" | "rect";
}) {
  const baseClass = "bg-gradient-to-r from-[var(--bg-elevated)] via-[var(--border-default)] to-[var(--bg-elevated)] bg-[length:200%_100%] animate-shimmer";

  const variants = {
    text: "h-4 rounded",
    circle: "rounded-full",
    rect: "rounded",
  };

  return (
    <div className={`${baseClass} ${variants[variant]} ${className}`} />
  );
}

// ─── Skeleton Card ──────────────────────────────────────────────────────────
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="p-5 bg-[var(--bg-card)] border border-[var(--border-default)] space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" className="w-10 h-10" />
        <div className="flex-1 space-y-2">
          <Skeleton className="w-3/4" />
          <Skeleton className="w-1/2" />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`w-${i === lines - 1 ? '2/3' : 'full'}`} />
      ))}
    </div>
  );
}

// ─── Success Checkmark Animation ────────────────────────────────────────────
export function AnimatedCheckmark({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <motion.div
      variants={celebrateScale}
      initial="initial"
      animate="animate"
      className={`inline-flex items-center justify-center ${className}`}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <motion.circle
          cx="12"
          cy="12"
          r="10"
          className="stroke-accent"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3 }}
        />
        <motion.path
          d="M8 12l3 3 5-6"
          className="stroke-accent"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        />
      </svg>
    </motion.div>
  );
}

// ─── Confetti Burst ─────────────────────────────────────────────────────────
const CONFETTI_COLORS = [
  "var(--theme-primary)",
  "#FF6B6B",
  "#4ECDC4",
  "#FFE66D",
  "#95E1D3",
];

export function ConfettiBurst({
  trigger,
  particleCount = 20,
}: {
  trigger: boolean;
  particleCount?: number;
}) {
  const [particles, setParticles] = useState<number[]>([]);

  useEffect(() => {
    if (trigger) {
      setParticles(Array.from({ length: particleCount }, (_, i) => i));
      const timer = setTimeout(() => setParticles([]), 2000);
      return () => clearTimeout(timer);
    }
  }, [trigger, particleCount]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <AnimatePresence>
        {particles.map((i) => (
          <motion.div
            key={i}
            variants={confettiParticle(i)}
            initial="initial"
            animate="animate"
            exit={{ opacity: 0 }}
            className="absolute left-1/2 top-1/2 w-3 h-3"
            style={{
              backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              borderRadius: i % 3 === 0 ? "50%" : i % 3 === 1 ? "0%" : "2px",
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Typing Indicator ───────────────────────────────────────────────────────
export function TypingIndicator({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-2 h-2 bg-accent rounded-full"
          animate={{
            y: [0, -8, 0],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ─── Pulse Ring (for live indicators) ───────────────────────────────────────
export function PulseRing({
  size = 12,
  color = "accent",
  className = "",
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <span
        className={`w-${size / 4} h-${size / 4} bg-${color} rounded-full`}
        style={{ width: size, height: size }}
      />
      <motion.span
        className={`absolute inset-0 rounded-full bg-${color}`}
        style={{ backgroundColor: `var(--theme-primary)` }}
        animate={{
          scale: [1, 2],
          opacity: [0.5, 0],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeOut",
        }}
      />
    </span>
  );
}

// ─── Progress Ring (circular progress) ──────────────────────────────────────
export function ProgressRing({
  progress,
  size = 60,
  strokeWidth = 4,
  className = "",
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className={className}>
      <circle
        className="stroke-[var(--border-default)]"
        fill="none"
        strokeWidth={strokeWidth}
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
      <motion.circle
        className="stroke-accent"
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        r={radius}
        cx={size / 2}
        cy={size / 2}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={springs.smooth}
        style={{
          strokeDasharray: circumference,
          transform: "rotate(-90deg)",
          transformOrigin: "center",
        }}
      />
    </svg>
  );
}

// ─── Shimmer Button (loading state) ─────────────────────────────────────────
export function ShimmerButton({
  children,
  loading = false,
  className = "",
  ...props
}: {
  children: React.ReactNode;
  loading?: boolean;
  className?: string;
  [key: string]: any;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={springs.snappy}
      className={`relative overflow-hidden ${className}`}
      disabled={loading}
      {...props}
    >
      {loading && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      )}
      <span className={loading ? "opacity-70" : ""}>{children}</span>
    </motion.button>
  );
}

// ─── Celebration Toast (mini celebration) ───────────────────────────────────
export function CelebrationToast({
  message,
  show,
  onHide,
}: {
  message: string;
  show: boolean;
  onHide: () => void;
}) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onHide, 3000);
      return () => clearTimeout(timer);
    }
  }, [show, onHide]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          transition={springs.bouncy}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] px-6 py-4 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wider flex items-center gap-3 shadow-2xl"
        >
          <motion.div
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{ duration: 0.5, repeat: 2 }}
          >
            <Sparkles size={20} />
          </motion.div>
          {message}
          <ConfettiBurst trigger={show} particleCount={15} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Workout Timer ──────────────────────────────────────────────────────────
export function WorkoutTimer({
  isRunning,
  className = "",
}: {
  isRunning: boolean;
  className?: string;
}) {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) setSeconds(0);
  }, [isRunning]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <motion.div
      className={`font-mono text-2xl tabular-nums ${className}`}
      animate={isRunning ? { scale: [1, 1.02, 1] } : {}}
      transition={{ duration: 1, repeat: Infinity }}
    >
      {formatTime(seconds)}
    </motion.div>
  );
}
