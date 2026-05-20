import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Shield, Trophy, ChevronDown, ChevronUp, Check, Lock } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../backend/convex/_generated/api";
import { Card } from "./ui/Card";

interface MissionItem {
  id: string;
  title: string;
  description: string;
  xp: number;
  completed: boolean;
}

export function GamificationPanel() {
  const state = useQuery(api.gamification.getState);
  const useFreeze = useMutation(api.gamification.useStreakFreeze);

  const [showMissions, setShowMissions] = useState(false);
  const [freezeLoading, setFreezeLoading] = useState(false);

  if (!state) return null;

  const { xp, streakDays, longestStreak, streakFreezes, level, missions, missionsCompleted } = state;
  const completedCount = (missions as MissionItem[]).filter((m) => m.completed).length;
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  const handleFreeze = async () => {
    if (streakFreezes <= 0 || freezeLoading) return;
    setFreezeLoading(true);
    try {
      await useFreeze({ dateToFreeze: yesterday });
    } catch { /* already frozen or no freezes */ }
    finally { setFreezeLoading(false); }
  };

  const streakLabel =
    streakDays === 0 ? "Start your streak today"
    : streakDays === 1 ? "1 day streak 🔥"
    : `${streakDays} day streak 🔥`;

  return (
    <Card className="p-4 space-y-4">
      {/* Streak + Level row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Streak */}
        <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
          <div className="flex items-center gap-1.5 mb-1">
            <Flame size={14} className={streakDays > 0 ? "text-orange-400" : "text-[var(--text-muted)]"} />
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Streak</span>
          </div>
          <div className="font-heading text-2xl leading-none mb-1">
            {streakDays}
          </div>
          <div className="text-[10px] font-mono text-[var(--text-muted)]">
            best: {longestStreak}d
          </div>
        </div>

        {/* Level + XP */}
        <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
          <div className="flex items-center gap-1.5 mb-1">
            <Trophy size={14} className="text-accent" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Level</span>
          </div>
          <div className="font-heading text-lg leading-none mb-1">{level.name}</div>
          <div className="w-full h-1 bg-[var(--border-default)] overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${Math.min(level.progress, 100)}%` }}
            />
          </div>
          <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">{xp} XP</div>
        </div>
      </div>

      {/* Streak freeze */}
      {streakFreezes > 0 && (
        <div className="flex items-center justify-between p-2.5 border border-[var(--border-default)] bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-blue-400" />
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider">{streakFreezes} streak {streakFreezes === 1 ? "freeze" : "freezes"}</div>
              <div className="text-[9px] text-[var(--text-muted)]">Protect yesterday's streak</div>
            </div>
          </div>
          <button
            onClick={handleFreeze}
            disabled={freezeLoading}
            className="px-2.5 py-1 border border-blue-400/50 text-blue-400 text-[10px] font-mono uppercase hover:bg-blue-400/10 transition-colors disabled:opacity-50"
          >
            Use
          </button>
        </div>
      )}

      {/* Missions toggle */}
      <button
        onClick={() => setShowMissions((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase tracking-wider">Missions</span>
          <span className="text-[10px] font-mono text-accent">{completedCount}/{missions.length}</span>
          {/* Progress bar */}
          <div className="flex-1 w-20 h-1 bg-[var(--border-default)] overflow-hidden ml-1">
            <div
              className="h-full bg-accent"
              style={{ width: `${(completedCount / missions.length) * 100}%` }}
            />
          </div>
        </div>
        {showMissions ? <ChevronUp size={14} className="text-[var(--text-muted)]" /> : <ChevronDown size={14} className="text-[var(--text-muted)]" />}
      </button>

      <AnimatePresence>
        {showMissions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 pt-1">
              {(missions as MissionItem[]).map((m) => (
                <div
                  key={m.id}
                  className={`flex items-center gap-2.5 p-2.5 border transition-colors ${
                    m.completed
                      ? "border-accent/30 bg-accent/5"
                      : "border-[var(--border-default)]"
                  }`}
                >
                  <div className={`shrink-0 w-5 h-5 flex items-center justify-center border ${
                    m.completed ? "border-accent bg-accent/20" : "border-[var(--border-default)]"
                  }`}>
                    {m.completed ? (
                      <Check size={10} className="text-accent" />
                    ) : (
                      <Lock size={10} className="text-[var(--text-muted)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-mono ${m.completed ? "" : "text-[var(--text-muted)]"}`}>
                      {m.title}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate">{m.description}</div>
                  </div>
                  <div className="text-[10px] font-mono text-accent shrink-0">+{m.xp} XP</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
