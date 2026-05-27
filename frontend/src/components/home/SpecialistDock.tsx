import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Card } from "@/components/primitives/Card";
import { VoxelAgent } from "@/components/voxel/VoxelAgent";
import { type AgentKind } from "@/components/primitives/PixelAgent";
import { AGENT_META } from "@/data/mock";

const SPECIALISTS: AgentKind[] = ["diet", "workout", "sleep", "water", "habit", "wellness"];

const TONE_BG: Record<string, string> = {
  peach: "bg-peach/15",
  lavender: "bg-lavender/15",
  sky: "bg-sky/15",
  mint: "bg-mint/15",
  bubblegum: "bg-bubblegum/15",
};

const SPRING = { type: "spring", stiffness: 280, damping: 22 } as const;

export function SpecialistDock() {
  return (
    <section className="w-full">
      <header className="flex items-baseline justify-between mb-3 px-1">
        <div>
          <h2 className="text-h3 text-text">Specialist agents</h2>
          <p className="text-[13px] text-text-muted mt-0.5">
            Each one focuses on a single area, working with Stry behind the scenes.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {SPECIALISTS.map((kind, i) => {
          const meta = AGENT_META[kind];
          return (
            <motion.div
              key={kind}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: i * 0.05 }}
            >
              <Link
                to="/coach"
                className="block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender rounded-[20px] h-full"
              >
                <Card
                  tone="card"
                  radius="lg"
                  padding="md"
                  lift
                  className="flex flex-col items-center gap-2 text-center h-full"
                >
                  <div className={`w-full aspect-square rounded-[14px] overflow-hidden relative ${TONE_BG[meta.tone] ?? "bg-card-elev"}`}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <VoxelAgent agent={kind} size={96} />
                    </div>
                  </div>
                  <div className="space-y-0.5 min-h-[36px]">
                    <p className="text-[13px] font-bold text-text leading-tight">
                      {meta.species}
                    </p>
                    <p className="text-[11px] text-text-muted leading-tight line-clamp-1">
                      {meta.tagline}
                    </p>
                  </div>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
