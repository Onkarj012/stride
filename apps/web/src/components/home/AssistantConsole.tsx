import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Barcode, ImagePlus, Paperclip } from "lucide-react";
import { useUser } from "@clerk/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { BarcodeModal } from "@/components/coach/BarcodeModal";
import { LogConfirmCard } from "@/components/coach/LogConfirmCard";
import { EditLogModal, type EditableMeal } from "@/components/coach/EditLogModal";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ThinkingBubble } from "@/components/ui-kit/ChatMessage";
import { InputBar } from "@/components/ui-kit";
import type { AttachItem, InputMode, Modality } from "@/components/ui-kit";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useDailyWindow, type DailyWindow } from "@/hooks/useDailyWindow";
import { useBehavior } from "@/hooks/useBehavior";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useToast } from "@/context/ToastContext";
import { localDateStr } from "@/lib/utils";
import { FADE_FAST } from "@/lib/motion";

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

type AssistantConsoleProps = {
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  queuedPrompt?: string | null;
  onPromptConsumed?: () => void;
  presenceLine?: string;
  initialActions?: AgentAction[];
};

type HomepageMessage = {
  role: string;
  content: string;
  ts: number;
};

function modalityForContent(content: string): { modality?: Modality; chip?: string } {
  const fileMatch = content.match(/^\[File: ([^\]]+)\]/);
  if (fileMatch) return { modality: "ocr", chip: fileMatch[1] };
  if (content === "[image]" || content === "Photo of meal") return { modality: "photo", chip: "Attached image" };
  return {};
}

