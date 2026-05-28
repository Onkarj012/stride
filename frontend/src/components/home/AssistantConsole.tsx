import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUp, Mic, Camera, MicOff, X, Barcode, ImagePlus, Loader2 } from "lucide-react";
import { useUser } from "@clerk/react";
import { useAction, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { VoxelAgent } from "@/components/voxel/VoxelAgent";
import { SuggestionChip } from "@/components/primitives/SuggestionChip";
import { AgentBadge } from "@/components/insights/AgentBadge";
import { BarcodeModal } from "@/components/coach/BarcodeModal";
import { ConfirmModal } from "@/components/coach/ConfirmModal";
import { useTypewriter } from "@/hooks/useTypewriter";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useDailyWindow, type DailyWindow } from "@/hooks/useDailyWindow";
import { useBehavior } from "@/hooks/useBehavior";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useToast } from "@/context/ToastContext";
import { recordSuggestion } from "@/lib/behavior";
import { cn } from "@/lib/utils";
import type { Agent } from "@/lib/storage";
import type { LogDraft } from "@/data/mock";

const SPRING = { type: "spring", stiffness: 260, damping: 28 } as const;

/* ── Window-aware greeting ── */
function greetingFor(firstName: string, w: DailyWindow): { headline: string; sub: string } {
  switch (w) {
    case "morning":
      return { headline: `Morning, ${firstName}.`, sub: "How are you feeling? What's on for today?" };
    case "day":
      return { headline: `Hi, ${firstName}.`, sub: "Quick log, photo, or question — I'm here." };
    case "evening":
      return { headline: `Evening, ${firstName}.`, sub: "How was today, 1 to 5? Anything I can help close out?" };
    case "night":
      return { headline: `Hey ${firstName}.`, sub: "Heading to bed? Aiming for a steady wind-down." };
  }
}

/* ── Window quick-tap chips ── */
const WINDOW_TAPS: Record<DailyWindow, string[]> = {
  morning: ["Energy is low", "Energy is okay", "Energy is great", "Plan today"],
  day: ["Log a meal", "Suggest lunch", "How am I doing?", "Plan a workout"],
  evening: ["Today was a 1", "Today was a 3", "Today was a 5", "Summarize today"],
  night: ["Going to sleep now", "Stress is high", "Stress is low", "Wind down"],
};

/* ── Map backend coachType → frontend Agent ── */
function coachToAgent(coachType?: string): Agent {
  switch (coachType) {
    case "diet": return "diet";
    case "workout": return "workout";
    case "recovery": return "sleep";
    case "mindset": return "habit";
    default: return "main";
  }
}

/* ── Streaming reply with typewriter ── */
function StreamingReply({ text, agent }: { text: string; agent: Agent }) {
  const { displayed, done } = useTypewriter(text, 18, true);
  return (
    <div className="space-y-2 max-w-[44ch] mx-auto">
      <p className="text-[14.5px] leading-relaxed text-text text-center">
        {displayed}
        {!done && <span className="ml-0.5 inline-block h-3.5 w-0.5 align-middle animate-pulse bg-lavender" />}
      </p>
      {done && agent !== "main" && (
        <div className="flex justify-center">
          <AgentBadge agent={agent} />
        </div>
      )}
    </div>
  );
}

type AssistantConsoleProps = { inputRef?: React.RefObject<HTMLInputElement | null> };

