import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUp, Mic, FileText, MicOff, X, Barcode, ImagePlus, Loader2, Sparkles, Trash2, Undo2, Pencil, Paperclip, Copy, Check } from "lucide-react";
import { useUser } from "@clerk/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AgentBadge } from "@/components/insights/AgentBadge";
import { Markdown } from "@/components/primitives/Markdown";
import { BarcodeModal } from "@/components/coach/BarcodeModal";
import { LogConfirmCard } from "@/components/coach/LogConfirmCard";
import { EditLogModal, type EditableMeal } from "@/components/coach/EditLogModal";
import { useTypewriter } from "@/hooks/useTypewriter";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useDailyWindow, type DailyWindow } from "@/hooks/useDailyWindow";
import { useBehavior } from "@/hooks/useBehavior";
import { useToast } from "@/context/ToastContext";
import { cn, localDateStr } from "@/lib/utils";
import type { Agent } from "@/lib/storage";

const SPRING = { type: "spring", stiffness: 260, damping: 28 } as const;

type AgentButton = { label: string; value: string; prompt?: string };
type AgentAction =
  | { type: "quick_question"; id: string; title: string; body?: string; options: AgentButton[]; queue?: Array<{ id: string; title: string; body?: string; options: AgentButton[] }> }
  | { type: "log_draft"; title?: string; body?: string; source?: string; draft: any }
  | { type: "macro_conflict"; title?: string; body?: string; draft: any; buttons: AgentButton[] }
  | { type: "button_row"; buttons: AgentButton[] }
  | { type: "coach_note"; tone?: "recovery" | "momentum" | "neutral"; text: string };

function greetingFor(firstName: string, w: DailyWindow): { headline: string; sub: string } {
  switch (w) {
    case "morning": return { headline: `Morning, ${firstName}.`, sub: "What's on for today?" };
    case "day":     return { headline: `Hi, ${firstName}.`, sub: "Log, ask, or just chat." };
    case "evening": return { headline: `Evening, ${firstName}.`, sub: "How was today?" };
    case "night":   return { headline: `Hey ${firstName}.`, sub: "Winding down?" };
  }
}

function coachToAgent(coachType?: string): Agent {
  switch (coachType) {
    case "diet": return "diet";
    case "workout": return "workout";
    case "recovery": return "sleep";
    case "water": return "water";
    case "habit": return "habit";
    case "mindset": return "wellness";
    default: return "main";
  }
}