export function AssistantConsole({ inputRef, queuedPrompt, onPromptConsumed, presenceLine, initialActions = [] }: AssistantConsoleProps) {
  const [textValue, setTextValue] = useState("");
  const [thinking, setThinking] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [kbPad, setKbPad] = useState(0);
  // Track which message id was the fresh one (so only it animates)
  const [freshTs, setFreshTs] = useState<number | null>(null);
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

  // Auto-applied memory drafts — removed (all drafts now go through confirm card)
  const [editEntry, setEditEntry] = useState<EditableMeal | null>(null);

  const { user } = useUser();
  const { recordEngagement } = useBehavior();
  const reduceMotion = useReducedMotion();
  const dailyWindow = useDailyWindow();
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const activeRef = inputRef ?? internalRef;
  const toast = useToast();

  // Persistent homepage chat: load history from Convex.
  const homepageChat = useQuery(api.chat.getHomepageMessages, { date: localDateStr() });
  const messages = (homepageChat?.messages ?? []) as HomepageMessage[];
  const initialActionKey = initialActions.map((a) => `${a.type}:${"id" in a ? a.id : ""}`).join("|");

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
  const recordBehavior = useMutation(api.behavior.recordBehavior);

  const firstName = user?.firstName ?? user?.username ?? "there";
  const greeting = greetingFor(firstName, dailyWindow);
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

  // Scroll to bottom when content changes
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, thinking, pendingDrafts.length, agentActions.length, freshTs]);

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

  // Pin composer above keyboard on mobile
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      if (window.innerWidth >= 1024) { setKbPad(0); return; }
      const gap = window.innerHeight - vv!.offsetTop - vv!.height;
      setKbPad(gap > 50 ? gap : 0);
    }
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

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
        const ingredientBreakdown = d.ingredientBreakdown ?? null;
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
          structuredItems: ingredientBreakdown?.items ? JSON.stringify(ingredientBreakdown.items) : undefined,
          ingredientBreakdown: ingredientBreakdown ? JSON.stringify(ingredientBreakdown) : undefined,
        });
        void recordBehavior({ kind: "log", key: "meal_confirm" }).catch(() => {});
        toast.success(`Logged${dateNote}: ${d.description}`, `${d.kcal} kcal · ${d.protein}g protein`);
        if (!isPastDay) await recordActivity({ type: "meal" }).catch(() => {});
      } else if (d.kind === "workout") {
        const calorieResult = d.calorieResult ?? null;
        await addWorkout({
          name: d.description,
          sets: d.sets || "1",
          duration: String(d.duration),
          intensity: d.intensity.toUpperCase(),
          date,
          exercises: d.exercises ?? undefined,
          caloriesBurned: d.kcal,
          rationale: tier2 || d.rationale || undefined,
          calorieConfidence: calorieResult?.confidence,
          calorieRangeLow: calorieResult?.range_low,
          calorieRangeHigh: calorieResult?.range_high,
          calorieBreakdown: calorieResult?.breakdown ? JSON.stringify(calorieResult.breakdown) : undefined,
          calculationVersion: calorieResult ? 1 : undefined,
          structuredSets: d.exercises ? JSON.stringify(d.exercises) : undefined,
        });
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
    } catch {
      toast.error("Couldn't log", "Something went wrong — try again.");
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
    recordEngagement(dailyWindow);

    try {
      const result = await homepageInput({
        message: messageText,
        image,
        today: localDateStr(),
      });

      setThinking(false);
      setFreshTs(Date.now());
      // actions always contain log_draft cards for every draft — just show them
      setAgentActions(Array.isArray(result.actions) ? result.actions : []);
    } catch (err) {
      setThinking(false);
      const raw = err instanceof Error ? err.message : "";
      const msg = raw.toLowerCase().includes("api_key") || raw.toLowerCase().includes("api key") || raw.includes("not set")
        ? "AI is not configured — contact the app owner to set up the API key."
        : raw.includes("429") || raw.toLowerCase().includes("rate limit") || raw.toLowerCase().includes("quota")
        ? "Stry is busy — try again in a moment."
        : raw.toLowerCase().includes("timeout") || raw.toLowerCase().includes("timed out")
        ? "Request timed out — check your connection."
        : raw.includes("Unauthenticated")
        ? "Session expired — please sign in again."
        : "Something went wrong. Try again.";
      toast.error("Couldn't reach Stry", msg);
    }
  }, [homepageInput, toast, recordEngagement, dailyWindow, attachedFile]);

  const handleActionButton = useCallback((button: AgentButton, action?: AgentAction) => {
    if (button.value === "skip" || button.value === "done") {
      // Record the question id (not the button value) so getTodayBrief can filter it out today
      const questionId = action && "id" in action ? action.id : button.value;
      void recordBehavior({ kind: "checkin", key: questionId, date: localDateStr() }).catch(() => {});
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
      void recordBehavior({ kind: "checkin", key: action && "id" in action ? action.id : "action", value: button.value, date: localDateStr() }).catch(() => {});
      setAgentActions([]);
      void send(button.prompt);
      return;
    }
    void recordBehavior({ kind: "checkin", key: action && "id" in action ? action.id : "action", value: button.value, date: localDateStr() }).catch(() => {});
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
  const activeMode: InputMode = voice.recording || voice.transcribing ? "voice" : attachedImage ? "photo" : attachedFile ? "ocr" : "type";
  const attachItems: AttachItem[] = [
    { key: "photo", label: "Photo of meal", mode: "photo", icon: <ImagePlus className="h-[18px] w-[18px]" strokeWidth={1.9} />, onSelect: () => fileRef.current?.click() },
    { key: "barcode", label: "Scan barcode", mode: "barcode", icon: <Barcode className="h-[18px] w-[18px]" strokeWidth={1.9} />, onSelect: () => setBarcodeOpen(true) },
    { key: "doc", label: "Attach MD / TXT", mode: "ocr", icon: <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.9} />, onSelect: () => docRef.current?.click() },
  ];

  // Inline action button — themed to design system
  const Btn = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}
      className="inline-flex items-center rounded-full bg-lavender-soft hover:bg-lavender/25 border border-lavender/20 px-3 py-1.5 text-[0.95rem] font-semibold text-text transition-colors">
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
        ? "border-l-sky bg-sky-soft"
        : action.tone === "momentum"
        ? "border-l-mint bg-mint-soft"
        : "border-l-lavender bg-lavender-soft";
      return (
        <div className={`rounded-2xl border border-border border-l-4 px-3.5 py-3 text-[13.5px] leading-relaxed text-text ${toneStyle}`}>
          {action.text}
        </div>
      );
    }
    if (action.type === "log_draft") {
      return (
        <div className="rounded-2xl border border-mint/25 bg-mint-soft px-3.5 py-3 space-y-2.5">
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
        <div className="rounded-2xl border border-peach/25 bg-peach-soft border-l-4 border-l-peach px-3.5 py-3 space-y-2.5">
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
      <div className="rounded-2xl border border-lavender/20 bg-lavender-soft px-3.5 py-3 space-y-2.5">
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

      <div className="flex h-full min-h-0 flex-col bg-surface dark:bg-[#090b12] transition-colors duration-300">
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto" aria-live="polite" aria-label="Chat with Stry">
          <div className="max-w-[720px] mx-auto px-4 pt-5 pb-3 space-y-4">
          {!showHistory && (
            <motion.div
              className="flex flex-col max-w-[92%]"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 28 }}
            >
              <p className="text-[14px] font-medium text-ink dark:text-surface/90 leading-relaxed">
                {greeting.headline} {presenceLine ?? greeting.sub}
              </p>
            </motion.div>
          )}

          {messages.map((m) => (
            <MessageBubble
              key={m.ts}
              role={m.role === "user" ? "user" : "ai"}
              content={m.content}
              fresh={freshTs !== null && m.ts === lastAiTs}
              {...(m.role === "user" ? modalityForContent(m.content) : {})}
              onEdit={m.role === "user" ? () => {
                setTextValue(m.content);
                setTimeout(() => activeRef.current?.focus(), 50);
              } : undefined}
            />
          ))}

          {thinking && <ThinkingBubble />}

          {/* Inline action cards */}
          <AnimatePresence>
            {agentActions.map((action, i) => (
              <motion.div key={`${action.type}-${i}`}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={reduceMotion ? { duration: 0 } : FADE_FAST}>
                <div className="max-w-[92%] w-full" style={{ zoom: 0.72 } as React.CSSProperties}>
                  <AgentActionCard action={action} />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Inline confirm cards */}
          <AnimatePresence>
            {pendingDrafts.map((draft, i) => (
              <motion.div key={`draft-${i}`}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={reduceMotion ? { duration: 0 } : FADE_FAST}>
                <div className="w-full max-w-[92%]" style={{ zoom: 0.72 } as React.CSSProperties}>
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
        </div>

        {/* Attachment previews */}
        <AnimatePresence>
          {(attachedImage || attachedFile) && (
            <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
              className="shrink-0 max-w-[720px] mx-auto w-full px-3 pb-2 flex items-center gap-2">
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
                <div className="relative inline-flex items-center gap-2 rounded-xl border border-lavender/30 bg-lavender-soft px-3 py-2">
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

        <div className="shrink-0"
          style={{ paddingBottom: kbPad > 0 ? `${kbPad}px` : "max(env(safe-area-inset-bottom), 0.75rem)" }}>
          <div className="max-w-[720px] mx-auto px-3 pt-1">
            <InputBar
              inputRef={activeRef as React.RefObject<HTMLTextAreaElement>}
              value={textValue}
              onValueChange={setTextValue}
              onSubmit={submit}
              activeMode={activeMode}
              attachItems={attachItems}
              onVoice={() => voice.recording ? voice.stop() : voice.start()}
              voiceState={voice.transcribing ? "transcribing" : voice.recording ? "recording" : "idle"}
              busy={thinking}
              disabled={voice.transcribing}
              submitEnabled={!!textValue.trim() || !!attachedImage || !!attachedFile}
              placeholder={
                voice.recording ? "Listening..." :
                voice.transcribing ? "Transcribing..." :
                attachedImage ? "Add a note (optional)..." :
                showHistory ? "Reply, log, or ask..." :
                "Message Stry — what did you eat or train?"
              }
              ariaLabel="Ask Stry"
            />
            {showHistory && (
              <button type="button" onClick={() => clearHomepageMessages().catch(() => {})}
                className="mt-2 text-[11px] font-bold uppercase tracking-wide text-ink/35 dark:text-white/35 hover:text-ink dark:hover:text-white">
                Clear chat
              </button>
            )}
            {voice.error && <p className="text-[11px] text-bubblegum mt-1.5">{voice.error}</p>}
          </div>
        </div>
      </div>

      <BarcodeModal open={barcodeOpen} onClose={() => setBarcodeOpen(false)} />
      <EditLogModal kind="meal" entry={editEntry} onClose={() => setEditEntry(null)} />
    </>
  );
}
