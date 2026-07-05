import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
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
import { MobileTabBar, StatusBar } from "@/components/mobile/MobileKit";
import { HomePage } from "@/pages/HomePage";
import { InsightsPage } from "@/pages/InsightsPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { SettingsPage } from "@/pages/ProfilePage";
import { ProfilePage } from "@/pages/ProfilePage";
import { CoachPage } from "@/pages/CoachPage";
import { NutritionPage } from "@/pages/NutritionPage";
import { WorkoutsPage } from "@/pages/WorkoutsPage";
import { SignInPage, SignUpPage } from "@/pages/AuthPages";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { LandingPage } from "@/pages/LandingPage";
import { FADE_FAST } from "@/lib/motion";

const pageVariants = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, transition: { duration: 0.1 } } };
const pageTransition = FADE_FAST;
const mobilePageTransition = { duration: 0.16 };
const TAB_PATHS = ["/", "/nutrition", "/workouts", "/insights"] as const;
const PUSH_PATHS = ["/history", "/settings", "/profile"] as const;

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

function AppRoutes() {
  const location = useLocation();
  return (
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
        <Route path="/recipes" element={<Navigate to="/nutrition" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function MobilePageWrapper({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={reduce ? { duration: 0 } : mobilePageTransition} className="min-h-full h-full">
      {children}
    </motion.div>
  );
}

function MobileOverlayWrapper({ children, slideUp = false }: { children: React.ReactNode; slideUp?: boolean }) {
  const reduce = useReducedMotion();
  const initial = slideUp ? { y: "100%" } : { x: "100%" };
  const animate = slideUp ? { y: 0 } : { x: 0 };
  const exit = slideUp ? { y: "100%" } : { x: "100%" };
  const transition = reduce
    ? { duration: 0 }
    : slideUp
      ? { type: "spring" as const, stiffness: 300, damping: 34 }
      : { type: "spring" as const, stiffness: 320, damping: 36 };
  return (
    <motion.div
      initial={reduce ? false : initial}
      animate={animate}
      exit={exit}
      transition={transition}
      className="absolute inset-0 z-40 bg-surface dark:bg-[#090b12] flex flex-col overflow-hidden"
    >
      <StatusBar />
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {children}
      </div>
    </motion.div>
  );
}

function mobileBasePath(pathname: string): (typeof TAB_PATHS)[number] {
  if (pathname.startsWith("/nutrition")) return "/nutrition";
  if (pathname.startsWith("/workouts")) return "/workouts";
  if (pathname.startsWith("/insights")) return "/insights";
  return "/";
}

function MobileTabRoutes() {
  const location = useLocation();
  const basePath = mobileBasePath(location.pathname);
  const baseLocation = { ...location, pathname: basePath };
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <Routes location={baseLocation} key={basePath}>
        <Route path="/" element={<MobilePageWrapper><HomePage /></MobilePageWrapper>} />
        <Route path="/nutrition" element={<MobilePageWrapper><NutritionPage /></MobilePageWrapper>} />
        <Route path="/workouts" element={<MobilePageWrapper><WorkoutsPage /></MobilePageWrapper>} />
        <Route path="/insights" element={<MobilePageWrapper><InsightsPage /></MobilePageWrapper>} />
      </Routes>
    </AnimatePresence>
  );
}

function MobileOverlayRoutes() {
  const location = useLocation();
  const overlayPath = location.pathname === "/coach"
    ? "/coach"
    : location.pathname === "/recipes"
      ? "/recipes"
    : PUSH_PATHS.find((path) => location.pathname.startsWith(path));

  return (
    <AnimatePresence initial={false}>
      {overlayPath && (
        <Routes location={location} key={overlayPath}>
          <Route path="/coach" element={<MobileOverlayWrapper slideUp><CoachPage /></MobileOverlayWrapper>} />
          <Route path="/history" element={<MobileOverlayWrapper><HistoryPage /></MobileOverlayWrapper>} />
          <Route path="/settings" element={<MobileOverlayWrapper><SettingsPage /></MobileOverlayWrapper>} />
          <Route path="/profile" element={<MobileOverlayWrapper><ProfilePage /></MobileOverlayWrapper>} />
          <Route path="/recipes" element={<Navigate to="/nutrition" replace />} />
        </Routes>
      )}
    </AnimatePresence>
  );
}

function MainAppRoutes() {
  return (
    <>
      <div className="lg:hidden relative h-dvh min-h-dvh flex flex-col overflow-hidden bg-surface dark:bg-[#090b12] transition-colors duration-300" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <StatusBar />
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
          <MobileTabRoutes />
        </div>
        <MobileTabBar />
        <MobileOverlayRoutes />
      </div>
      <div className="hidden lg:contents">
        <AppRoutes />
      </div>
    </>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
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
    </MotionConfig>
  );
}
