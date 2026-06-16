# Plan 003: Live camera scanning in BarcodeModal

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0cdf2da..HEAD -- frontend/src/components/coach/BarcodeModal.tsx frontend/package.json`
> If either file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `0cdf2da`, 2026-06-13

## Why this matters

`BarcodeModal` currently requires users to type a barcode number manually. This defeats the point of the "scan barcode" affordance and adds friction at the exact point the system is trying to reduce it. `@zxing/browser` provides a zero-permission-prompt barcode decoder over a standard `<video>` element — the browser asks once for camera access, then you get a real-time decode loop. This upgrade turns a manual-entry fallback into a genuine point-and-scan experience, consistent with the platform's frictionless-tracking principle.

## Current state

### BarcodeModal — manual entry only

`frontend/src/components/coach/BarcodeModal.tsx` (full file, 130 lines):

```tsx
export function BarcodeModal({ open, onClose }: Props) {
  const [barcode, setBarcode] = useState("");
  // ...
  // 97-120: just a text input + submit button
  // "Enter a barcode number — we'll look it up..."
```

State: `barcode` (string), `loading`, `error`. No camera, no video element, no `@zxing` usage.

### Dependency not installed

```bash
cat frontend/package.json | grep zxing  # returns nothing
```

`@zxing/browser` is not in `frontend/package.json`.

### Backend lookup — unchanged

The mutation `api.foods.lookupBarcode` is called with `{ barcode: string }` and returns a food object or null. This contract does not change — the modal still calls the same mutation once a barcode string is decoded.

### Repo conventions

- Package manager: **bun** (`bun add` not `npm install`).
- Tailwind CSS v4 tokens: `bg-card`, `bg-card-elev`, `border-border`, `text-text`, `text-text-muted`, `rounded-2xl`, `text-lavender`, `bg-lavender/20`.
- Motion: `motion/react` (already in deps) for transitions.
- Component file: a single `.tsx` file, no separate CSS. Keep all camera logic self-contained in the modal.

## Commands you will need

| Purpose   | Command                                      | Expected on success             |
|-----------|----------------------------------------------|---------------------------------|
| Install   | `cd frontend && bun add @zxing/browser`      | `@zxing/browser` in package.json |
| Typecheck | `cd frontend && bun run lint`                | exit 0, no type errors          |
| Dev       | `cd frontend && bun run dev`                 | server starts on :5173           |

## Scope

**In scope**:
- `frontend/src/components/coach/BarcodeModal.tsx`
- `frontend/package.json` (dependency added by `bun add`)
- `frontend/bun.lockb` (updated automatically by `bun add`)

**Out of scope** (do NOT touch):
- `backend/convex/foods.ts` — `lookupBarcode` mutation is unchanged.
- Any caller of `BarcodeModal` (`CoachPage.tsx`, `AssistantConsole.tsx`) — props are unchanged.
- Any other file.

## Git workflow

- Branch: `advisor/003-live-barcode-camera`
- Commits: `chore: add @zxing/browser for live barcode scanning` then `feat: live camera barcode scanning in BarcodeModal`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Install `@zxing/browser`

```bash
cd frontend && bun add @zxing/browser
```

**Verify**: `grep "@zxing/browser" frontend/package.json` → shows the package with a version string.

### Step 2: Replace `BarcodeModal` with camera-first implementation

Rewrite `frontend/src/components/coach/BarcodeModal.tsx`. Keep the same props (`open: boolean`, `onClose: () => void`) and the same backend call (`api.foods.lookupBarcode`). Everything else changes.

Target behavior:
1. When `open` becomes true, start the camera via `BrowserMultiFormatReader` from `@zxing/browser`.
2. Show a `<video>` element with a scan-line animation overlay.
3. When a barcode is decoded, stop the camera, call `lookupBarcode`, and either log the food (same success flow as before) or show an error.
4. Show a "Enter manually" toggle that switches to the original text-input fallback — preserve the old flow for when camera access is denied or unavailable.
5. When `open` becomes false (modal closes), always stop the camera and release the stream.

```tsx
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Camera, Keyboard } from "lucide-react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/browser";
import { useAction, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/utils";

type Props = { open: boolean; onClose: () => void };

export function BarcodeModal({ open, onClose }: Props) {
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [barcode, setBarcode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const toast = useToast();
  const lookup = useAction(api.foods.lookupBarcode);

  // Start/stop camera based on open + mode
  useEffect(() => {
    if (!open || mode !== "camera") {
      stopCamera();
      return;
    }
    startCamera();
    return () => stopCamera();
  }, [open, mode]);

  function stopCamera() {
    if (readerRef.current) {
      BrowserMultiFormatReader.releaseAllStreams();
      readerRef.current = null;
    }
  }

  async function startCamera() {
    if (!videoRef.current) return;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    try {
      await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
        if (result) {
          stopCamera();
          handleBarcode(result.getText());
        }
        if (err && !(err instanceof NotFoundException)) {
          // NotFoundException is normal — means no barcode in current frame
        }
      });
    } catch {
      setMode("manual");
      setError("Camera not available. Enter barcode manually.");
    }
  }

  async function handleBarcode(code: string) {
    setLoading(true);
    setError("");
    try {
      const result = await lookup({ barcode: code });
      if (!result) {
        setError("Product not found in Open Food Facts. Try another barcode or log manually.");
        setLoading(false);
        return;
      }
      const grams = result.servingSize ?? 100;
      const factor = grams / 100;
      toast.success("Logged via barcode", `${result.name} · ${grams}g`);
      onClose();
    } catch {
      setError("Lookup failed. Try again.");
      setLoading(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = barcode.trim();
    if (!code) return;
    await handleBarcode(code);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4 pb-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        className="w-full max-w-sm bg-card rounded-[24px] border border-border shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-[15px] font-bold text-text">Scan barcode</h3>
          <button type="button" onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-card-elev transition-colors">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {mode === "camera" ? (
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              {/* scan line overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3/4 h-0.5 bg-lavender/70 rounded-full animate-pulse" />
              </div>
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <span className="text-white text-[13px] font-semibold">Looking up…</span>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <p className="text-[13px] text-text-muted">
                Enter a barcode number — we'll look it up in Open Food Facts.
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="e.g. 3017620422003"
                className="w-full rounded-xl bg-card-elev border border-border px-3 py-2.5 text-[14px] text-text placeholder:text-text-subtle focus:outline-none focus:border-lavender"
              />
              <button
                type="submit"
                disabled={!barcode || loading}
                className={cn(
                  "w-full rounded-full py-2.5 text-[13px] font-bold transition-colors",
                  (!barcode || loading) ? "opacity-50 bg-lavender/40 text-ink" : "bg-lavender text-ink hover:bg-lavender/90"
                )}
              >
                {loading ? "Looking up…" : "Look up"}
              </button>
            </form>
          )}

          {error && <p className="text-[12px] text-bubblegum">{error}</p>}

          {/* Mode toggle */}
          <button
            type="button"
            onClick={() => { setMode(m => m === "camera" ? "manual" : "camera"); setError(""); }}
            className="flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text transition-colors"
          >
            {mode === "camera"
              ? <><Keyboard className="h-3.5 w-3.5" strokeWidth={2} /> Enter manually</>
              : <><Camera className="h-3.5 w-3.5" strokeWidth={2} /> Use camera</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
```

**Verify**: `cd frontend && bun run lint` → exit 0.

### Step 3: Verify the `handleBarcode` function actually logs the meal

The original `BarcodeModal` called a separate `addMeal` mutation after lookup. Check the current implementation to ensure `handleBarcode` in the rewrite above replicates the complete logging flow (not just the toast). Open the original `BarcodeModal.tsx` and confirm whether it calls `addMeal` or just `toast`.

If the original calls `addMeal`: replicate that call in `handleBarcode` before calling `toast.success` and `onClose()`. The meal data fields come from the `result` object returned by `lookupBarcode`.

**Verify**: `cd frontend && bun run lint` → exit 0.

## Test plan

No automated frontend tests for modal components in this repo. Manual verification:

1. Open the app in Chrome (desktop or mobile emulation).
2. Navigate to any page with a camera button → open BarcodeModal.
3. Confirm the camera view starts and the scan-line animation shows.
4. Allow camera access when prompted.
5. Point at a product barcode — confirm it decodes automatically, calls lookup, and toasts on success.
6. Click "Enter manually" — confirm the text input view appears.
7. Deny camera access in a fresh browser profile — confirm the modal falls back to manual input with the appropriate error message.
8. Close the modal mid-scan — confirm no console errors about active streams.

## Done criteria

- [ ] `@zxing/browser` appears in `frontend/package.json`
- [ ] `cd frontend && bun run lint` exits 0
- [ ] `BarcodeModal.tsx` no longer contains a standalone text input as the primary UI — camera view is default
- [ ] Manual fallback toggle exists and works
- [ ] `BrowserMultiFormatReader.releaseAllStreams()` is called when modal closes (stream cleanup)
- [ ] No files outside the in-scope list are modified (`git diff --name-only`)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report if:
- `bun add @zxing/browser` fails (network, registry, or bun version issue).
- `BrowserMultiFormatReader` is not exported from `@zxing/browser` after install — the API surface may differ across package versions.
- The original `BarcodeModal` calls `addMeal` with additional fields not present in the rewrite above — replicate the full logging flow and report back so the plan can be updated.
- TypeScript errors in the rewritten component that can't be resolved within 2 attempts.

## Maintenance notes

- `BrowserMultiFormatReader.releaseAllStreams()` is a static method — it releases all active streams globally, not just this instance. Safe here because only one BarcodeModal exists at a time.
- The `NotFoundException` import is necessary to suppress "no barcode in frame" errors that fire ~30 times per second during scanning.
- On iOS Safari, camera access in a PWA requires `playsInline` on the `<video>` element (included in the template above). Without it the video won't start.
- If the app moves to Capacitor (Track E in the release plan), swap `@zxing/browser` for a native barcode plugin (`@capacitor-mlkit/barcode-scanning`). The BarcodeModal props contract doesn't need to change.
