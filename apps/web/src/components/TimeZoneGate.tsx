import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { useClerk } from "@clerk/react";
import { api } from "@convex/_generated/api";
import { browserTimeZone } from "@/lib/date";
import { plainError } from "@/lib/log";
import { Button, FullScreen, Polo, Thinking } from "@/components/ui";

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
      <FullScreen>
        <Polo size={56} mood="sleep" />
        <p className="type-empty-title text-ink">Couldn't get Stride ready.</p>
        <p className="max-w-sm type-secondary text-ink2">{state.message}</p>
        <div className="mt-2 flex gap-2">
          <Button onClick={retry}>Try again</Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </FullScreen>
    );

  return (
    <FullScreen>
      <Polo size={48} />
      <Thinking label="Getting your day ready…" />
    </FullScreen>
  );
}
