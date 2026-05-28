import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUp, Mic, Camera, MicOff, X, Barcode, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { useUser } from "@clerk/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { VoxelAgent } from "@/components/voxel/VoxelAgent";
import { SuggestionChip } from "@/components/primitives/SuggestionChip";
import { AgentBadge } from "@/components/insights/AgentBadge";
import { Markdown } from "@/components/primitives/Markdown";
import { BarcodeModal } from "@/components/coach/BarcodeModal";
import { ConfirmModal } from "@/components/coach/ConfirmModal";
import { useTypewriter } from "@/hooks/useTypewriter";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useDailyWindow, type DailyWindow } from "@/hooks/useDailyWindow";
import { useBehavior } from "@/hooks/useBehavior";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useToast } from "@/context/ToastContext";
import { recordSuggestion } from "@/lib/behavior";
import { cn, localDateStr } from "@/lib/utils";
import type { Agent } from "@/lib/storage";

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

/* ── Single message bubble inside the history panel ── */
function MessageBubble({
  role,
  content,
  fresh,
}: {
  role: "user" | "ai";
  content: string;
  fresh: boolean; // true → animate with typewriter (only for the last fresh AI reply)
}) {
  const { displayed, done } = useTypewriter(content, 18, fresh);
  const text = fresh ? displayed : content;

  // For tier-1 + tier-2 stored as "tier1\n\ntier2", show only the first paragraph
  // on the homepage to keep responses short. Full text remains in chat history.
  const visibleText = role === "ai" ? text.split(/\n\n/, 1)[0] : text;
  const hasMore = role === "ai" && text.includes("\n\n");

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-[6px] bg-ink text-text-on-ink px-3 py-2 text-[13.5px] leading-snug whitespace-pre-wrap break-words">
          {visibleText}
        </div>
      </div>
    );
  }

  // AI bubble: render plain text while typewriter is animating, switch to
  // markdown once done so formatting (lists, bold, code) shows correctly.
  const showMarkdown = !fresh || done;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-[6px] bg-card-elev border border-border px-3 py-2 text-[13.5px] leading-snug text-text break-words">
        {showMarkdown ? (
          <>
            <Markdown className="text-[13.5px] leading-snug">{visibleText}</Markdown>
            {hasMore && <span className="ml-1 text-[11px] text-text-muted">…</span>}
          </>
        ) : (
          <span className="whitespace-pre-wrap">
            {visibleText}
            {hasMore && <span className="ml-1 text-[11px] text-text-muted">…</span>}
          </span>
        )}
      </div>
    </div>
  );
}

type AssistantConsoleProps = { inputRef?: React.RefObject<HTMLInputElement | null> };

