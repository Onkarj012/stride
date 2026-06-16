import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUp, Mic, MicOff, Plus, Trash2, Barcode, ImagePlus, X, Loader2, PanelLeft, Sparkles, Clock } from "lucide-react";
import { NavTrigger } from "@/components/layout/NavTrigger";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { LogConfirmCard } from "@/components/coach/LogConfirmCard";
import { BarcodeModal } from "@/components/coach/BarcodeModal";
import { AgentBadge } from "@/components/insights/AgentBadge";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { useLogs } from "@/hooks/useLogs";
import { usePrefs } from "@/hooks/usePrefs";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useToast } from "@/context/ToastContext";
import { recordSuggestion, orderSuggestions } from "@/lib/behavior";
import type { LogDraft, MealDraft, WorkoutDraft } from "@/data/mock";
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
import { cn, localDateStr } from "@/lib/utils";

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

type TextMessage = { kind: "text"; id: string; role: "user" | "assistant"; text: string; agent?: Agent; streamed?: boolean };
type DraftMessage = { kind: "draft"; id: string; draft: LogDraft; confirmReply: string; discardReply: string; settled: boolean };
type Message = TextMessage | DraftMessage;

const SPRING = { type: "spring", stiffness: 260, damping: 28 } as const;

const GREETING: Record<CoachingStyle, string> = {
  gentle: "Hey, I'm Stry. No pressure — just here when you need me.",
  motivating: "Hey! I'm Stry. Ready to make today count? Let's go!",
  analytical: "Hi, I'm Stry. I'll help you track patterns. What would you like to log?",
};

function ThinkingBubble() {
  return (
    <div className="flex items-start gap-2.5">
      <div className="shrink-0 h-[18px] w-[18px] mt-1.5 rounded-[6px] bg-lavender flex items-center justify-center">
        <Sparkles className="h-2.5 w-2.5 text-ink" strokeWidth={2.5} />
      </div>
      <div className="rounded-2xl rounded-bl-sm bg-card shadow-[var(--shadow-soft)] px-4 py-3 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div key={i} className="h-1.5 w-1.5 rounded-full bg-lavender"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }} />
        ))}
      </div>
    </div>
  );
}

