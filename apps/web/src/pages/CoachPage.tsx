import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Trash2, Barcode, ImagePlus, X, RotateCcw } from "lucide-react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { BarcodeModal } from "@/components/coach/BarcodeModal";
import { AgentBadge } from "@/components/ui-kit/AgentBadge";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ThinkingBubble } from "@/components/ui-kit/ChatMessage";
import { CoachBubble, InputBar } from "@/components/ui-kit";
import type { AgentType, AttachItem, InputMode, Modality } from "@/components/ui-kit";
import { usePrefs } from "@/hooks/usePrefs";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useToast } from "@/context/ToastContext";
import { recordSuggestion, orderSuggestions } from "@/lib/behavior";
import { cn, localDateStr } from "@/lib/utils";
import { MobileIcon, StatusBar } from "@/components/mobile/MobileKit";
import type { Agent, CoachingStyle } from "@/lib/storage";

const COACH_SUGGESTIONS = [
  "Log breakfast",
  "How is my week?",
  "Plan a workout",
  "I'm feeling tired",
];

const SUGGESTION_DOT: Record<string, string> = {
  "Log breakfast": "bg-peach",
  "How is my week?": "bg-lavender",
  "Plan a workout": "bg-mint",
  "I'm feeling tired": "bg-sky",
};

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

type TextMessage = { kind: "text"; id: string; role: "user" | "assistant"; text: string; agent?: Agent; streamed?: boolean; entrance?: boolean; modality?: Modality; chip?: string };
type UndoEntry = { type: "meal" | "workout" | "sleep" | "water" | "mood" | "steps"; id: string; label: string; undone?: boolean; previous?: { hours: number; quality: string; note?: string } | { count: number } | null; expected?: { hours: number; quality: string } | { count: number } };
type UndoMessage = { kind: "undo"; id: string; entries: UndoEntry[] };
type Message = TextMessage | UndoMessage;
type ChatSessionSummary = { id: Id<"chat_sessions">; title: string; updatedAt: number; isHome?: boolean };
type ConvexChatMessage = { role: "user" | "ai"; content: string };

const RAIL_SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;
const CHAT_RAIL_STORAGE_KEY = "stride_chat_rail_expanded";

const GREETING: Record<CoachingStyle, string> = {
  gentle: "Hey, I'm Stry. No pressure — just here when you need me.",
  motivating: "Hey! I'm Stry. Ready to make today count? Let's go!",
  analytical: "Hi, I'm Stry. I'll help you track patterns. What would you like to log?",
};