export function AssistantConsole({ inputRef }: AssistantConsoleProps) {
  const [textValue, setTextValue] = useState("");
  const [reply, setReply] = useState<{ text: string; agent: Agent } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // ConfirmModal state — queue of drafts to confirm one by one
  const [pendingDrafts, setPendingDrafts] = useState<any[]>([]);
  const pendingTier2Ref = useRef<string>("");

  const { user } = useUser();
  const { recordEngagement } = useBehavior();
  const window = useDailyWindow();
  const internalRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeRef = inputRef ?? internalRef;
  const toast = useToast();

  // Use the new homepageInput action (intent-classifying, NOT auto-logging)
  const homepageInput = useAction(api.ai.homepageInput);
  const addMeal = useMutation(api.meals.addMeal);
  const addWorkout = useMutation(api.workouts.addWorkout);
  const addWater = useMutation(api.wellness.addWater);
  const upsertSleep = useMutation(api.wellness.upsertSleep);
  const addMood = useMutation(api.wellness.addMood);
  const upsertSteps = useMutation(api.wellness.upsertSteps);
  const recordActivity = useMutation(api.gamification.recordActivity);

  const firstName = user?.firstName ?? user?.username ?? "there";
  const greeting = greetingFor(firstName, window);
  const isLarge = useMediaQuery("(min-width: 1024px)");

  /* ── Voice (Groq Whisper) ── */
  const onTranscript = useCallback((t: string) => {
    setTextValue((prev) => (prev ? `${prev} ${t}` : t).trim());
  }, []);
  const voice = useAudioRecorder(onTranscript);

  /* ── Image input from file picker ── */
  const onPickImage = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Not an image", "Please choose an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAttachedImage(reader.result as string);
    reader.readAsDataURL(file);
  }, [toast]);

  /* ── Cmd+V image paste (page-wide) ── */
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!e.clipboardData) return;
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) onPickImage(file);
          return;
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [onPickImage, activeRef]);

  /* ── Confirm draft → actually log, then show next in queue ── */
  const handleConfirm = useCallback(async (draft: LogDraft) => {
    // Remove the confirmed draft from the queue
    setPendingDrafts((prev) => prev.slice(1));
    const time = new Date().toTimeString().slice(0, 5);
    const date = new Date().toISOString().split("T")[0];
    const tier2 = pendingTier2Ref.current;

    try {
      const d = draft as any;
      if (d.kind === "meal") {
        await addMeal({ name: d.description, calories: d.kcal, protein: d.protein, carbs: d.carbs, fat: d.fat, time, date, aiSuggestion: tier2 || undefined, components: d.items?.join(", ") });
        toast.success(`Logged: ${d.description}`, `${d.kcal} kcal · ${d.protein}g protein`);
        await recordActivity({ type: "meal" }).catch(() => {});
      } else if (d.kind === "workout") {
        await addWorkout({ name: d.description, sets: "1", duration: String(d.duration), intensity: d.intensity.toUpperCase(), date, caloriesBurned: d.kcal, rationale: tier2 || undefined });
        toast.success(`Logged workout: ${d.description}`, `${d.duration} min · ${d.kcal} kcal burned`);
        await recordActivity({ type: "workout" }).catch(() => {});
      } else if (d.kind === "sleep") {
        await upsertSleep({ hours: d.hours, quality: d.quality, date });
        toast.success(`Sleep logged`, `${d.hours.toFixed(1)}h · ${d.quality}`);
      } else if (d.kind === "water") {
        await addWater({ ml: d.ml, date, time });
        toast.success(`Water logged`, `${d.ml >= 1000 ? (d.ml / 1000).toFixed(1) + "L" : d.ml + "ml"}`);
      } else if (d.kind === "mood") {
        await addMood({ rating: d.rating, date, time, note: d.description });
        toast.success(`Mood logged`, `${d.rating}/5`);
      } else if (d.kind === "steps") {
        await upsertSteps({ count: d.count, date });
        toast.success(`Steps logged`, `${d.count.toLocaleString()} steps`);
      }
    } catch (err) {
      toast.error("Couldn't log", err instanceof Error ? err.message : "Try again");
    }
    // Clear tier2 only after last draft
    if (pendingDrafts.length <= 1) pendingTier2Ref.current = "";
  }, [addMeal, addWorkout, addWater, upsertSleep, addMood, upsertSteps, recordActivity, toast, pendingDrafts.length]);

  const handleDiscard = useCallback(() => {
    setPendingDrafts([]);
    pendingTier2Ref.current = "";
    setReply({ text: "No problem — nothing logged. Tell me when you're ready.", agent: "main" });
  }, []);

  /* ── Send to backend (uses homepageInput, not chat) ── */
  const send = useCallback(async (text: string, image?: string) => {
    const v = text.trim();
    if (!v && !image) return;

    setReply(null);
    setThinking(true);
    setTextValue("");
    setAttachedImage(null);
    recordEngagement(window);

    try {
      const result = await homepageInput({
        message: v,
        image,
        today: new Date().toISOString().split("T")[0],
      });

      setThinking(false);

      if (result.isQuestion) {
        const agent = coachToAgent(result.coachType);
        setReply({ text: result.reply ?? "", agent });
      } else if (result.drafts && result.drafts.length > 0) {
        setReply({ text: result.tier1Summary, agent: "main" });
        pendingTier2Ref.current = result.tier2Detail ?? "";
        setPendingDrafts(result.drafts);
      } else {
        setReply({ text: result.reply ?? "Got it.", agent: "main" });
      }
    } catch (err) {
      setThinking(false);
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setReply({ text: `Sorry — ${msg}`, agent: "main" });
      toast.error("Couldn't reach Stry", "Check your connection or try again");
    }
  }, [homepageInput, toast, recordEngagement, window]);

  // Focus shortcut handler (Enter on the form)
  const submit = () => send(textValue, attachedImage ?? undefined);

  const botState: "thinking" | "listening" | "idle" =
    thinking ? "thinking" : voice.recording ? "listening" : "idle";

  return (
    <>
      {/* Hidden file input for camera/gallery */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickImage(file);
          e.target.value = "";
        }}
      />

      <div className="flex flex-col items-center gap-4 w-full">
        {/* Voxel agent */}
        <div className="relative overflow-hidden rounded-full"
          style={{ width: isLarge ? 224 : 160, height: isLarge ? 224 : 160 }}>
          <VoxelAgent agent="main" size={isLarge ? 224 : 160} state={botState} />
          {voice.recording && (
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 inline-flex h-2 w-2 rounded-full bg-peach animate-pulse" />
          )}
          {voice.transcribing && (
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 inline-flex h-2 w-2 rounded-full bg-lavender animate-pulse" />
          )}
        </div>

        {/* Greeting */}
        <div className="text-center space-y-1.5">
          <h1 className="text-display text-text leading-[1.05]">{greeting.headline}</h1>
          <p className="text-[16px] text-text-muted">{greeting.sub}</p>
        </div>

        {/* Reply / thinking slot */}
        <div className="min-h-[44px] flex items-center justify-center w-full max-w-[44ch]">
          <AnimatePresence mode="wait">
            {thinking && (
              <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="h-2 w-2 rounded-full bg-lavender"
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                  />
                ))}
              </motion.div>
            )}
            {!thinking && reply && (
              <motion.div key={reply.text} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={SPRING} className="w-full">
                <StreamingReply text={reply.text} agent={reply.agent} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Image attachment preview */}
        <AnimatePresence>
          {attachedImage && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative">
              <img src={attachedImage} alt="Attached" className="h-20 w-20 rounded-xl object-cover border border-border" />
              <button type="button" onClick={() => setAttachedImage(null)} aria-label="Remove image"
                className="absolute -top-2 -right-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-text-on-ink shadow-[var(--shadow-elev)]">
                <X className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input bar */}
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}
          className={cn(
            "relative flex items-center gap-1.5 rounded-full bg-card border pl-5 pr-1.5 py-1.5 w-full max-w-lg transition-colors",
            voice.recording ? "border-peach" : attachedImage ? "border-lavender" : "border-border-strong focus-within:border-lavender",
          )}
        >
          <input
            ref={activeRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder={
              voice.recording ? "Listening…" :
              voice.transcribing ? "Transcribing…" :
              attachedImage ? "Add a note (optional)…" :
              "Ask Stry, paste an image, or speak…"
            }
            aria-label="Ask Stry"
            disabled={voice.recording || voice.transcribing}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-text placeholder:text-text-subtle focus:outline-none py-1.5 disabled:opacity-50"
          />

          {/* More button (camera + barcode menu) */}
          <div className="relative">
            <button type="button" aria-label="Add"
              onClick={() => setMoreMenuOpen((o) => !o)}
              onBlur={() => setTimeout(() => setMoreMenuOpen(false), 120)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-card-elev transition-colors">
              <Camera className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <AnimatePresence>
              {moreMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full mb-2 right-0 w-44 rounded-2xl bg-card border border-border shadow-[var(--shadow-elev)] py-1 z-20"
                >
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); fileRef.current?.click(); setMoreMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-text hover:bg-card-elev">
                    <ImagePlus className="h-4 w-4" strokeWidth={1.75} />
                    Photo / camera
                  </button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); setBarcodeOpen(true); setMoreMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-text hover:bg-card-elev">
                    <Barcode className="h-4 w-4" strokeWidth={1.75} />
                    Scan barcode
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Voice button */}
          <button type="button" aria-label={voice.recording ? "Stop listening" : "Voice input"}
            onClick={() => voice.recording ? voice.stop() : voice.start()}
            disabled={voice.transcribing}
            className={cn("inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:opacity-50",
              voice.recording ? "bg-peach text-ink" : "text-text-muted hover:bg-card-elev")}>
            {voice.transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> :
              voice.recording ? <MicOff className="h-4 w-4" strokeWidth={1.75} /> :
              <Mic className="h-4 w-4" strokeWidth={1.75} />}
          </button>

          {/* Send */}
          <motion.button type="submit" aria-label="Send"
            disabled={(!textValue.trim() && !attachedImage) || thinking}
            animate={{ scale: (textValue.trim() || attachedImage) ? 1 : 0.9, opacity: (textValue.trim() || attachedImage) ? 1 : 0.5 }}
            transition={SPRING}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-text-on-ink disabled:cursor-not-allowed">
            <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
          </motion.button>
        </form>

        {/* Window-aware tap chips */}
        <div className="flex flex-wrap justify-center gap-2 max-w-xl">
          {WINDOW_TAPS[window].map((s) => (
            <SuggestionChip key={s} label={s} onClick={() => { recordSuggestion(s); send(s); }} />
          ))}
        </div>

        {voice.error && (
          <p className="text-[12px] text-bubblegum">{voice.error}</p>
        )}
      </div>

      {/* Barcode modal */}
      <BarcodeModal open={barcodeOpen} onClose={() => setBarcodeOpen(false)} />
      <ConfirmModal draft={pendingDrafts[0] ?? null} onConfirm={handleConfirm} onDiscard={handleDiscard} />
    </>
  );
}
