import { motion } from "motion/react";

type MacroDonutProps = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  size?: number;
};

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

export function MacroDonut({ kcal, protein, carbs, fat, size = 140 }: MacroDonutProps) {
  const total = protein + carbs + fat;
  const r = 56;
  const cx = 70;
  const cy = 70;
  const circumference = 2 * Math.PI * r;
  const strokeWidth = 14;

  const safeTotal = total === 0 ? 1 : total;
  const proteinFrac = protein / safeTotal;
  const carbsFrac = carbs / safeTotal;
  const fatFrac = fat / safeTotal;

  const segments = [
    { frac: proteinFrac, color: "var(--color-lavender)", offset: 0 },
    { frac: carbsFrac, color: "var(--color-peach)", offset: -(proteinFrac * circumference) },
    { frac: fatFrac, color: "var(--color-mint)", offset: -((proteinFrac + carbsFrac) * circumference) },
  ];

  return (
    <div className="relative shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border)" strokeWidth={strokeWidth} />
        {segments.map((seg, i) => (
          <motion.circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            strokeDashoffset={seg.offset}
            initial={{ strokeDasharray: `0 ${circumference}` }}
            animate={{ strokeDasharray: `${seg.frac * circumference} ${circumference}` }}
            transition={{ duration: 0.8, delay: i * 0.12, ease: EASE }}
          />
        ))}
      </svg>
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
      >
        <span className="text-[26px] font-extrabold text-text leading-none">{Math.round(kcal)}</span>
        <span className="text-[11px] font-medium text-text-muted mt-0.5">kcal</span>
      </motion.div>
    </div>
  );
}
