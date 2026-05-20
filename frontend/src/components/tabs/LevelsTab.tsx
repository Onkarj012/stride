import { motion } from "framer-motion";
import { PageHeader } from "../ui/PageHeader";
import { GamificationPage } from "../GamificationPage";

export default function LevelsTab() {
  return (
    <motion.div
      key="levels-tab"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="space-y-6 will-change-transform overflow-auto"
      data-testid="levels-tab"
    >
      <PageHeader title="Levels & Rewards" subtitle="Track your progress, streaks, and achievements" />
      <GamificationPage />
    </motion.div>
  );
}
