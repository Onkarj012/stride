import { motion } from "framer-motion";
import { Flame, Trophy, Shield, Target, Star, Zap, TrendingUp, Award, Check, Lock } from "lucide-react";
import { Card } from "./ui/Card";
import { useQuery } from "convex/react";
import { api } from "../../../backend/convex/_generated/api";

const LEVELS = [
  { level: 1, name: "Beginner", xp: 0, description: "Everyone starts somewhere. Log your first meal to begin." },
  { level: 2, name: "Consistent", xp: 100, description: "You're building habits. Keep showing up daily." },
  { level: 3, name: "Dedicated", xp: 300, description: "Nutrition tracking is becoming second nature." },
  { level: 4, name: "Strong", xp: 600, description: "Your consistency is paying off. Push harder." },
  { level: 5, name: "Elite", xp: 1200, description: "You're in the top tier. Fine-tune your macros." },
  { level: 6, name: "Champion", xp: 2400, description: "Elite discipline. You control your nutrition." },
  { level: 7, name: "Legend", xp: 5000, description: "Unstoppable. Your habits inspire others." },
];

const XP_BREAKDOWN = [
  { action: "Log a meal", xp: 10, icon: Zap },
  { action: "Log a workout", xp: 20, icon: Target },
  { action: "Daily login streak", xp: "10 + (streak × 2)", icon: Flame },
  { action: "Hit protein goal", xp: 25, icon: TrendingUp },
  { action: "Hit calorie goal", xp: 25, icon: Star },
  { action: "Complete daily meals (3+)", xp: 30, icon: Check },
  { action: "7-day streak milestone", xp: 100, icon: Award },
];

export function GamificationPage() {
  const state = useQuery(api.gamification.getState);

  if (!state) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm font-mono text-[var(--text-muted)] tracking-wide">LOADING...</div>
      </div>
    );
  }

  const { xp, streakDays, longestStreak, streakFreezes, level, missions, missionsCompleted } = state;
  const completedCount = (missions as any[]).filter((m) => m.completed).length;
  const nextLevel = LEVELS.find((l) => l.xp > xp) || LEVELS[LEVELS.length - 1];
  const currentLevelIdx = LEVELS.findIndex((l) => l.name === level.name);
  const currentLevel = LEVELS[currentLevelIdx] || LEVELS[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="space-y-6 max-w-5xl mx-auto will-change-transform"
    >
      {/* Hero Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={14} className="text-accent" />
            <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">Level</span>
          </div>
          <div className="font-heading text-2xl">{level.name}</div>
          <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">{xp} XP total</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame size={14} className="text-orange-400" />
            <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">Streak</span>
          </div>
          <div className="font-heading text-2xl">{streakDays}d</div>
          <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">best: {longestStreak}d</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star size={14} className="text-yellow-400" />
            <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">XP to Next</span>
          </div>
          <div className="font-heading text-2xl">{Math.max(0, nextLevel.xp - xp)}</div>
          <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">
            {nextLevel.name === currentLevel.name ? "Max level" : `until ${nextLevel.name}`}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={14} className="text-blue-400" />
            <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">Freezes</span>
          </div>
          <div className="font-heading text-2xl">{streakFreezes}</div>
          <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">streak protections</div>
        </Card>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Level Progress - tall left column */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="p-5">
            <h3 className="font-heading text-xl uppercase tracking-normal mb-4">Level Progress</h3>
            <div className="space-y-3">
              {LEVELS.map((l, i) => {
                const isCurrent = l.name === level.name;
                const isUnlocked = xp >= l.xp;
                const isNext = !isUnlocked && (i === 0 || xp >= LEVELS[i - 1].xp);
                return (
                  <div
                    key={l.name}
                    className={`flex items-center gap-3 p-3 border transition-colors ${
                      isCurrent
                        ? "border-accent bg-accent/5"
                        : isUnlocked
                        ? "border-[var(--border-default)] bg-[var(--bg-elevated)]"
                        : "border-[var(--border-default)] opacity-40"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 flex items-center justify-center shrink-0 border ${
                        isUnlocked ? "border-accent text-accent" : "border-[var(--border-default)] text-[var(--text-muted)]"
                      }`}
                    >
                      {isUnlocked ? <Check size={14} /> : <Lock size={14} />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono font-bold ${isCurrent ? "text-accent" : ""}`}>
                          {l.name}
                        </span>
                        {isCurrent && (
                          <span className="text-[9px] font-mono bg-accent text-[var(--theme-primary-text)] px-1.5 py-0.5">
                            CURRENT
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">{l.description}</div>
                    </div>
                    <div className="text-xs font-mono text-[var(--text-muted)] shrink-0">{l.xp} XP</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Streak System - compact below levels */}
          <Card className="p-5">
            <h3 className="font-heading text-xl uppercase tracking-normal mb-4">Streaks & Freezes</h3>
            <div className="grid sm:grid-cols-3 gap-4 text-sm text-[var(--text-secondary)] leading-relaxed">
              <p className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                A <strong className="text-accent">streak</strong> is consecutive days with at least one log.
              </p>
              <p className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                Every <strong className="text-accent">7 days</strong> earns a <strong className="text-blue-400">streak freeze</strong>. Hold up to 3.
              </p>
              <p className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                <strong>Pro tip:</strong> Longer streaks = more XP per log.
              </p>
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="lg:col-span-7 space-y-6">
          {/* How XP Works */}
          <Card className="p-5">
            <h3 className="font-heading text-xl uppercase tracking-normal mb-4">How XP Works</h3>
            <div className="grid grid-cols-2 gap-3">
              {XP_BREAKDOWN.map((item) => (
                <div key={item.action} className="flex items-center gap-3 p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                  <div className="w-8 h-8 bg-accent/10 flex items-center justify-center shrink-0">
                    <item.icon size={14} className="text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono">{item.action}</div>
                  </div>
                  <div className="text-xs font-mono text-accent shrink-0">+{item.xp} XP</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Missions - grid instead of list */}
          <Card className="p-5">
            <h3 className="font-heading text-xl uppercase tracking-normal mb-4">Missions</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {(missions as any[]).map((m) => (
                <div
                  key={m.id}
                  className={`flex items-center gap-3 p-3 border transition-colors ${
                    m.completed
                      ? "border-accent/30 bg-accent/5"
                      : "border-[var(--border-default)] bg-[var(--bg-elevated)]"
                  }`}
                >
                  <div
                    className={`w-6 h-6 flex items-center justify-center border shrink-0 ${
                      m.completed ? "border-accent bg-accent/20" : "border-[var(--border-default)]"
                    }`}
                  >
                    {m.completed ? (
                      <Check size={12} className="text-accent" />
                    ) : (
                      <Lock size={12} className="text-[var(--text-muted)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-mono ${m.completed ? "" : "text-[var(--text-muted)]"}`}>{m.title}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{m.description}</div>
                  </div>
                  <div className="text-[10px] font-mono text-accent shrink-0">+{m.xp} XP</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs font-mono text-[var(--text-muted)] text-center">
              {completedCount}/{(missions as any[]).length} missions completed
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
