import { motion, useReducedMotion } from "motion/react";
import { Card, CardSkeleton, pressSpring } from "@/components/ui";
import type { Gate, Summary } from "./types";
import { cn } from "@/lib/utils";

// Daily burn card: the learned number once it exists, otherwise progress toward the gate.
export function ExpenditureCard({ summary }: { summary: Summary | undefined }) {
  if (summary === undefined) return <CardSkeleton lines={4} />;
  const { gate, snapshot } = summary;

  if (gate.status === "ok" && snapshot)
    return (
      <Card title="Daily burn">
        <p className="-mt-2 font-display text-[44px] leading-none font-bold tracking-[-0.045em] tabular-nums">
          {snapshot.estimate.toLocaleString("en-IN")}
          <span className="ml-1.5 font-body text-sm font-medium tracking-normal text-ink3">kcal / day</span>
        </p>
        <div className="flex items-center gap-2 type-caption text-ink2">
          <span className="flex gap-1" aria-hidden>
            {[0.2, 0.4, 0.6, 0.8, 1].map((step) => (
              <i key={step} className={cn("h-[5px] w-4 rounded-[3px]", snapshot.confidence >= step - 0.1 ? "bg-fat" : "bg-card2")} />
            ))}
          </span>
          {Math.round(snapshot.confidence * 100)}% of days logged
        </div>
        <p className="type-secondary text-ink2">Worked out from your last {snapshot.windowDays} days of logs and weigh-ins.</p>
      </Card>
    );

  return <GateProgress gate={gate} />;
}

// The gate's three requirements, each with a bar showing how far along it is.
function GateProgress({ gate }: { gate: Gate }) {
  const needsProfile = gate.reasons.includes("missing_baseline");
  const dataReady = gate.reasons.every((reason) => reason === "missing_baseline");
  const minPct = Math.round(gate.minLoggedFraction * 100);
  const almostReady = dataReady && !needsProfile;

  return (
    <Card title="Daily burn">
      <div className="-mt-2 flex flex-col gap-1.5">
        <p className="type-card-title">{almostReady ? "Almost ready" : "Still learning"}</p>
        <p className="type-secondary text-ink2">
          {almostReady
            ? "You have enough data. Your first real burn number arrives with the next early-morning update."
            : `It needs ${gate.minDays} days with ${gate.minWeighIns} weigh-ins and ${minPct}% of days logged. Nothing is guessed in the meantime.`}
        </p>
      </div>
      <GateRow
        label="Days of data"
        value={`${Math.min(gate.windowDays, gate.minDays)} of ${gate.minDays}`}
        fill={gate.windowDays / gate.minDays}
        done={gate.windowDays >= gate.minDays}
      />
      <GateRow
        label="Weigh-ins"
        value={`${Math.min(gate.weighIns, gate.minWeighIns)} of ${gate.minWeighIns}`}
        fill={gate.weighIns / gate.minWeighIns}
        done={gate.weighIns >= gate.minWeighIns}
      />
      <GateRow
        label="Days logged"
        value={gate.windowDays === 0 ? `needs ${minPct}%` : `${gate.loggedDays} of ${gate.windowDays} · needs ${minPct}%`}
        fill={gate.windowDays === 0 ? 0 : gate.loggedFraction / gate.minLoggedFraction}
        done={gate.windowDays > 0 && gate.loggedFraction >= gate.minLoggedFraction}
      />
      {needsProfile ? <p className="type-caption text-ink3">Also needs your height, age, sex and activity level, plus one weigh-in.</p> : null}
    </Card>
  );
}

// One gate requirement: its label, its value, and a bar that turns green when met.
function GateRow({ label, value, fill, done }: { label: string; value: string; fill: number; done: boolean }) {
  const reduce = useReducedMotion();
  const width = Math.min(1, Math.max(0, fill)) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="type-secondary text-ink2">{label}</span>
        <span className="type-callout-strong text-ink tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-pill bg-card2">
        <motion.div
          className={cn("h-full rounded-pill", done ? "bg-fat" : "bg-polo")}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${width}%` }}
          transition={pressSpring}
        />
      </div>
    </div>
  );
}
