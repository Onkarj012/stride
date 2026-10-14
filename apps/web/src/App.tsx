import { Navigate, Route, Routes } from "react-router-dom";
import { AuthenticateWithRedirectCallback, ClerkLoaded, ClerkLoading, Show } from "@clerk/react";
import { Layout } from "@/components/Layout";
import { ProfileGate } from "@/components/ProfileGate";
import { TimeZoneGate } from "@/components/TimeZoneGate";
import { DayPage } from "@/pages/DayPage";
import { ProgressPage } from "@/pages/ProgressPage";
import { SignInPage, SignUpPage } from "@/pages/AuthPages";

export default function App() {
  return (
    <>
      <ClerkLoading>
        <div className="flex min-h-dvh items-center justify-center bg-bg text-ink2">Loading…</div>
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
              <Layout>
                <Routes>
                  <Route path="/" element={<Navigate to="/day" replace />} />
                  <Route path="/day" element={<DayPage />} />
                  <Route path="/day/:date" element={<DayPage />} />
                  <Route path="/progress" element={<ProgressPage />} />
                  <Route path="*" element={<Navigate to="/day" replace />} />
                </Routes>
              </Layout>
            </ProfileGate>
          </TimeZoneGate>
        </Show>
      </ClerkLoaded>
    </>
  );
}
