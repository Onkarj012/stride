import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Show, useUser, ClerkLoaded, ClerkLoading, AuthenticateWithRedirectCallback } from "@clerk/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { ThemeProvider } from "@/context/ThemeContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { ToastProvider } from "@/context/ToastContext";
import { NavSheetProvider } from "@/context/NavSheetContext";
import { SnapshotProvider } from "@/context/SnapshotContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { FloatingTabBar } from "@/components/layout/FloatingTabBar";
import { HomePage } from "@/pages/HomePage";
import { InsightsPage } from "@/pages/InsightsPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { SettingsPage } from "@/pages/ProfilePage";
import { ProfilePage } from "@/pages/ProfilePage";
import { CoachPage } from "@/pages/CoachPage";
import { RecipesPage } from "@/pages/RecipesPage";
import { NutritionPage } from "@/pages/NutritionPage";
import { WorkoutsPage } from "@/pages/WorkoutsPage";
import { SignInPage, SignUpPage } from "@/pages/AuthPages";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { LandingPage } from "@/pages/LandingPage";

const pageVariants = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 } };
const pageTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

function PageWrapper({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className="min-h-full">{children}</div>;
  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition} className="min-h-full">
      {children}
    </motion.div>
  );
}

function EnsureUser() {
  const { user } = useUser();
  const ensureUser = useMutation(api.users.ensureUser);
  useEffect(() => {
    if (!user) return;
    ensureUser({ name: user.fullName ?? user.username ?? "User", email: user.primaryEmailAddress?.emailAddress ?? "" })
      .catch((err) => console.error("ensureUser failed:", err));
  }, [user, ensureUser]);
  return null;
}

/** Redirects new users (no profile) to onboarding. */
function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const profile = useQuery(api.profile.getProfile);
  // profile === undefined = loading; null = no profile yet
  if (profile === undefined) return null;
  if (profile !== null && !profile.onboardingComplete) return <Navigate to="/onboarding" replace />;
  if (profile === null) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function MainAppRoutes() {
  const location = useLocation();
  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageWrapper><HomePage /></PageWrapper>} />
          <Route path="/nutrition" element={<PageWrapper><NutritionPage /></PageWrapper>} />
          <Route path="/workouts" element={<PageWrapper><WorkoutsPage /></PageWrapper>} />
          <Route path="/insights" element={<PageWrapper><InsightsPage /></PageWrapper>} />
          <Route path="/history" element={<PageWrapper><HistoryPage /></PageWrapper>} />
          <Route path="/settings" element={<PageWrapper><SettingsPage /></PageWrapper>} />
          <Route path="/profile" element={<PageWrapper><ProfilePage /></PageWrapper>} />
          <Route path="/coach" element={<PageWrapper><CoachPage /></PageWrapper>} />
          <Route path="/recipes" element={<PageWrapper><RecipesPage /></PageWrapper>} />
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
        <div className="min-h-dvh flex items-center justify-center bg-bg">
          <div className="text-text-muted text-sm">Loading…</div>
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-out">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/sign-up" element={<SignUpPage />} />
            <Route path="/sso-callback" element={<AuthenticateWithRedirectCallback />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Show>
        <Show when="signed-in">
          <ThemeProvider>
            <NavSheetProvider>
            <SidebarProvider>
            <SnapshotProvider>
              <ToastProvider>
                <EnsureUser />
                <Routes>
                  {/* Onboarding — outside main layout */}
                  <Route path="/onboarding" element={<OnboardingPage />} />
                  {/* Main app — guarded by onboarding check */}
                  <Route path="*" element={
                    <OnboardingGuard>
                      <AppLayout>
                        <MainAppRoutes />
                      </AppLayout>
                    </OnboardingGuard>
                  } />
                </Routes>
              </ToastProvider>
            </SnapshotProvider>
            </SidebarProvider>
            </NavSheetProvider>
          </ThemeProvider>
        </Show>
      </ClerkLoaded>
    </>
  );
}
