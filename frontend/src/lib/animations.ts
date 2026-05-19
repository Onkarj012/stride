import type { Variants } from "framer-motion";

// ─── Shared Spring Configs ──────────────────────────────────────────────────
export const springs = {
  snappy: { type: "spring", stiffness: 400, damping: 25 } as const,
  smooth: { type: "spring", stiffness: 300, damping: 30 } as const,
  bouncy: { type: "spring", stiffness: 500, damping: 15, mass: 0.5 } as const,
  gentle: { type: "spring", stiffness: 200, damping: 20 } as const,
  slow: { type: "spring", stiffness: 100, damping: 20 } as const,
};

// ─── Page/Tab Transitions ───────────────────────────────────────────────────
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

export const fadeScale: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
};

// ─── List/Stagger Animations ────────────────────────────────────────────────
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

export const staggerItemScale: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
};

// ─── Card/Element Animations ────────────────────────────────────────────────
export const cardHover = {
  scale: 1.02,
  y: -4,
  transition: springs.snappy,
};

export const cardTap = {
  scale: 0.98,
  transition: { duration: 0.1 },
};

export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: springs.bouncy,
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    transition: { duration: 0.15 },
  },
};

export const slideUp: Variants = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -24 },
};

export const slideRight: Variants = {
  initial: { opacity: 0, x: -24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 24 },
};

// ─── Chat Bubble Animations ─────────────────────────────────────────────────
export const chatBubbleIn: Variants = {
  initial: { opacity: 0, scale: 0.9, y: 10 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: springs.snappy,
  },
};

export const typingDots: Variants = {
  animate: {
    y: [0, -6, 0],
    transition: {
      duration: 0.6,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// ─── Number Counter Animation ───────────────────────────────────────────────
export const counterVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3 },
  },
  changed: {
    scale: [1, 1.2, 1],
    transition: { duration: 0.3 },
  },
};

// ─── Pulse/Glow Effects ─────────────────────────────────────────────────────
export const pulseVariants: Variants = {
  animate: {
    scale: [1, 1.05, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

export const glowPulse: Variants = {
  animate: {
    boxShadow: [
      "0 0 0 0 var(--theme-primary)",
      "0 0 20px 4px var(--theme-primary)",
      "0 0 0 0 var(--theme-primary)",
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// ─── Success/Celebration ────────────────────────────────────────────────────
export const celebrateScale: Variants = {
  initial: { scale: 0, rotate: -180 },
  animate: {
    scale: 1,
    rotate: 0,
    transition: springs.bouncy,
  },
};

export const checkmarkPath = {
  initial: { pathLength: 0 },
  animate: {
    pathLength: 1,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

// ─── Skeleton Loading ───────────────────────────────────────────────────────
export const shimmer: Variants = {
  animate: {
    backgroundPosition: ["200% 0", "-200% 0"],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "linear",
    },
  },
};

// ─── Live Workout Specific ──────────────────────────────────────────────────
export const exerciseCardIn: Variants = {
  initial: { opacity: 0, x: -20, scale: 0.95 },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: springs.snappy,
  },
  exit: {
    opacity: 0,
    x: 20,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
};

export const setAdded: Variants = {
  initial: { opacity: 0, scale: 0, y: 10 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: springs.bouncy,
  },
};

export const timerPulse: Variants = {
  animate: {
    scale: [1, 1.02, 1],
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// ─── Confetti Particle ──────────────────────────────────────────────────────
export const confettiParticle = (index: number): Variants => ({
  initial: {
    opacity: 1,
    y: 0,
    x: 0,
    rotate: 0,
    scale: 1,
  },
  animate: {
    opacity: [1, 1, 0],
    y: [0, -100 - Math.random() * 100, 200],
    x: (index % 2 === 0 ? 1 : -1) * (50 + Math.random() * 100),
    rotate: Math.random() * 720,
    scale: [1, 1.2, 0.5],
    transition: {
      duration: 1.5 + Math.random() * 0.5,
      ease: "easeOut",
    },
  },
});

// ─── Utility: useReducedMotion ──────────────────────────────────────────────
export const reducedMotionVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
