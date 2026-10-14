import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { useClerk } from "@clerk/react";
import { api } from "@convex/_generated/api";
import { browserTimeZone } from "@/lib/date";
import { plainError } from "@/lib/log";

type ZoneState = { kind: "pending" } | { kind: "ready" } | { kind: "failed"; message: string };

// Sends the browser time zone on load and on window focus. Date queries need it stored first.
function useTimeZoneSync(): { state: ZoneState; retry: () => void } {
  const { isAuthenticated } = useConvexAuth();
  const setTimeZone = useMutation(api.time_zone.setTimeZone);
  const [state, setState] = useState<ZoneState>({ kind: "pending" });

  const sync = useCallback(() => {
    setTimeZone({ timeZone: browserTimeZone() }).then(
      () => setState({ kind: "ready" }),
      (err: unknown) => setState((s) => (s.kind === "ready" ? s : { kind: "failed", message: plainError(err) })),
    );
  }, [setTimeZone]);

  useEffect(() => {
    if (!isAuthenticated) return;
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [isAuthenticated, sync]);

  const retry = useCallback(() => {
    setState({ kind: "pending" });
    sync();
  }, [sync]);

  return { state, retry };
}

// Holds the app behind the time zone sync, so date queries never run before the zone is stored.
export function TimeZoneGate({ children }: { children: ReactNode }) {
  const { state, retry } = useTimeZoneSync();
  const { signOut } = useClerk();

  if (state.kind === "ready") return <>{children}</>;

  if (state.kind === "failed")
    return (
      <CenteredMessage>
        <p className="text-ink">{state.message}</p>
        <div className="flex gap-3">
          <button type="button" onClick={retry} className="rounded-full bg-polo px-4 py-2 text-sm font-semibold text-on-polo">
            Retry
          </button>
          <button type="button" onClick={() => void signOut()} className="rounded-full border border-line2 px-4 py-2 text-sm font-semibold text-ink">
            Sign out
          </button>
        </div>
      </CenteredMessage>
    );

  return <CenteredMessage>Loading…</CenteredMessage>;
}

// Full-height centered block for loading and error states.
function CenteredMessage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-center text-ink2">{children}</div>;
}
