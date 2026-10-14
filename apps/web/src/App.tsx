import { Navigate, Route, Routes } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { AuthenticateWithRedirectCallback, ClerkLoaded, ClerkLoading, Show } from "@clerk/react";
import { Layout } from "@/components/Layout";
import { ProfileGate } from "@/components/ProfileGate";
import { TimeZoneGate } from "@/components/TimeZoneGate";
import { ToastProvider } from "@/components/Toast";
import { FullScreen, Polo } from "@/components/ui";
import { DayPage } from "@/pages/DayPage";
import { ProgressPage } from "@/pages/ProgressPage";
import { SignInPage, SignUpPage } from "@/pages/AuthPages";

// Signed-out auth routes, or the signed-in app behind its time zone and profile gates.
export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ClerkLoading>
        <FullScreen>
          <Polo size={48} />
        </FullScreen>
      </ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-out">
          <Routes>
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/sign-up" element={<SignUpPage />} />
            <Route path="/sso-callback" element={<AuthenticateWithRedirectCallback />} />
            <Route path="*" element={<Navigate to="/sign-in" replace />} />
          </Routes>
        </Show>
        <Show when="signed-in">
          <TimeZoneGate>
            <ProfileGate>
              <ToastProvider>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Navigate to="/day" replace />} />
                    <Route path="/day" element={<DayPage />} />
                    <Route path="/day/:date" element={<DayPage />} />
                    <Route path="/progress" element={<ProgressPage />} />
                    <Route path="*" element={<Navigate to="/day" replace />} />
                  </Routes>
                </Layout>
              </ToastProvider>
            </ProfileGate>
          </TimeZoneGate>
        </Show>
      </ClerkLoaded>
    </MotionConfig>
  );
}
