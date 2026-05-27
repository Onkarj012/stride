import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Show,
  SignIn,
  SignUp,
  useUser,
  ClerkLoaded,
  ClerkLoading,
} from "@clerk/react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { ThemeProvider } from "@/context/ThemeContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { FloatingTabBar } from "@/components/layout/FloatingTabBar";
import { HomePage } from "@/pages/HomePage";
import { InsightsPage } from "@/pages/InsightsPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { SettingsPage } from "@/pages/ProfilePage";
import { ProfilePage } from "@/pages/ProfilePage";
import { CoachPage } from "@/pages/CoachPage";

const VoxelCanvas = lazy(() =>
  import("@/components/voxel/VoxelCanvas").then((m) => ({ default: m.VoxelCanvas })),
);

const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

const pageTransition = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="min-h-full"
    >
      {children}
    </motion.div>
  );
}

/** Calls api.users.ensureUser once after sign-in to create/link the Convex user row. */
function EnsureUser() {
  const { user } = useUser();
  const ensureUser = useMutation(api.users.ensureUser);

  useEffect(() => {
    if (!user) return;
    const name = user.fullName ?? user.username ?? "User";
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    ensureUser({ name, email }).catch((err) => {
      console.error("ensureUser failed:", err);
    });
  }, [user, ensureUser]);

  return null;
}

/** Centered loading shell while Clerk initialises. */
function LoadingShell() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg">
      <div className="text-text-muted text-sm">Loading…</div>
    </div>
  );
}

/** Sign-in / sign-up routes, mounted when no user is authenticated. */
function AuthRoutes() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg p-6">
      <Routes>
        <Route path="/sign-in/*" element={<SignIn routing="path" path="/sign-in" />} />
        <Route path="/sign-up/*" element={<SignUp routing="path" path="/sign-up" />} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    </div>
  );
}

function MainAppRoutes() {
  const location = useLocation();
  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageWrapper><HomePage /></PageWrapper>} />
          <Route path="/insights" element={<PageWrapper><InsightsPage /></PageWrapper>} />
          <Route path="/history" element={<PageWrapper><HistoryPage /></PageWrapper>} />
          <Route path="/settings" element={<PageWrapper><SettingsPage /></PageWrapper>} />
          <Route path="/profile" element={<PageWrapper><ProfilePage /></PageWrapper>} />
          <Route path="/coach" element={<PageWrapper><CoachPage /></PageWrapper>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
      <FloatingTabBar />
    </>
  );
}

export default function App() {
  return (
    <>
      <ClerkLoading>
        <LoadingShell />
      </ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-out">
          <AuthRoutes />
        </Show>
        <Show when="signed-in">
          <ThemeProvider>
            <SidebarProvider>
              <EnsureUser />
              <Suspense fallback={null}>
                <VoxelCanvas />
              </Suspense>
              <AppLayout>
                <MainAppRoutes />
              </AppLayout>
            </SidebarProvider>
          </ThemeProvider>
        </Show>
      </ClerkLoaded>
    </>
  );
}