export function CoachPage() {
  const { prefs } = usePrefs();
  const style = prefs.coachingStyle;

  // Lock AppLayout's <main> scroll while this page is mounted
  useEffect(() => {
    const main = document.querySelector("main");
    if (main) main.style.overflow = "hidden";
    return () => { if (main) main.style.overflow = ""; };
  }, []);

  const sessions = useQuery(api.chat.getSessions) ?? [];
  const createSession = useMutation(api.chat.createSession);
  const deleteSession = useMutation(api.chat.deleteSession);
  const sendToAI = useAction(api.ai.chat);
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeSessionId, setActiveSessionId] = useState<Id<"chat_sessions"> | null>(null);
  const convexMessages = useQuery(api.chat.getMessages, activeSessionId ? { sessionId: activeSessionId } : "skip");

  const [messages, setMessages] = useState<Message[]>(() => [
    { kind: "text", id: "init", role: "assistant", text: GREETING[style], streamed: true },
  ]);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(false); // collapsed by default
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [kbPad, setKbPad] = useState(0);
  const pendingHydrateRef = useRef<Id<"chat_sessions"> | null>(null);
  const sendingRef = useRef(false);
  const { add } = useLogs();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const onTranscript = useCallback((t: string) => {
    setInput((prev) => (prev ? `${prev} ${t}` : t).trim());
  }, []);
  const voice = useAudioRecorder(onTranscript);

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
      role: m.role === "ai" ? "assistant" as const : "user" as const, text: m.content, streamed: false,
    }));
    setMessages(hydrated.length > 0 ? hydrated : [{ kind: "text", id: "init", role: "assistant", text: GREETING[style], streamed: true }]);
    pendingHydrateRef.current = null;
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, convexMessages]);

  const loadSession = useCallback((id: Id<"chat_sessions">) => {
    if (id === activeSessionId) { setPanelOpen(false); return; }
    pendingHydrateRef.current = id;
    setActiveSessionId(id);
    setMessages([{ kind: "text", id: "loading", role: "assistant", text: "Loading…", streamed: false }]);
    setPanelOpen(false);
  }, [activeSessionId]);

  // Load session from sidebar ?session= param, then clear the param from URL
  useEffect(() => {
    const sid = searchParams.get("session");
    if (!sid || sessions.length === 0) return;
    const match = sessions.find((s) => s.id === sid);
    if (match) { loadSession(match.id as Id<"chat_sessions">); setSearchParams({}, { replace: true }); }
  }, [searchParams, sessions, loadSession, setSearchParams]);

  const scroll = useCallback(() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50), []);

  const newChat = useCallback(() => {
    pendingHydrateRef.current = null;
    setActiveSessionId(null);
    setMessages([{ kind: "text", id: "init", role: "assistant", text: GREETING[style], streamed: true }]);
    setPanelOpen(false);
  }, [style]);

  const orderedSuggestions = useMemo(() => orderSuggestions(COACH_SUGGESTIONS), []);
  const hasUserMsg = messages.some((m) => m.kind === "text" && m.role === "user");
  const lastTextIdx = messages.reduce((acc, m, i) => m.kind === "text" ? i : acc, -1);

  const handleConfirm = useCallback((msgId: string, draft: any, confirmReply: string) => {
    const draftDate: string | undefined = draft.date;
    const dateNote = draftDate && draftDate !== localDateStr() ? ` for ${draftDate}` : "";
    if (draft.kind === "meal") {
      const d = draft as MealDraft;
      add("meal", d.description, { agent: "diet", meal: { kcal: d.kcal, protein: d.protein, carbs: d.carbs, fat: d.fat, items: d.items } }, draftDate);
      toast.success(`Logged${dateNote}: ${d.description}`, `${d.kcal} kcal · ${d.protein}g protein`);
    } else if (draft.kind === "workout") {
      const d = draft as WorkoutDraft;
      add("workout", d.description, { agent: "workout", workout: { type: d.type, duration: d.duration, distance: d.distance, kcal: d.kcal, intensity: d.intensity } }, draftDate);
      toast.success(`Logged workout${dateNote}`, `${d.duration} min · ${d.kcal} kcal`);
    } else if (draft.kind === "sleep") {
      add("sleep", draft.description, { agent: "sleep", sleep: { hours: draft.hours, quality: draft.quality } }, draftDate);
      toast.success(`Sleep logged${dateNote}`, `${draft.hours.toFixed(1)}h · ${draft.quality}`);
    } else if (draft.kind === "water") {
      add("water", "water", { agent: "water", water: { ml: draft.ml } }, draftDate);
      toast.success(`Water logged${dateNote}`, `${draft.ml}ml`);
    } else if (draft.kind === "mood") {
      add("mood", draft.description, { agent: "wellness", mood: { rating: draft.rating, note: draft.description } }, draftDate);
      toast.success(`Mood logged${dateNote}`, `${draft.rating}/5`);
    } else if (draft.kind === "steps") {
      add("steps", `${draft.count} steps`, { agent: "habit", steps: { count: draft.count } }, draftDate);
      toast.success(`Steps logged${dateNote}`, `${draft.count.toLocaleString()} steps`);
    }
    setMessages((prev) => prev.map((m) => m.id === msgId && m.kind === "draft" ? { ...m, settled: true } : m));
    setTimeout(() => {
      setMessages((prev) => [...prev, { kind: "text", id: `a-${Date.now()}`, role: "assistant", text: confirmReply, agent: draft.kind === "meal" ? "diet" : "workout", streamed: true }]);
      scroll();
    }, 400);
  }, [add, scroll, toast]);

  const handleDiscard = useCallback((msgId: string, discardReply: string) => {
    setMessages((prev) => prev.map((m) => m.id === msgId && m.kind === "draft" ? { ...m, settled: true } : m));
    setTimeout(() => {
      setMessages((prev) => [...prev, { kind: "text", id: `a-${Date.now()}`, role: "assistant", text: discardReply, streamed: true }]);
      scroll();
    }, 300);
  }, [scroll]);

  const send = useCallback(async (text: string, image?: string) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    const v = text.trim();
    if (!v && !image) { sendingRef.current = false; return; }
    setInput("");
    setAttachedImage(null);
    setMessages((prev) => [...prev, { kind: "text", id: `u-${Date.now()}`, role: "user", text: v || "[image]" }]);
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
  }, [activeSessionId, createSession, sendToAI, scroll, toast]);

  // Auto-resize textarea
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input, attachedImage ?? undefined);
      if (inputRef.current) { inputRef.current.style.height = "auto"; }
    }
  }, [send, input, attachedImage]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    /* Break out of AppLayout padding — same technique as HomePage */
    <div className="flex flex-col lg:flex-row -mx-4 lg:-mx-10 -my-4 lg:-my-10 overflow-hidden" style={{ height: "calc(100dvh - max(env(safe-area-inset-top),16px))", marginBottom: "calc(-1 * max(env(safe-area-inset-bottom), 1.5rem))" }}>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) onPickImage(file); e.target.value = ""; }} />
      <BarcodeModal open={barcodeOpen} onClose={() => setBarcodeOpen(false)} />

      {/* ── Mobile header ─────────────────────────────────────────── */}
      <div className="lg:hidden shrink-0 flex items-center justify-between px-4 border-b border-border bg-bg"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)", paddingBottom: "0.75rem" }}>
        <div className="flex-1 min-w-0 px-2">
          <p className="text-[15px] font-bold text-text leading-tight">Stry</p>
          {activeSession && (
            <p className="text-[11px] text-text-muted truncate leading-tight">{activeSession.title}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={newChat} aria-label="New chat"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-muted hover:bg-card-elev transition-colors">
            <Plus className="h-4 w-4" strokeWidth={2} />
          </button>
          <button type="button" onClick={() => setMobileHistoryOpen(true)} aria-label="Chat history"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-muted hover:bg-card-elev transition-colors">
            <Clock className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <NavTrigger />
        </div>
      </div>

      {/* ── Mobile history sheet ───────────────────────────────────── */}
      <AnimatePresence>
        {mobileHistoryOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end" aria-modal="true" role="dialog">
            <motion.div className="absolute inset-0 bg-ink/50"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setMobileHistoryOpen(false)} />
            <motion.div className="relative z-10 bg-card rounded-t-[26px] px-5 pt-3"
              style={{ paddingBottom: "max(env(safe-area-inset-bottom), 2rem)", maxHeight: "70dvh" }}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}>
              <div className="w-9 h-1 rounded-full bg-border mx-auto mb-4" />
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[15px] font-bold text-text">Chats</h3>
                <button type="button" onClick={() => { newChat(); setMobileHistoryOpen(false); }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-card-elev border border-border px-3 py-1.5 text-[12px] font-semibold text-text">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} /> New chat
                </button>
              </div>
              <div className="overflow-y-auto space-y-0.5 no-scrollbar" style={{ maxHeight: "50dvh" }}>
                {sessions.length === 0 && <p className="text-[13px] text-text-muted py-4 text-center">No previous chats yet.</p>}
                {sessions.map((s) => (
                  <div key={s.id} className={cn("group flex items-center gap-1 rounded-[12px] transition-colors", s.id === activeSessionId ? "bg-card-elev" : "hover:bg-card-elev")}>
                    <button type="button" onClick={() => { loadSession(s.id); setMobileHistoryOpen(false); }} className="flex-1 text-left px-3 py-2.5 min-w-0">
                      <div className="text-[14px] font-medium text-text truncate">{s.title}</div>
                      <div className="text-[11px] text-text-subtle mt-0.5">{new Date(s.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                    </button>
                    <button type="button" onClick={() => deleteSession({ id: s.id })} aria-label="Delete"
                      className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full text-text-subtle hover:text-bubblegum transition-colors">
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Desktop sidebar strip ─────────────────────────────────── */}
      <div
        className="hidden lg:flex shrink-0 flex-col border-r border-border bg-bg overflow-hidden transition-[width] duration-200 ease-in-out z-10"
        style={{
          width: panelOpen ? 220 : 48,
          paddingTop: "max(env(safe-area-inset-top), 1rem)",
        }}
      >
        {/* Toggle button */}
        <div className="flex items-center px-1 pt-4 pb-2 shrink-0 justify-center">
          <button
            type="button"
            onClick={() => setPanelOpen((o) => !o)}
            aria-label="Toggle chat history"
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors shrink-0",
              panelOpen ? "bg-card-elev text-text border-border-strong" : "border-border text-text-muted hover:bg-card-elev",
            )}
          >
            <PanelLeft className="h-4 w-4" strokeWidth={1.75} />
          </button>
          {panelOpen && <span className="ml-2 flex-1 text-[13px] font-bold text-text whitespace-nowrap overflow-hidden">Chats</span>}
        </div>

        {/* New chat button */}
        <div className="flex items-center px-1 pb-3 shrink-0 justify-center">
          <button
            type="button"
            onClick={newChat}
            aria-label="New chat"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-muted hover:bg-card-elev transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
          </button>
          {panelOpen && <span className="ml-2 flex-1 text-[13px] font-semibold text-text whitespace-nowrap overflow-hidden">New chat</span>}
        </div>

        {panelOpen && (
          <div className="flex flex-col gap-2 flex-1 overflow-hidden px-3">
            <div className="flex-1 overflow-y-auto space-y-0.5 no-scrollbar">
              {sessions.length === 0 && <p className="text-[12px] text-text-muted px-2 py-3">No previous chats yet.</p>}
              {sessions.map((s) => (
                <div key={s.id} className={cn("group flex items-center gap-1 rounded-[10px] transition-colors", s.id === activeSessionId ? "bg-card-elev" : "hover:bg-card-elev")}>
                  <button type="button" onClick={() => loadSession(s.id)} className="flex-1 text-left px-3 py-2 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {(s as any).isHome && (
                        <span className="shrink-0 inline-flex items-center rounded-full bg-lavender/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-lavender">Home</span>
                      )}
                      <div className="text-[12px] font-medium text-text truncate">{s.title}</div>
                    </div>
                    <div className="text-[10px] text-text-subtle">{new Date(s.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                  </button>
                  <button type="button" onClick={() => deleteSession({ id: s.id })} aria-label="Delete"
                    className="opacity-0 group-hover:opacity-100 mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-text-subtle hover:text-bubblegum transition-colors">
                    <Trash2 className="h-3 w-3" strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Chat column ───────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-3 px-4 lg:px-8 py-4 [mask-image:linear-gradient(to_bottom,transparent_0,black_14px,black_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_14px,black_100%)]">
          {messages.map((m, i) => {
            if (m.kind === "draft") {
              if (m.settled) return null;
              return (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="pl-9">
                  <LogConfirmCard draft={m.draft} onConfirm={(d) => handleConfirm(m.id, d, m.confirmReply)} onDiscard={() => handleDiscard(m.id, m.discardReply)} />
                </motion.div>
              );
            }
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <MessageBubble
                  role={m.role === "assistant" ? "ai" : "user"}
                  content={m.text}
                  fresh={i === lastTextIdx && !!m.streamed}
                  onEdit={m.role === "user" ? () => { setInput(m.text); inputRef.current?.focus(); } : undefined}
                  badge={m.role === "assistant" && m.agent && m.agent !== "main" ? <AgentBadge agent={m.agent} /> : undefined}
                />
              </motion.div>
            );
          })}
          {thinking && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
              <ThinkingBubble />
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestion chips */}
        {!hasUserMsg && (
          <div className="flex flex-wrap gap-1.5 px-4 lg:px-8 py-2 shrink-0">
            {orderedSuggestions.map((s) => (
              <button key={s} type="button" onClick={() => { recordSuggestion(s); void send(s); }}
                className="inline-flex items-center gap-1.5 rounded-full bg-card shadow-[var(--shadow-soft)] px-3 py-1.5 text-[12px] font-bold text-text hover:bg-card-elev transition-colors">
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", SUGGESTION_DOT[s] ?? "bg-lavender")} />
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Image attachment preview */}
        <AnimatePresence>
          {attachedImage && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="shrink-0 flex px-4 lg:px-8 py-2">
              <div className="relative">
                <img src={attachedImage} alt="Attached" className="h-20 w-20 rounded-xl object-cover border border-border" />
                <button type="button" onClick={() => setAttachedImage(null)} aria-label="Remove image"
                  className="absolute -top-2 -right-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-text-on-ink shadow-[var(--shadow-elev)]">
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <div className="shrink-0 px-4 lg:px-8 pt-2"
          style={{ paddingBottom: kbPad > 0 ? `${kbPad}px` : "max(env(safe-area-inset-bottom), 1rem)", background: "linear-gradient(to top, var(--color-bg) 80%, transparent)" }}>
          <div className={cn("flex items-center gap-1.5 rounded-full bg-card border px-3 py-2 shadow-[var(--shadow-float)] transition-colors",
            voice.recording ? "border-peach" : attachedImage ? "border-lavender" : "border-transparent focus-within:border-lavender/40")}>

            {/* Attachment menu — left */}
            <div className="relative shrink-0">
              <button type="button" aria-label="Add" onClick={() => setMoreMenuOpen((o) => !o)} onBlur={() => setTimeout(() => setMoreMenuOpen(false), 120)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-card-elev transition-colors">
                <Plus className="h-4 w-4" strokeWidth={2} />
              </button>
              <AnimatePresence>
                {moreMenuOpen && (
                  <motion.div initial={{ opacity: 0, y: 4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.96 }}
                    transition={{ duration: 0.12 }}
                    className="absolute bottom-full mb-2 left-0 w-44 rounded-2xl bg-card border border-border shadow-[var(--shadow-elev)] py-1 z-20">
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); fileRef.current?.click(); setMoreMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-text hover:bg-card-elev">
                      <ImagePlus className="h-4 w-4" strokeWidth={1.75} /> Photo / camera
                    </button>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); setBarcodeOpen(true); setMoreMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-text hover:bg-card-elev">
                      <Barcode className="h-4 w-4" strokeWidth={1.75} /> Scan barcode
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={voice.recording ? "Listening…" : voice.transcribing ? "Transcribing…" : "Ask Stry anything…"}
              disabled={voice.recording || voice.transcribing}
              aria-label="Message Stry"
              className="min-w-0 flex-1 resize-none overflow-y-auto bg-transparent text-[13px] lg:text-[0.95rem] text-text placeholder:text-text-subtle focus:outline-none py-1 disabled:opacity-50 max-h-[120px]"
              style={{ lineHeight: "1.5" }}
            />

            {/* Voice — hidden on mobile when typing */}
            <button type="button" aria-label={voice.recording ? "Stop" : "Voice"} onClick={() => voice.recording ? voice.stop() : voice.start()}
              disabled={voice.transcribing}
              className={cn("h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-50 shrink-0",
                input.trim() ? "hidden lg:inline-flex" : "inline-flex",
                voice.recording ? "bg-peach text-ink" : "text-text-muted hover:bg-card-elev")}>
              {voice.transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> :
                voice.recording ? <MicOff className="h-4 w-4" strokeWidth={1.75} /> :
                <Mic className="h-4 w-4" strokeWidth={1.75} />}
            </button>

            <motion.button type="button" aria-label="Send"
              onClick={() => { void send(input, attachedImage ?? undefined); if (inputRef.current) inputRef.current.style.height = "auto"; }}
              disabled={(!input.trim() && !attachedImage) || thinking}
              animate={{ scale: (input.trim() || attachedImage) ? 1 : 0.88, opacity: (input.trim() || attachedImage) ? 1 : 0.45 }}
              transition={SPRING}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-text-on-ink disabled:cursor-not-allowed">
              <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
