import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../ui/PageHeader";

export default function ProfileTab() {
  const navigate = useNavigate();
  return (
    <motion.div
      key="profile-tab"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="max-w-4xl mx-auto space-y-6 text-center py-20 will-change-transform"
      data-testid="profile-tab"
    >
      <PageHeader title="Profile Moved" subtitle="Settings are now on a dedicated page" />
      <button
        onClick={() => navigate('/settings')}
        className="px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wider font-bold"
      >
        Open Settings
      </button>
    </motion.div>
  );
}
