import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { useClerk } from "@clerk/react";
import { api } from "@convex/_generated/api";

// Holds the app until the profile exists. Onboarding happens in the mobile app, not on the web.
export function ProfileGate({ children }: { children: ReactNode }) {
  const status = useQuery(api.progress_v2.profileStatus);
  const { signOut } = useClerk();

  if (status === undefined) return <div className="flex min-h-dvh items-center justify-center bg-bg text-ink2">Loading…</div>;

  if (!status.complete)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-center text-ink2">
        <p className="text-ink">Finish setting up Stride in the mobile app first.</p>
        <button type="button" onClick={() => void signOut()} className="rounded-full border border-line2 px-4 py-2 text-sm font-semibold text-ink">
          Sign out
        </button>
      </div>
    );

  return <>{children}</>;
}
