import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertMock = vi.fn().mockResolvedValue(undefined);
let serverValue: unknown = undefined;

vi.mock("convex/react", () => ({
  useQuery: () => serverValue,
  useMutation: () => upsertMock,
}));

import { usePrefs } from "@/hooks/usePrefs";

describe("usePrefs", () => {
  beforeEach(() => {
    localStorage.clear();
    serverValue = undefined;
    upsertMock.mockClear();
  });

  it("falls back to local defaults when server has not loaded", () => {
    const { result } = renderHook(() => usePrefs());
    expect(result.current.prefs.units).toBe("metric");
    expect(result.current.prefs.coachingStyle).toBe("gentle");
  });

  it("reflects server value once it loads", async () => {
    serverValue = { units: "imperial", notifications: false, coachingStyle: "analytical", reduceMotion: true };
    const { result } = renderHook(() => usePrefs());
    await waitFor(() => expect(result.current.prefs.units).toBe("imperial"));
    expect(result.current.prefs.coachingStyle).toBe("analytical");
    expect(result.current.prefs.reduceMotion).toBe(true);
  });

  it("update writes through to server and localStorage", async () => {
    const { result } = renderHook(() => usePrefs());
    act(() => result.current.update({ coachingStyle: "motivating" }));
    expect(result.current.prefs.coachingStyle).toBe("motivating");
    expect(JSON.parse(localStorage.getItem("stride.prefs.v1")!).coachingStyle).toBe("motivating");
    expect(upsertMock).toHaveBeenCalledWith({ coachingStyle: "motivating" });
  });
});