/* ── Single message bubble with copy/edit/nav ── */
function MessageBubble({
  role, content, fresh, onEdit, onCopy,
}: {
  role: "user" | "ai"; content: string; fresh: boolean;
  onEdit?: () => void; onCopy?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { displayed, done } = useTypewriter(content, 18, fresh);
  const text = fresh ? displayed : content;
  const showMarkdown = !fresh || done;

  const copyText = () => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onCopy?.();
  };

  const ActionBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text transition-colors">
      {children}
    </button>
  );

  if (role === "user") {
    return (
      <div className="flex flex-col items-end gap-1 group">
        <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-card-elev border border-lavender/40 px-3.5 py-2.5 text-[0.95rem] leading-relaxed break-words text-text">
          {showMarkdown
            ? <Markdown className="text-[0.95rem] leading-relaxed">{text}</Markdown>
            : <span className="whitespace-pre-wrap">{text}</span>}
        </div>
        <div className="flex items-center gap-2.5 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionBtn onClick={copyText}>
            {copied ? <Check className="h-3 w-3 text-mint" strokeWidth={2.5} /> : <Copy className="h-3 w-3" strokeWidth={2} />}
            {copied ? "Copied" : "Copy"}
          </ActionBtn>
          {onEdit && (
            <ActionBtn onClick={onEdit}>
              <Pencil className="h-3 w-3" strokeWidth={2} />
              Edit
            </ActionBtn>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1 group">
      <div className="max-w-[86%] rounded-2xl rounded-bl-sm bg-card border border-border px-3.5 py-2.5 text-[0.95rem] leading-relaxed text-text break-words">
        {showMarkdown
          ? <Markdown className="text-[0.95rem] leading-relaxed">{text}</Markdown>
          : <span className="whitespace-pre-wrap">{text}</span>}
      </div>
      <div className="flex items-center gap-2.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <ActionBtn onClick={copyText}>
          {copied ? <Check className="h-3 w-3 text-mint" strokeWidth={2.5} /> : <Copy className="h-3 w-3" strokeWidth={2} />}
          {copied ? "Copied" : "Copy"}
        </ActionBtn>
      </div>
    </div>
  );
}

type AssistantConsoleProps = {
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  queuedPrompt?: string | null;
  onPromptConsumed?: () => void;
  presenceLine?: string;
  initialActions?: AgentAction[];
};

export function AssistantConsole({ inputRef, queuedPrompt, onPromptConsumed, presenceLine, initialActions = [] }: AssistantConsoleProps) {
  const [textValue, setTextValue] = useState("");
  const [thinking, setThinking] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  // Track which message id was the fresh one (so only it animates)
  const [freshTs, setFreshTs] = useState<number | null>(null);
  const [agentHint, setAgentHint] = useState<Agent>("main");
  const [agentActions, setAgentActions] = useState<AgentAction[]>(initialActions);

  // Sync initialActions when getTodayBrief loads (it arrives async after first render)
  const prevInitialRef = useRef<AgentAction[]>(initialActions);
  useEffect(() => {
    if (initialActions !== prevInitialRef.current) {
      prevInitialRef.current = initialActions;
      // Only inject if no actions currently showing (don't interrupt an active conversation)
      setAgentActions((cur) => cur.length === 0 ? initialActions : cur);
    }
  }, [initialActions]);

  // ConfirmModal queue — persisted in sessionStorage so navigation doesn't lose pending cards
  const [pendingDrafts, setPendingDraftsRaw] = useState<any[]>(() => {
    try { return JSON.parse(sessionStorage.getItem("stride_pending_drafts") ?? "[]"); } catch { return []; }
  });
  const setPendingDrafts = useCallback((updater: any[] | ((prev: any[]) => any[])) => {
    setPendingDraftsRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try { sessionStorage.setItem("stride_pending_drafts", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const pendingTier2Ref = useRef<string>("");

  // Auto-applied memory drafts → instant log + undo toast
  type AutoLogged = { mealId: Id<"meals">; draft: any };
  const [autoLoggedMeal, setAutoLoggedMeal] = useState<AutoLogged | null>(null);
  const [editEntry, setEditEntry] = useState<EditableMeal | null>(null);
  const autoLogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { user } = useUser();
  const { recordEngagement } = useBehavior();
  const window = useDailyWindow();
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const activeRef = inputRef ?? internalRef;
  const toast = useToast();

  // Persistent homepage chat: load history from Convex.
  const homepageChat = useQuery(api.chat.getHomepageMessages, { date: localDateStr() });
  const messages = homepageChat?.messages ?? [];
  const initialActionKey = initialActions.map((a) => `${a.type}:${"id" in a ? a.id : ""}`).join("|");

  // Backend actions/mutations
  const homepageInput = useAction(api.ai.homepageInput);
  const clearHomepageMessages = useMutation(api.chat.clearHomepageMessages);
  const addMeal = useMutation(api.meals.addMeal);
  const deleteMeal = useMutation(api.meals.deleteMeal);
  const addWorkout = useMutation(api.workouts.addWorkout);
  const addWater = useMutation(api.wellness.addWater);
  const upsertSleep = useMutation(api.wellness.upsertSleep);
  const addMood = useMutation(api.wellness.addMood);
  const upsertSteps = useMutation(api.wellness.upsertSteps);
  const recordActivity = useMutation(api.gamification.recordActivity);
  const recordBehavior = useMutation(api.behavior.recordBehavior);

  const firstName = user?.firstName ?? user?.username ?? "there";
  const greeting = greetingFor(firstName, window);
  const showHistory = messages.length > 0;

  useEffect(() => {
    if (!queuedPrompt) return;
    setTextValue(queuedPrompt);
    activeRef.current?.focus();
    onPromptConsumed?.();
  }, [queuedPrompt, onPromptConsumed, activeRef]);

  useEffect(() => {
    if (messages.length > 0) return;
    setAgentActions(initialActions);
  }, [initialActionKey, messages.length]);

  // Scroll to bottom — two passes: immediate + 350ms after animation completes
  useEffect(() => {
    const scroll = () => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    };
    scroll(); // immediate (works for messages)
    const t = setTimeout(scroll, 350); // after height:auto animation (works for cards)
    return () => clearTimeout(t);
  }, [messages.length, thinking, pendingDrafts.length, freshTs]);

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

  /* ── Document input (MD / TXT only — PDF not supported in browser) ── */
  const onPickFile = useCallback(async (file: File) => {
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      toast.error("PDF not supported", "Attach a .md or .txt file instead");
      return;
    }
    const allowed = ["text/markdown", "text/plain", "text/x-markdown"];
    const byExt = file.name.endsWith(".md") || file.name.endsWith(".txt");
    if (!allowed.includes(file.type) && !byExt) {
      toast.error("Unsupported file", "Attach a .md or .txt file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setAttachedFile({ name: file.name, content: text.slice(0, 8000) });
    };
    reader.readAsText(file);
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
    setPendingDrafts((prev) => prev.filter((d) => d !== draft));
    const time = new Date().toTimeString().slice(0, 5);
    const today = localDateStr();
    const tier2 = pendingTier2Ref.current;

    try {
      const d = draft as any;
      const date = d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : today;
      const isPastDay = date !== today;
      const dateNote = isPastDay ? ` for ${date}` : "";

      if (d.kind === "meal") {
        await addMeal({
          name: d.description,
          calories: d.kcal,
          protein: d.protein,
          carbs: d.carbs,
          fat: d.fat,
          time,
          date,
          aiSuggestion: tier2 || undefined,
          components: d.items?.join(", "),
          confidence: d.confidence,
          nutritionSource: d.nutritionSource,
          foodMemoryId: d.foodMemoryId,
        });
        void recordBehavior({ kind: "log", key: "meal_confirm" }).catch(() => {});
        toast.success(`Logged${dateNote}: ${d.description}`, `${d.kcal} kcal · ${d.protein}g protein`);
        if (!isPastDay) await recordActivity({ type: "meal" }).catch(() => {});
      } else if (d.kind === "workout") {
        await addWorkout({ name: d.description, sets: d.sets || "1", duration: String(d.duration), intensity: d.intensity.toUpperCase(), date, caloriesBurned: d.kcal, rationale: tier2 || undefined, structuredSets: d.exercises ? JSON.stringify(d.exercises) : undefined });
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
    if (!v && !image && !attachedFile) return;

    // Prepend file content if attached
    const messageText = attachedFile
      ? `[File: ${attachedFile.name}]\n${attachedFile.content}\n\n${v}`.trim()
      : v;

    setThinking(true);
    setTextValue("");
    setAttachedImage(null);
    setAttachedFile(null);
    // Reset textarea height
    if (activeRef.current) activeRef.current.style.height = "auto";
    recordEngagement(window);

    try {
      const result = await homepageInput({
        message: messageText,
        image,
        today: localDateStr(),
      });

      setThinking(false);
      // Mark this moment so only the just-arrived AI message animates
      setFreshTs(Date.now());
      setAgentHint(coachToAgent(result.coachType));
      setAgentActions(Array.isArray(result.actions) ? result.actions : []);

      const hasInlineDraft = Array.isArray(result.actions) && result.actions.some((a: any) => a.type === "log_draft" || a.type === "macro_conflict");
      if (!hasInlineDraft && !result.isQuestion && result.drafts && result.drafts.length > 0) {
        const autoDrafts = result.drafts.filter((d: any) => d.autoApplied && d.kind === "meal");
        const confirmDrafts = result.drafts.filter((d: any) => !d.autoApplied);

        // Instant-log auto-applied memory drafts
        for (const d of autoDrafts) {
          try {
            const time = new Date().toTimeString().slice(0, 5);
            const today = localDateStr();
            const date = d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : today;
            const mealId = await addMeal({
              name: d.description,
              calories: d.kcal,
              protein: d.protein,
              carbs: d.carbs,
              fat: d.fat,
              time,
              date,
              components: d.items?.join(", "),
              confidence: d.confidence,
              nutritionSource: d.nutritionSource,
              foodMemoryId: d.foodMemoryId,
            });
            // Show undo/edit overlay (auto-dismiss after 6 s)
            if (autoLogTimerRef.current) clearTimeout(autoLogTimerRef.current);
            setAutoLoggedMeal({ mealId: mealId as Id<"meals">, draft: d });
            autoLogTimerRef.current = setTimeout(() => setAutoLoggedMeal(null), 6000);
            await recordActivity({ type: "meal" }).catch(() => {});
          } catch (err) {
            toast.error("Couldn't auto-log", err instanceof Error ? err.message : "Try again");
          }
        }

        // Remaining drafts still need confirmation
        if (confirmDrafts.length > 0) {
          pendingTier2Ref.current = result.tier2Detail ?? "";
          setPendingDrafts(confirmDrafts);
        }
      }
    } catch (err) {
      setThinking(false);
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error("Couldn't reach Stry", msg);
    }
  }, [homepageInput, toast, recordEngagement, window, attachedFile]);

  const handleActionButton = useCallback((button: AgentButton, action?: AgentAction) => {
    if (button.value === "skip" || button.value === "done") {
      // Record the question id (not the button value) so getTodayBrief can filter it out today
      const questionId = action && "id" in action ? action.id : button.value;
      void recordBehavior({ kind: "checkin", key: questionId }).catch(() => {});
      setAgentActions((_prev) => {
        const current = action && "queue" in action ? action.queue ?? [] : [];
        const [, ...rest] = current;
        if (rest.length === 0) return [];
        const next = rest[0];
        return [{ type: "quick_question", ...next, queue: rest }];
      });
      return;
    }
    if (button.value === "confirm_log" && pendingDrafts[0]) {
      void handleConfirm(pendingDrafts[0]);
      return;
    }
    if (button.value === "discard_log") {
      handleDiscard();
      setAgentActions([]);
      return;
    }
    if (button.prompt) {
      void recordBehavior({ kind: "checkin", key: action && "id" in action ? action.id : "action", value: button.value }).catch(() => {});
      setAgentActions([]);
      void send(button.prompt);
      return;
    }
    void recordBehavior({ kind: "checkin", key: action && "id" in action ? action.id : "action", value: button.value }).catch(() => {});
    setAgentActions((prev) => {
      const current = action && "queue" in action ? action.queue ?? [] : [];
      const [, ...rest] = current;
      if (rest.length === 0) return prev.filter((a) => a !== action);
      const next = rest[0];
      return [{ type: "quick_question", ...next, queue: rest }];
    });
  }, [handleConfirm, handleDiscard, pendingDrafts, recordBehavior, send]);

  const openDraft = useCallback((draft: any) => {
    pendingTier2Ref.current = "";
    setPendingDrafts([draft]);
  }, []);

  const useEngineEstimate = useCallback((draft: any) => {
    if (!draft?.engineEstimate) return openDraft(draft);
    openDraft({
      ...draft,
      kcal: draft.engineEstimate.kcal,
      protein: draft.engineEstimate.protein,
      carbs: draft.engineEstimate.carbs,
      fat: draft.engineEstimate.fat,
      nutritionSource: "engine",
    });
  }, [openDraft]);

  // Identify the most recent AI message for typewriter animation
  const lastAiTs = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "ai") return messages[i].ts;
    }
    return null;
  }, [messages]);

  const submit = () => send(textValue, attachedImage ?? undefined);

  const Composer = (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}
      className={cn(
        "relative flex items-end gap-1.5 rounded-[20px] bg-card border px-4 py-1.5 w-full transition-colors",
        voice.recording ? "border-peach" : attachedFile ? "border-lavender" : attachedImage ? "border-lavender" : "border-border-strong focus-within:border-lavender",
      )}
    >
      <textarea
        ref={activeRef as React.RefObject<HTMLTextAreaElement>}
        value={textValue}
        onChange={(e) => {
          setTextValue(e.target.value);
          // Auto-grow: reset height then set to scrollHeight, capped at ~5 lines (120px)
          e.target.style.height = "auto";
          e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
        }}
        placeholder={
          voice.recording ? "Listening…" :
          voice.transcribing ? "Transcribing…" :
          attachedImage ? "Add a note (optional)…" :
          showHistory ? "Reply, log, or ask…" :
          "Ask Stry, paste an image, or speak…"
        }
        aria-label="Ask Stry"
        disabled={voice.recording || voice.transcribing}
        rows={1}
        style={{ resize: "none", height: "auto", maxHeight: 120, overflowY: "auto" }}
        className="min-w-0 flex-1 bg-transparent text-[1.1rem] text-text placeholder:text-text-subtle focus:outline-none py-2 disabled:opacity-50 leading-snug"
      />

      <div className="relative">
        <button type="button" aria-label="Add"
          onClick={() => setMoreMenuOpen((o) => !o)}
          onBlur={() => setTimeout(() => setMoreMenuOpen(false), 120)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-card-elev transition-colors">
          <FileText className="h-4 w-4" strokeWidth={1.75} />
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
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[0.95rem] font-medium text-text hover:bg-card-elev">
                <ImagePlus className="h-4 w-4" strokeWidth={1.75} />
                Photo / camera
              </button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); setBarcodeOpen(true); setMoreMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[0.95rem] font-medium text-text hover:bg-card-elev">
                <Barcode className="h-4 w-4" strokeWidth={1.75} />
                Scan barcode
              </button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); docRef.current?.click(); setMoreMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[0.95rem] font-medium text-text hover:bg-card-elev">
                <Paperclip className="h-4 w-4" strokeWidth={1.75} />
                Attach MD / TXT
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button type="button" aria-label={voice.recording ? "Stop listening" : "Voice input"}
        onClick={() => voice.recording ? voice.stop() : voice.start()}
        disabled={voice.transcribing}
        className={cn("inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:opacity-50",
          voice.recording ? "bg-peach text-ink" : "text-text-muted hover:bg-card-elev")}>
        {voice.transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> :
          voice.recording ? <MicOff className="h-4 w-4" strokeWidth={1.75} /> :
          <Mic className="h-4 w-4" strokeWidth={1.75} />}
      </button>

      <motion.button type="submit" aria-label="Send"
        disabled={(!textValue.trim() && !attachedImage && !attachedFile) || thinking}
        animate={{ scale: (textValue.trim() || attachedImage || attachedFile) ? 1 : 0.9, opacity: (textValue.trim() || attachedImage || attachedFile) ? 1 : 0.5 }}
        transition={SPRING}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-text-on-ink disabled:cursor-not-allowed">
        {thinking ? <Sparkles className="h-4 w-4 animate-pulse" /> : <ArrowUp className="h-4 w-4" strokeWidth={2.25} />}
      </motion.button>
    </form>
  );

  // Inline action button — themed to design system
  const Btn = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}
      className="inline-flex items-center rounded-full bg-lavender/15 hover:bg-lavender/25 border border-lavender/20 px-3 py-1.5 text-[0.95rem] font-semibold text-text transition-colors">
      {label}
    </button>
  );

  function AgentActionCard({ action }: { action: AgentAction }) {
    if (action.type === "button_row") {
      return (
        <div className="flex flex-wrap gap-2">
          {action.buttons.map((b) => <Btn key={b.value} label={b.label} onClick={() => handleActionButton(b, action)} />)}
        </div>
      );
    }
    if (action.type === "coach_note") {
      const toneStyle = action.tone === "recovery"
        ? "border-l-sky bg-sky/8"
        : action.tone === "momentum"
        ? "border-l-mint bg-mint/8"
        : "border-l-lavender bg-lavender/8";
      return (
        <div className={`rounded-2xl border border-border border-l-4 px-3.5 py-3 text-[13.5px] leading-relaxed text-text ${toneStyle}`}>
          {action.text}
        </div>
      );
    }
    if (action.type === "log_draft") {
      return (
        <div className="rounded-2xl border border-mint/25 bg-mint/8 px-3.5 py-3 space-y-2.5">
          <p className="text-[0.95rem] font-semibold text-text">{action.title ?? action.draft?.description ?? "Review this log"}</p>
          {action.draft?.kind === "meal" && (
            <div className="flex gap-3 text-[12px] font-bold">
              <span className="text-peach">{action.draft.kcal} kcal</span>
              <span className="text-lavender">{action.draft.protein}g P</span>
              <span className="text-sky">{action.draft.carbs}g C</span>
              <span className="text-mint">{action.draft.fat}g F</span>
            </div>
          )}
          {action.body && <p className="text-[12px] text-text-muted">{action.body}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { openDraft(action.draft); setAgentActions([]); }}
              className="inline-flex items-center rounded-full bg-mint/20 hover:bg-mint/30 border border-mint/25 px-3 py-1.5 text-[0.95rem] font-semibold text-text transition-colors">
              Confirm
            </button>
            <button type="button" onClick={() => setAgentActions([])}
              className="inline-flex items-center rounded-full bg-card-elev hover:bg-border border border-border px-3 py-1.5 text-[0.95rem] font-medium text-text-muted transition-colors">
              Discard
            </button>
          </div>
        </div>
      );
    }
    if (action.type === "macro_conflict") {
      return (
        <div className="rounded-2xl border border-peach/25 bg-peach/8 border-l-4 border-l-peach px-3.5 py-3 space-y-2.5">
          <p className="text-[0.95rem] font-semibold text-text">{action.title ?? "Macro check"}</p>
          {action.body && <p className="text-[12px] text-text-muted">{action.body}</p>}
          <div className="flex flex-wrap gap-2">
            <Btn label="Use my numbers" onClick={() => { openDraft(action.draft); setAgentActions([]); }} />
            <Btn label="Use estimate" onClick={() => { useEngineEstimate(action.draft); setAgentActions([]); }} />
          </div>
        </div>
      );
    }
    // quick_question — lavender tinted
    return (
      <div className="rounded-2xl border border-lavender/20 bg-lavender/8 px-3.5 py-3 space-y-2.5">
        <p className="text-[13.5px] font-semibold text-text">{action.title}</p>
        {action.body && <p className="text-[12px] text-text-muted">{action.body}</p>}
        <div className="flex flex-wrap gap-2">
          {action.options.map((b) => <Btn key={b.value} label={b.label} onClick={() => handleActionButton(b, action)} />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); e.target.value = ""; }} />
      <input ref={docRef} type="file" accept=".md,.txt,text/markdown,text/plain" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = ""; }} />

      {/* Full-height flex column — no card wrapper, page provides the container */}
      <div className="flex flex-col h-full min-h-0">

        {/* Slim top bar — greeting or Stry name */}
        <div className={cn(
          "shrink-0 flex items-center justify-between px-4 lg:px-6",
          showHistory ? "h-12 border-b border-border" : "pt-6 pb-3",
        )}>
          {!showHistory ? (
            <div>
              <h1 className="text-[20px] font-extrabold tracking-tight text-text">{greeting.headline}</h1>
              <p className="text-[0.95rem] text-text-muted">{presenceLine ?? greeting.sub}</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <AgentBadge agent={agentHint} />
              {(voice.recording || voice.transcribing) && (
                <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse shrink-0",
                  voice.recording ? "bg-peach" : "bg-lavender")} />
              )}
              {thinking
                ? <span className="text-[12px] text-text-muted truncate">Thinking…</span>
                : presenceLine
                ? <span className="text-[12px] text-text-muted truncate">{presenceLine}</span>
                : null}
            </div>
          )}
          {showHistory && (
            <button type="button" onClick={() => clearHomepageMessages().catch(() => {})}
              aria-label="Clear chat"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-card-elev transition-colors">
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>

        {/* Message area — scrollable, fills all remaining height */}
        <div ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 lg:px-6 py-4 flex flex-col gap-3"
          aria-live="polite" aria-label="Chat with Stry">

          {/* Messages top→bottom, newest at bottom */}
          {messages.map((m) => (
            <MessageBubble
              key={m.ts}
              role={m.role === "user" ? "user" : "ai"}
              content={m.content}
              fresh={freshTs !== null && m.ts === lastAiTs}
              onEdit={m.role === "user" ? () => {
                setTextValue(m.content);
                setTimeout(() => activeRef.current?.focus(), 50);
              } : undefined}
            />
          ))}

          {/* Thinking dots */}
          {thinking && (
            <div className="flex items-center gap-1.5 px-1 py-1">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="h-2 w-2 rounded-full bg-text-muted/40"
                  animate={{ scale: [1, 1.4, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }} />
              ))}
            </div>
          )}

          {/* Inline action cards — animated in/out */}
          <AnimatePresence>
            {agentActions.map((action, i) => (
              <motion.div key={`${action.type}-${i}`}
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }} className="overflow-hidden flex justify-start">
                <div className="max-w-[88%] lg:max-w-[70%] w-full">
                  <AgentActionCard action={action} />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Inline confirm cards — animated in/out, no blank space on dismiss */}
          <AnimatePresence>
            {pendingDrafts.map((draft, i) => (
              <motion.div key={`draft-${i}`}
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }} className="overflow-hidden flex justify-start">
                <div className="w-full max-w-[88%] lg:max-w-[420px]">
                  <LogConfirmCard
                    draft={draft}
                    onConfirm={handleConfirm}
                    onDiscard={() => setPendingDrafts((prev) => prev.filter((d) => d !== draft))}
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Sentinel — always at the very bottom so scrollIntoView reaches past cards */}
          <div ref={bottomSentinelRef} className="shrink-0 h-1" />
        </div>

        {/* Attachment previews */}
        <AnimatePresence>
          {(attachedImage || attachedFile) && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="shrink-0 px-4 lg:px-6 pb-2 flex items-center gap-2">
              {attachedImage && (
                <div className="relative inline-block">
                  <img src={attachedImage} alt="Attached" className="h-14 w-14 rounded-xl object-cover border border-border" />
                  <button type="button" onClick={() => setAttachedImage(null)} aria-label="Remove image"
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full bg-ink text-text-on-ink">
                    <X className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                </div>
              )}
              {attachedFile && (
                <div className="relative inline-flex items-center gap-2 rounded-xl border border-lavender/30 bg-lavender/10 px-3 py-2">
                  <Paperclip className="h-3.5 w-3.5 text-lavender shrink-0" strokeWidth={2} />
                  <span className="text-[12px] font-medium text-text max-w-[140px] truncate">{attachedFile.name}</span>
                  <button type="button" onClick={() => setAttachedFile(null)} aria-label="Remove file"
                    className="h-4 w-4 flex items-center justify-center rounded-full bg-ink/10 hover:bg-ink/20 text-text-muted">
                    <X className="h-2.5 w-2.5" strokeWidth={2.5} />
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input — always at the bottom */}
        <div className="shrink-0 px-4 lg:px-6 pb-[calc(env(safe-area-inset-bottom)+5rem)] lg:pb-4 pt-2 bg-bg border-t border-border">
          {Composer}
          {voice.error && <p className="text-[11px] text-bubblegum mt-1.5">{voice.error}</p>}
        </div>
      </div>

      <BarcodeModal open={barcodeOpen} onClose={() => setBarcodeOpen(false)} />

      {/* Memory auto-log undo toast */}
      <AnimatePresence>
        {autoLoggedMeal && (
          <motion.div key="memory-toast"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] lg:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl bg-ink text-text-on-ink px-4 py-3 shadow-[var(--shadow-elev)] max-w-[calc(100vw-2rem)]">
            <span className="text-[0.95rem] font-medium truncate max-w-[180px]">
              {autoLoggedMeal.draft.memoryNote ?? `Logged ${autoLoggedMeal.draft.name}`}
            </span>
            <span className="text-[12px] text-text-on-ink/60">{autoLoggedMeal.draft.kcal} kcal</span>
            <div className="flex gap-1 ml-1">
              <button type="button" onClick={async () => {
                if (autoLogTimerRef.current) clearTimeout(autoLogTimerRef.current);
                setAutoLoggedMeal(null);
                try { await deleteMeal({ id: autoLoggedMeal.mealId }); toast.info("Undone", autoLoggedMeal.draft.name); }
                catch { toast.error("Couldn't undo", "Meal may already be logged"); }
              }} className="inline-flex items-center gap-1 rounded-full bg-text-on-ink/15 hover:bg-text-on-ink/25 px-2.5 py-1.5 text-[12px] font-semibold">
                <Undo2 className="h-3 w-3" strokeWidth={2.25} /> Undo
              </button>
              <button type="button" onClick={() => {
                const d = autoLoggedMeal.draft;
                setEditEntry({ _id: autoLoggedMeal.mealId, name: d.name, calories: d.kcal, protein: d.protein, carbs: d.carbs, fat: d.fat, time: d.time, mealType: d.mealType ?? "unspecified" });
                void recordBehavior({ kind: "log", key: "meal_correct" }).catch(() => {});
                if (autoLogTimerRef.current) clearTimeout(autoLogTimerRef.current);
                setAutoLoggedMeal(null);
              }} className="inline-flex items-center gap-1 rounded-full bg-text-on-ink/15 hover:bg-text-on-ink/25 px-2.5 py-1.5 text-[12px] font-semibold">
                <Pencil className="h-3 w-3" strokeWidth={2.25} /> Edit
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <EditLogModal kind="meal" entry={editEntry} onClose={() => setEditEntry(null)} />
    </>
  );
}



