import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Bell, X } from "lucide-react";
import { Card } from "@/components/primitives/Card";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * In-app nudge inbox (Task 8). Surfaces active nudges from Convex as a
 * dismissible banner. Tapping a nudge deep-links to its action; dismissing
 * records behavior server-side (which throttles that window's future nudges).
 * Shaped so a future web-push handler can reuse the same data.
 */
export function NudgeInbox() {
  const nudges = useQuery(api.nudges.getActiveNudges, {});
  const dismiss = useMutation(api.nudges.dismissNudge);
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  if (!nudges || nudges.length === 0) return null;

  const motionProps = reduce
    ? {}
    : { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, x: 40 } };

  return (
    <section aria-label="Notifications" className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {nudges.map((n: any) => (
          <motion.div key={n._id} layout={!reduce} {...motionProps}>
            <Card tone="card" radius="lg" padding="none" className="overflow-hidden border-l-4 border-l-lavender">
              <div className="flex items-start gap-3 p-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lavender/20">
                  <Bell className="h-4 w-4 text-lavender" strokeWidth={2} />
                </div>
                <button
                  type="button"
                  onClick={() => n.deepLink && navigate(n.deepLink)}
                  className="flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender rounded"
                >
                  <p className="text-[13px] font-bold text-text">{n.title}</p>
                  <p className="text-[12px] text-text-muted">{n.body}</p>
                </button>
                <button
                  type="button"
                  onClick={() => dismiss({ id: n._id })}
                  aria-label={`Dismiss: ${n.title}`}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-card-elev focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>
    </section>
  );
}