export function AssistantConsole({ inputRef }: AssistantConsoleProps) {
  const [textValue, setTextValue] = useState("");
  const [thinking, setThinking] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  // Track which message id was the fresh one (so only it animates)
  const [freshTs, setFreshTs] = useState<number | null>(null);
  const [agentHint, setAgentHint] = useState<Agent>("main");

  // ConfirmModal queue
  const [pendingDrafts, setPendingDrafts] = useState<any[]>([]);
  const pendingTier2Ref = useRef<string>("");

  const { user } = useUser();
  const { recordEngagement } = useBehavior();
  const window = useDailyWindow();
  const internalRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = inputRef ?? internalRef;
  const toast = useToast();

  // Persistent homepage chat: load history from Convex.
  const homepageChat = useQuery(api.chat.getHomepageMessages, {});
  const messages = homepageChat?.messages ?? [];

  // Backend actions/mutations
  const homepageInput = useAction(api.ai.homepageInput);
  const clearHomepageMessages = useMutation(api.chat.clearHomepageMessages);
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

  // Scroll history to bottom on new message
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, thinking]);

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
  }, [onPickImage]);

  /* ── Confirm draft → actually log ── */
  const handleConfirm = useCallback(async (draft: any) => {
    setPendingDrafts((prev) => prev.slice(1));
    const time = new Date().toTimeString().slice(0, 5);
    const today = localDateStr();
    const tier2 = pendingTier2Ref.current;

    try {
      const d = draft as any;
      const date = d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : today;
      const isPastDay = date !== today;
      const dateNote = isPastDay ? ` for ${date}` : "";

      if (d.kind === "meal") {
        await addMeal({ name: d.description, calories: d.kcal, protein: d.protein, carbs: d.carbs, fat: d.fat, time, date, aiSuggestion: tier2 || undefined, components: d.items?.join(", ") });
        toast.success(`Logged${dateNote}: ${d.description}`, `${d.kcal} kcal · ${d.protein}g protein`);
        if (!isPastDay) await recordActivity({ type: "meal" }).catch(() => {});
      } else if (d.kind === "workout") {
        await addWorkout({ name: d.description, sets: "1", duration: String(d.duration), intensity: d.intensity.toUpperCase(), date, caloriesBurned: d.kcal, rationale: tier2 || undefined });
        toast.success(`Logged workout${dateNote}: ${d.description}`, `${d.duration} min · ${d.kcal} kcal burned`);
        if (!isPastDay) await recordActivity({ type: "workout" }).catch(() => {});
      } else if (d.kind === "sleep") {
        await upsertSleep({ hours: d.hours, quality: d.quality, date });
        toast.success(`Sleep logged${dateNote}`, `${d.hours.toFixed(1)}h · ${d.quality}`);
      } else if (d.kind === "water") {
        await addWater({ ml: d.ml, date, time });
        toast.success(`Water logged${dateNote}`, `${d.ml >= 1000 ? (d.ml / 1000).toFixed(1) + "L" : d.ml + "ml"}`);
      } else if (d.kind === "mood") {
        await addMood({ rating: d.rating, date, time, note: d.description });
        toast.success(`Mood logged${dateNote}`, `${d.rating}/5`);
      } else if (d.kind === "steps") {
        await upsertSteps({ count: d.count, date });
        toast.success(`Steps logged${dateNote}`, `${d.count.toLocaleString()} steps`);
      }
    } catch (err) {
      toast.error("Couldn't log", err instanceof Error ? err.message : "Try again");
    }
    if (pendingDrafts.length <= 1) pendingTier2Ref.current = "";
  }, [addMeal, addWorkout, addWater, upsertSleep, addMood, upsertSteps, recordActivity, toast, pendingDrafts.length]);

  const handleDiscard = useCallback(() => {
    setPendingDrafts([]);
    pendingTier2Ref.current = "";
  }, []);

  /* ── Send to backend ── */
  const send = useCallback(async (text: string, image?: string) => {
    const v = text.trim();
    if (!v && !image) return;

    setThinking(true);
    setTextValue("");
    setAttachedImage(null);
    recordEngagement(window);

    try {
      const result = await homepageInput({
        message: v,
        image,
        today: localDateStr(),
      });

      setThinking(false);
      // Mark this moment so only the just-arrived AI message animates
      setFreshTs(Date.now());
      setAgentHint(coachToAgent(result.coachType));

      if (!result.isQuestion && result.drafts && result.drafts.length > 0) {
        pendingTier2Ref.current = result.tier2Detail ?? "";
        setPendingDrafts(result.drafts);
      }
    } catch (err) {
      setThinking(false);
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error("Couldn't reach Stry", msg);
    }
  }, [homepageInput, toast, recordEngagement, window]);

  const submit = () => send(textValue, attachedImage ?? undefined);

  const botState: "thinking" | "listening" | "idle" =
    thinking ? "thinking" : voice.recording ? "listening" : "idle";

  // Voxel sizing: tightened so the response area gets more room.
  // The container is rounded-full with overflow-hidden, so any extra
  // canvas padding shows as visual whitespace. Smaller container =
  // tighter visual padding around the elephant.
  const voxelSize = isLarge ? 176 : 132;

  // Identify the most recent AI message for typewriter animation
  const lastAiTs = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "ai") return messages[i].ts;
    }
    return null;
  }, [messages]);

  const showHistory = messages.length > 0;

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

      <div className="flex flex-col items-center gap-3 w-full">
        {/* Voxel agent — smaller container so it occupies less vertical space */}
        <div
          className="relative overflow-hidden rounded-full"
          style={{ width: voxelSize, height: voxelSize }}
        >
          <VoxelAgent agent={agentHint} size={voxelSize} state={botState} />
          {voice.recording && (
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 inline-flex h-2 w-2 rounded-full bg-peach animate-pulse" />
          )}
          {voice.transcribing && (
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 inline-flex h-2 w-2 rounded-full bg-lavender animate-pulse" />
          )}
        </div>

        {/* Greeting — ALWAYS visible, never replaced by replies */}
        <div className="text-center space-y-1">
          <h1 className="text-[26px] sm:text-[30px] font-extrabold tracking-tight text-text leading-[1.05]">
            {greeting.headline}
          </h1>
          <p className="text-[14px] text-text-muted">{greeting.sub}</p>
        </div>

        {/* Persistent chat panel — fixed max height, scrollable.
            Replies live here so they never push the input down. */}
        {(showHistory || thinking) && (
          <div
            ref={scrollRef}
            className="w-full max-w-lg max-h-[180px] overflow-y-auto rounded-2xl bg-bg/40 border border-border px-3 py-2 space-y-2 scroll-smooth"
            aria-live="polite"
            aria-label="Chat with Stry"
          >
            {messages.map((m) => (
              <MessageBubble
                key={m.ts}
                role={m.role === "user" ? "user" : "ai"}
                content={m.content}
                fresh={freshTs !== null && m.ts === lastAiTs}
              />
            ))}
            {thinking && (
              <div className="flex items-center gap-1.5 px-2 py-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-lavender"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                  />
                ))}
                <span className="text-[12px] text-text-muted">Stry is thinking…</span>
              </div>
            )}
          </div>
        )}

        {/* Bottom row above input: agent badge + clear-chat link (only when history) */}
        {showHistory && !thinking && (
          <div className="w-full max-w-lg flex items-center justify-between text-[11px] text-text-muted">
            <AgentBadge agent={agentHint} />
            <button
              type="button"
              onClick={() => clearHomepageMessages().catch(() => {})}
              className="hover:text-text transition-colors"
            >
              Clear chat
            </button>
          </div>
        )}

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

        {/* Input bar — anchored, never pushed down */}
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
              showHistory ? "Reply or log something else…" :
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
            {thinking ? <Sparkles className="h-4 w-4 animate-pulse" /> : <ArrowUp className="h-4 w-4" strokeWidth={2.25} />}
          </motion.button>
        </form>

        {/* Window-aware tap chips — collapse when there's chat history to free up space */}
        {!showHistory && (
          <div className="flex flex-wrap justify-center gap-2 max-w-xl">
            {WINDOW_TAPS[window].map((s) => (
              <SuggestionChip key={s} label={s} onClick={() => { recordSuggestion(s); send(s); }} />
            ))}
          </div>
        )}

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
