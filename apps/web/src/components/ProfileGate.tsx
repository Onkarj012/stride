import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { useClerk } from "@clerk/react";
import { api } from "@convex/_generated/api";
import { Button, FullScreen, Polo, Thinking } from "@/components/ui";

// Holds the app until the profile exists. Onboarding happens in the mobile app, not on the web.
export function ProfileGate({ children }: { children: ReactNode }) {
  const status = useQuery(api.progress_v2.profileStatus);
  const { signOut } = useClerk();

  if (status === undefined)
    return (
      <FullScreen>
        <Polo size={48} />
        <Thinking label="Getting your day ready…" />
      </FullScreen>
    );

  if (!status.complete)
    return (
      <FullScreen>
        <Polo size={64} mood="happy" />
        <p className="type-greeting text-ink">Set up Stride on your phone first.</p>
        <p className="max-w-sm type-callout text-ink2">
          Your goal and targets come from the mobile app. Finish setup there, then come back here.
        </p>
        <Button variant="ghost" className="mt-2" onClick={() => void signOut()}>
          Sign out
        </Button>
      </FullScreen>
    );

  return <>{children}</>;
}