export function CoachPage() {
  const navigate = useNavigate();
  const { prefs } = usePrefs();
  const style = prefs.coachingStyle;
  const reduceMotion = useReducedMotion();

  const sessions = (useQuery(api.chat.getSessions) ?? []) as ChatSessionSummary[];
  const createSession = useMutation(api.chat.createSession);
  const deleteSession = useMutation(api.chat.deleteSession);
  const deleteMeal = useMutation(api.meals.deleteMeal);
  const deleteWorkout = useMutation(api.workouts.deleteWorkout);
  const undoSleepLog = useMutation(api.wellness.undoSleepLog);
  const deleteWater = useMutation(api.wellness.deleteWater);
  const deleteMood = useMutation(api.wellness.deleteMood);
  const undoStepsLog = useMutation(api.wellness.undoStepsLog);
  const sendToAI = useAction(api.ai.chat);
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeSessionId, setActiveSessionId] = useState<Id<"chat_sessions"> | null>(null);
  const convexMessages = useQuery(api.chat.getMessages, activeSessionId ? { sessionId: activeSessionId } : "skip") as ConvexChatMessage[] | undefined;

  const [messages, setMessages] = useState<Message[]>(() => [
    { kind: "text", id: "init", role: "assistant", text: GREETING[style], streamed: true },
  ]);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");
  const [panelOpen, setPanelOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(CHAT_RAIL_STORAGE_KEY) !== "false"; }
    catch { return true; }
  });
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [kbPad, setKbPad] = useState(0);
  const [pendingUndoIds, setPendingUndoIds] = useState<Set<string>>(() => new Set());
  const pendingUndoIdsRef = useRef<Set<string>>(new Set());
  const pendingHydrateRef = useRef<Id<"chat_sessions"> | null>(null);
  const sendingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const onTranscript = useCallback((t: string) => {
    setInput((prev) => (prev ? `${prev} ${t}` : t).trim());
  }, []);
  const voice = useAudioRecorder(onTranscript);

  useEffect(() => {
    try { localStorage.setItem(CHAT_RAIL_STORAGE_KEY, String(panelOpen)); } catch {}
  }, [panelOpen]);

  const onPickImage = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Not an image", "Please choose an image file"); return; }
    const reader = new FileReader();
    reader.onload = () => setAttachedImage(reader.result as string);
    reader.readAsDataURL(file);
  }, [toast]);

  // Pin composer above keyboard on mobile via visualViewport
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

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!e.clipboardData) return;
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.type.startsWith("image/")) { e.preventDefault(); const file = item.getAsFile(); if (file) onPickImage(file); return; }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [onPickImage]);

  useEffect(() => {
    if (!activeSessionId || pendingHydrateRef.current !== activeSessionId || !convexMessages) return;
    const hydrated: Message[] = convexMessages.map((m, i) => ({
      kind: "text" as const, id: `cx-${i}`,
      role: m.role === "ai" ? "assistant" as const : "user" as const, text: m.content, streamed: false, entrance: false,
    }));
    setMessages(hydrated.length > 0 ? hydrated : [{ kind: "text", id: "init", role: "assistant", text: GREETING[style], streamed: true }]);
    pendingHydrateRef.current = null;
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, convexMessages]);

  const loadSession = useCallback((id: Id<"chat_sessions">) => {
    if (id === activeSessionId) return;
    pendingHydrateRef.current = id;
    setActiveSessionId(id);
    setMessages([{ kind: "text", id: "loading", role: "assistant", text: "Loading…", streamed: false }]);
  }, [activeSessionId]);

  // Load session from sidebar ?session= param, then clear the param from URL
  useEffect(() => {
    const sid = searchParams.get("session");
    if (!sid || sessions.length === 0) return;
    const match = sessions.find((s) => s.id === sid);
    if (match) { loadSession(match.id as Id<"chat_sessions">); setSearchParams({}, { replace: true }); }
  }, [searchParams, sessions, loadSession, setSearchParams]);

  const scroll = useCallback(() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50), []);

  const undoAutoLog = useCallback(async (messageId: string, entry: UndoEntry) => {
    if (entry.undone || pendingUndoIdsRef.current.has(entry.id)) return;
    pendingUndoIdsRef.current.add(entry.id);
    setPendingUndoIds((prev) => new Set(prev).add(entry.id));
    try {
      switch (entry.type) {
        case "meal":
          await deleteMeal({ id: entry.id as Id<"meals"> });
          break;
        case "workout":
          await deleteWorkout({ id: entry.id as Id<"workouts"> });
          break;
        case "sleep":
          await undoSleepLog({ id: entry.id as Id<"sleep_logs">, previous: (entry.previous as { hours: number; quality: string; note?: string } | undefined) ?? null, expected: entry.expected as { hours: number; quality: string } });
          break;
        case "water":
          await deleteWater({ id: entry.id as Id<"water_logs"> });
          break;
        case "mood":
          await deleteMood({ id: entry.id as Id<"mood_logs"> });
          break;
        case "steps":
          await undoStepsLog({ id: entry.id as Id<"steps_logs">, previous: (entry.previous as { count: number } | undefined) ?? null, expected: entry.expected as { count: number } });
          break;
        default:
          return;
      }
      setMessages((prev) => prev.map((m) => m.kind === "undo" && m.id === messageId
        ? { ...m, entries: m.entries.map((e) => e.id === entry.id ? { ...e, undone: true } : e) }
        : m));
      toast.success("Undone", `${entry.label} removed`);
    } catch (err) {
      toast.error("Couldn't undo", err instanceof Error ? err.message : "Try again");
    } finally {
      pendingUndoIdsRef.current.delete(entry.id);
      setPendingUndoIds((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  }, [deleteMeal, deleteWorkout, undoSleepLog, deleteWater, deleteMood, undoStepsLog, toast]);

  function undoEntriesFromLoggedItem(loggedItem: any): UndoEntry[] {
    const rawItems = loggedItem?.type === "multiple" ? loggedItem.items : loggedItem ? [loggedItem] : [];
    if (!Array.isArray(rawItems)) return [];
    return rawItems.flatMap((item: any) => {
      const id = item?.data?._id;
      if (!id) return [];
      switch (item.type) {
        case "meal":
        case "workout":
          return [{ type: item.type, id, label: item.data?.name ?? item.type }];
        case "sleep":
          return [{ type: "sleep" as const, id, label: `Sleep (${item.data?.hours}h)`, previous: item.data?.previous ?? null, expected: { hours: item.data?.hours, quality: item.data?.quality } }];
        case "water":
          return [{ type: "water" as const, id, label: `Water (${item.data?.ml}ml)` }];
        case "mood":
          return [{ type: "mood" as const, id, label: `Mood (${item.data?.rating}/5)` }];
        case "steps":
          return [{ type: "steps" as const, id, label: `Steps (${item.data?.count})`, previous: item.data?.previous ?? null, expected: { count: item.data?.count } }];
        default:
          return [];
      }
    });
  }

  const newChat = useCallback(() => {
    pendingHydrateRef.current = null;
    setActiveSessionId(null);
    setMessages([{ kind: "text", id: "init", role: "assistant", text: GREETING[style], streamed: true }]);
  }, [style]);

  const orderedSuggestions = useMemo(() => orderSuggestions(COACH_SUGGESTIONS), []);
  const hasUserMsg = messages.some((m) => m.kind === "text" && m.role === "user");
  const lastTextIdx = messages.reduce((acc, m, i) => m.kind === "text" ? i : acc, -1);
  const activeMode: InputMode = voice.recording || voice.transcribing ? "voice" : attachedImage ? "photo" : "type";

  const send = useCallback(async (text: string, image?: string) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    const v = text.trim();
    if (!v && !image) { sendingRef.current = false; return; }
    const userMeta = image
      ? { modality: "photo" as const, chip: "Attached image" }
      : activeMode === "voice"
      ? { modality: "voice" as const, chip: "Voice note" }
      : undefined;
    setInput("");
    setAttachedImage(null);
    setMessages((prev) => [...prev, { kind: "text", id: `u-${Date.now()}`, role: "user", text: v || "Photo of meal", ...userMeta }]);
    scroll();

    setThinking(true);
    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const result = await createSession({ title: v.slice(0, 40) || "Image chat" });
        sessionId = result.id;
        setActiveSessionId(sessionId);
      }
      const result = await sendToAI({ message: v, image, sessionId, coachType: "auto", today: localDateStr() });
      const r = result as Record<string, unknown>;
      const reply = typeof r.reply === "string" ? r.reply : String(result);
      const coachType = typeof r.coachType === "string" ? r.coachType : undefined;
      const agent = coachToAgent(coachType);
      const loggedItem = (r.loggedItem && typeof r.loggedItem === "object" && "type" in (r.loggedItem as object))
        ? r.loggedItem as { type: string; data: any } : undefined;

      setMessages((prev) => [...prev, { kind: "text", id: `a-${Date.now()}`, role: "assistant", text: reply, agent, streamed: true }]);
      scroll();

      if (loggedItem) {
        if (loggedItem.type === "meal") {
          const d = loggedItem.data;
          toast.success(`Logged: ${d.name ?? "meal"}`, `${Math.round(d.calories)} kcal · ${Math.round(d.protein)}g protein`);
        } else if (loggedItem.type === "workout") {
          const d = loggedItem.data;
          toast.success(`Logged workout: ${d.name ?? "workout"}`, d.duration ? `${d.duration} · ${d.caloriesBurned ?? 0} kcal burned` : undefined);
        } else if (loggedItem.type === "sleep") {
          const d = loggedItem.data;
          toast.success("Logged sleep", `${d.hours}h · ${d.quality}`);
        } else if (loggedItem.type === "water") {
          const d = loggedItem.data;
          toast.success("Logged water", `${d.ml}ml`);
        } else if (loggedItem.type === "mood") {
          const d = loggedItem.data;
          toast.success("Logged mood", `rating ${d.rating}/5`);
        } else if (loggedItem.type === "steps") {
          const d = loggedItem.data;
          toast.success("Logged steps", `${d.count} steps`);
        }
        const undoEntries = undoEntriesFromLoggedItem(loggedItem);
        if (undoEntries.length > 0) {
          setMessages((prev) => [...prev, { kind: "undo", id: `undo-${Date.now()}`, entries: undoEntries }]);
          scroll();
        }
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const userMsg = raw.toLowerCase().includes("api_key") || raw.toLowerCase().includes("api key") || raw.includes("not set")
        ? "AI is not configured — contact the app owner to set up the API key."
        : raw.includes("429") || raw.toLowerCase().includes("rate limit") || raw.toLowerCase().includes("quota")
        ? "Stry is busy — try again in a moment."
        : raw.toLowerCase().includes("timeout") || raw.toLowerCase().includes("timed out")
        ? "Request timed out — check your connection."
        : "Couldn't reach Stry right now. Please try again.";
      setMessages((prev) => [...prev, { kind: "text", id: `a-${Date.now()}`, role: "assistant", text: userMsg, streamed: false }]);
      toast.error("Error", userMsg);
    } finally {
      sendingRef.current = false;
      setThinking(false);
    }
  }, [activeMode, activeSessionId, createSession, sendToAI, scroll, toast]);

  const attachItems: AttachItem[] = [
    { key: "photo", label: "Photo of meal", mode: "photo", icon: <ImagePlus className="h-[18px] w-[18px]" strokeWidth={1.9} />, onSelect: () => fileRef.current?.click() },
    { key: "barcode", label: "Scan barcode", mode: "barcode", icon: <Barcode className="h-[18px] w-[18px]" strokeWidth={1.9} />, onSelect: () => setBarcodeOpen(true) },
  ];
  const coachPresenceType: AgentType =
    style === "analytical" ? "overall" :
    style === "motivating" ? "workout" :
    "overall";

  return (
    /* Break out of AppLayout padding — same technique as HomePage */
    <div className="flex h-full flex-col lg:h-dvh lg:flex-row lg:-mx-10 lg:-mt-10 lg:-mb-12 overflow-hidden bg-surface dark:bg-[#090b12] transition-colors duration-300">

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) onPickImage(file); e.target.value = ""; }} />
      <BarcodeModal open={barcodeOpen} onClose={() => setBarcodeOpen(false)} date={localDateStr()} />

      {/* ── Mobile header ─────────────────────────────────────────── */}
      <div className="lg:hidden px-4 pt-1 pb-3 shrink-0 flex items-center gap-2.5 border-b border-ink/6 dark:border-white/6">
        <button onClick={() => setMobileHistoryOpen(true)} aria-label="Chat history" className="w-9 h-9 rounded-full bg-white dark:bg-[#1a1e2e] shadow-[0_4px_14px_rgba(13,16,27,0.08)] flex items-center justify-center text-ink/55 dark:text-white/55 active:scale-90 transition-transform shrink-0">
          <MobileIcon size={19} sw={2.2}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 4v4h4M12 8v4l3 2" /></MobileIcon>
        </button>
        <div className="flex-1 min-w-0 px-2">
          <div className="flex items-center gap-1.5">
            <p className="text-[17px] font-extrabold text-ink dark:text-surface tracking-[-0.5px] leading-tight">Stry</p>
            <AgentBadge type="overall" />
          </div>
          <p className="text-[11px] font-medium text-ink/40 dark:text-white/40 truncate leading-tight">ask anything about your day</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => navigate(-1)} aria-label="Close chat"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white dark:bg-[#1a1e2e] shadow-[0_4px_14px_rgba(13,16,27,0.08)] text-ink/55 dark:text-white/55 active:scale-90 transition-transform">
            <X className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* ── Mobile history sheet ───────────────────────────────────── */}
      <AnimatePresence>
        {mobileHistoryOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex" aria-modal="true" role="dialog">
            <motion.div
              className="relative w-[82%] max-w-[320px] h-full bg-surface dark:bg-[#0b0d15] shadow-[20px_0_60px_rgba(13,16,27,0.25)] flex flex-col"
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 36 }}
            >
              <StatusBar />
              <div className="flex items-center justify-between px-5 pt-1 pb-4">
                <h2 className="text-[18px] font-extrabold text-ink dark:text-surface tracking-[-0.5px]">Chats</h2>
                <button onClick={() => setMobileHistoryOpen(false)} aria-label="Close history" className="w-9 h-9 rounded-full bg-white dark:bg-[#1a1e2e] shadow-[0_4px_14px_rgba(13,16,27,0.08)] flex items-center justify-center text-ink/55 dark:text-white/55 active:scale-90 transition-transform">
                  <X className="h-4 w-4" strokeWidth={2.4} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-1.5">
                <button onClick={() => { newChat(); setMobileHistoryOpen(false); }} className="w-full flex items-center gap-2 rounded-[12px] bg-ink dark:bg-lavender text-white dark:text-ink px-3 py-3 text-[13px] font-extrabold mb-2 active:scale-[0.98] transition-transform">
                  <Plus className="h-4 w-4" strokeWidth={2.4} />
                  New chat
                </button>
                {sessions.length === 0 && <p className="text-[13px] text-ink/45 dark:text-white/40 py-4 text-center">No previous chats yet.</p>}
                {sessions.map((s) => (
                  <div key={s.id} className={cn("group flex items-center gap-1 rounded-[10px] transition-colors", s.id === activeSessionId ? "bg-lavender/20 text-ink dark:text-lavender" : "text-ink/55 dark:text-white/55 active:bg-ink/5 dark:active:bg-white/5")}>
                    <button type="button" onClick={() => { loadSession(s.id); setMobileHistoryOpen(false); }} className="flex-1 text-left px-3 py-3 min-w-0">
                      <div className="text-[13px] font-bold truncate">{s.title}</div>
                      <div className="text-[10px] opacity-70">{new Date(s.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                    </button>
                    <button type="button" onClick={() => { if (s.id === activeSessionId) newChat(); void deleteSession({ id: s.id }); }} aria-label="Delete"
                      className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-ink/35 dark:text-white/35 hover:text-bubblegum transition-colors">
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.button className="flex-1 h-full bg-ink/40 backdrop-blur-[2px]"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setMobileHistoryOpen(false)}
              aria-label="Close history"
            />
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="hidden lg:flex px-6 pt-5 pb-3 shrink-0 items-center gap-2">
          <h1 className="text-[22px] font-extrabold text-ink dark:text-surface tracking-[-0.5px]">Stry</h1>
          <AgentBadge type="overall" />
          <span className="text-[13px] font-medium text-ink/45 dark:text-white/45 ml-1">ask anything about your day</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar" aria-live="polite" aria-label="Chat with Stry">
          <div className="max-w-[720px] mx-auto px-4 pt-5 pb-3 space-y-4">
            {!hasUserMsg && (
              <div style={{ zoom: 0.72 } as React.CSSProperties}>
                <CoachBubble
                  agentType={coachPresenceType}
                  defaultStyle={style}
                  messages={{
                    gentle: GREETING.gentle,
                    motivating: GREETING.motivating,
                    analytical: GREETING.analytical,
                  }}
                />
              </div>
            )}

            {messages.map((m, i) => {
              if (m.kind === "undo") {
                if (m.entries.length === 0) return null;
                return (
                  <div key={m.id} className="flex flex-wrap gap-2 max-w-[92%]" style={{ zoom: 0.72 } as React.CSSProperties}>
                    {m.entries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        disabled={entry.undone || pendingUndoIds.has(entry.id)}
                        onClick={() => undoAutoLog(m.id, entry)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors",
                          entry.undone || pendingUndoIds.has(entry.id)
                            ? "border-ink/10 text-ink/35 dark:border-white/10 dark:text-white/30 cursor-default"
                            : "border-bubblegum/30 text-bubblegum hover:bg-bubblegum/10 dark:border-bubblegum/40 cursor-pointer",
                        )}
                      >
                        <RotateCcw className="h-3 w-3" strokeWidth={2.4} />
                        {entry.undone ? `${entry.label} removed` : pendingUndoIds.has(entry.id) ? `Undoing: ${entry.label}` : `Undo: ${entry.label}`}
                      </button>
                    ))}
                  </div>
                );
              }
              if (!hasUserMsg && m.id === "init") return null;
              return (
                <MessageBubble
                  key={m.id}
                  role={m.role === "assistant" ? "ai" : "user"}
                  content={m.text}
                  entrance={m.entrance}
                  fresh={i === lastTextIdx && !!m.streamed}
                  onEdit={m.role === "user" ? () => { setInput(m.text); inputRef.current?.focus(); } : undefined}
                  badge={m.role === "assistant" && m.agent && m.agent !== "main" ? <AgentBadge agent={m.agent} /> : undefined}
                  modality={m.role === "user" ? m.modality : undefined}
                  chip={m.role === "user" ? m.chip : undefined}
                />
              );
            })}
            {thinking && <ThinkingBubble />}
            <div ref={bottomRef} />
          </div>
        </div>

        {!hasUserMsg && (
          <div className="shrink-0 max-w-[720px] mx-auto w-full px-3 pb-2">
            <div className="flex flex-wrap gap-1.5">
              {orderedSuggestions.map((s) => (
                <button key={s} type="button" onClick={() => { recordSuggestion(s); void send(s); }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-[#1a1e2e] shadow-[0_8px_24px_rgba(13,16,27,0.06)] px-3 py-1.5 text-[12px] font-bold text-ink dark:text-surface hover:bg-lavender/15 transition-colors">
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", SUGGESTION_DOT[s] ?? "bg-lavender")} />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence>
          {attachedImage && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
              className="shrink-0 max-w-[720px] mx-auto w-full px-3 pb-2 flex"
            >
              <div className="relative">
                <img src={attachedImage} alt="Attached" className="h-16 w-16 rounded-xl object-cover border border-ink/8 dark:border-white/10" />
                <button type="button" onClick={() => setAttachedImage(null)} aria-label="Remove image"
                  className="absolute -top-1.5 -right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white dark:bg-lavender dark:text-ink">
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="shrink-0" style={{ paddingBottom: kbPad > 0 ? `${kbPad}px` : "max(env(safe-area-inset-bottom), 0.75rem)" }}>
          <div className="max-w-[720px] mx-auto px-3 pt-1">
            <InputBar
              inputRef={inputRef}
              value={input}
              onValueChange={setInput}
              onSubmit={() => { void send(input, attachedImage ?? undefined); if (inputRef.current) inputRef.current.style.height = "auto"; }}
              activeMode={activeMode}
              attachItems={attachItems}
              onVoice={() => voice.recording ? voice.stop() : voice.start()}
              voiceState={voice.transcribing ? "transcribing" : voice.recording ? "recording" : "idle"}
              busy={thinking}
              disabled={voice.transcribing}
              submitEnabled={!!input.trim() || !!attachedImage}
              placeholder={voice.recording ? "Listening..." : voice.transcribing ? "Transcribing..." : "Message Stry — what did you eat or train?"}
              ariaLabel="Message Stry"
            />
            {voice.error && <p className="text-[11px] text-bubblegum mt-1.5">{voice.error}</p>}
          </div>
        </div>
      </div>

      <motion.aside
        animate={{ width: panelOpen ? 312 : 48 }}
        transition={reduceMotion ? { duration: 0 } : RAIL_SPRING}
        className="hidden lg:block shrink-0 h-screen border-l border-ink/8 dark:border-white/8 bg-surface dark:bg-[#090b12] overflow-hidden"
      >
        {panelOpen ? (
          <div className="h-full w-[312px] overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-extrabold uppercase tracking-[2px] text-ink/35 dark:text-white/35">Chats</span>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Collapse chats"
                className="w-7 h-7 rounded-full hover:bg-ink/5 dark:hover:bg-white/10 flex items-center justify-center text-ink/45 dark:text-white/40 cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={newChat}
                className="w-full flex items-center gap-2 rounded-[12px] bg-ink dark:bg-lavender text-white dark:text-ink px-3 py-2.5 text-[13px] font-extrabold mb-3 cursor-pointer hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" strokeWidth={2.4} />
                New chat
              </button>
              {sessions.length === 0 && <p className="text-[13px] text-ink/45 dark:text-white/40 py-4 text-center">No previous chats yet.</p>}
              {sessions.map((s) => (
                <div key={s.id} className={cn("group flex items-center gap-1 rounded-[10px] transition-colors", s.id === activeSessionId ? "bg-lavender/20 text-ink dark:text-lavender" : "text-ink/55 dark:text-white/50 hover:bg-ink/5 dark:hover:bg-white/5")}>
                  <button type="button" onClick={() => loadSession(s.id)} className="flex-1 text-left rounded-[10px] px-3 py-2.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {s.isHome && (
                        <span className="shrink-0 inline-flex items-center rounded-full bg-lavender/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-lavender">Home</span>
                      )}
                      <div className="text-[13px] font-bold truncate">{s.title}</div>
                    </div>
                    <div className="text-[10px] opacity-70">{new Date(s.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (s.id === activeSessionId) newChat(); void deleteSession({ id: s.id }); }}
                    aria-label="Delete"
                    className="opacity-0 group-hover:opacity-100 mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-ink/35 dark:text-white/35 hover:text-bubblegum transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <button onClick={() => setPanelOpen(true)} className="w-12 h-full flex flex-col items-center pt-5 gap-3 text-ink/45 dark:text-white/40 hover:text-ink dark:hover:text-white cursor-pointer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
            <span className="[writing-mode:vertical-rl] text-[11px] font-extrabold uppercase tracking-widest">Chats</span>
          </button>
        )}
      </motion.aside>
    </div>
  );
}
