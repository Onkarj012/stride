import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUp, Mic, MicOff, RotateCcw, Plus, ChevronLeft, Copy, Check, Trash2, Pencil, Camera, Barcode, ImagePlus, X, Loader2 } from "lucide-react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { LogConfirmCard } from "@/components/coach/LogConfirmCard";
import { BarcodeModal } from "@/components/coach/BarcodeModal";
import { VoxelAgent } from "@/components/voxel/VoxelAgent";
import { AgentBadge } from "@/components/insights/AgentBadge";
import { Markdown } from "@/components/primitives/Markdown";
import { useLogs } from "@/hooks/useLogs";
import { usePrefs } from "@/hooks/usePrefs";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useToast } from "@/context/ToastContext";
import { recordSuggestion, orderSuggestions } from "@/lib/behavior";
import { todaySuggestions, coachingPersonalities, DRAFT_TRIGGERS } from "@/data/mock";
import type { LogDraft, MealDraft, WorkoutDraft } from "@/data/mock";
import type { Agent, CoachingStyle } from "@/lib/storage";
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

/* ── Assistant bubble — renders markdown immediately, no typewriter ── */
function AssistantBubble({ text, agent }: { text: string; agent?: Agent; isLast: boolean }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-start gap-2.5 max-w-[85%] group">
      <div className="shrink-0 w-7 h-7 mt-1 rounded-full overflow-hidden border border-border bg-card-elev relative">
        <div style={{ position: "absolute", top: -14, left: -14, width: 56, height: 56 }}>
          <VoxelAgent agent={agent ?? "main"} size={56} />
        </div>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        <div className="rounded-2xl rounded-bl-sm bg-card border border-border px-4 py-2.5 text-text">
          <Markdown>{text}</Markdown>
        </div>
        <div className="flex items-center gap-3 ml-1">
          {agent && agent !== "main" && <AgentBadge agent={agent} />}
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-mint" strokeWidth={2.5} /> : <Copy className="h-3 w-3" strokeWidth={2} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserBubble({ text, onEdit }: { text: string; onEdit: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1 max-w-[85%]">
      <div className="rounded-2xl rounded-br-sm bg-ink text-text-on-ink px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
      <div className="flex items-center gap-3 mr-1">
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-mint" strokeWidth={2.5} /> : <Copy className="h-3 w-3" strokeWidth={2} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text transition-colors"
        >
          <Pencil className="h-3 w-3" strokeWidth={2} />
          Edit
        </button>
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex items-start gap-2.5">
      <div className="shrink-0 w-7 h-7 mt-1 rounded-full overflow-hidden border border-border bg-card-elev relative">
        <div style={{ position: "absolute", top: -14, left: -14, width: 56, height: 56 }}>
          <VoxelAgent agent="main" size={56} />
        </div>
      </div>
      <div className="rounded-2xl rounded-bl-sm bg-card border border-border px-4 py-3 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div key={i} className="h-1.5 w-1.5 rounded-full bg-lavender"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Session list (slide-in panel) ── */


/* ── Main page ── */
export function CoachPage() {
  const { prefs, update } = usePrefs();
  const style = prefs.coachingStyle;

  const sessions = useQuery(api.chat.getSessions) ?? [];
  const createSession = useMutation(api.chat.createSession);
  const deleteSession = useMutation(api.chat.deleteSession);
  const sendToAI = useAction(api.ai.chat);
  const toast = useToast();

  const [activeSessionId, setActiveSessionId] = useState<Id<"chat_sessions"> | null>(null);
  const convexMessages = useQuery(api.chat.getMessages, activeSessionId ? { sessionId: activeSessionId } : "skip");

  const [messages, setMessages] = useState<Message[]>(() => [
    { kind: "text", id: "init", role: "assistant", text: GREETING[style], streamed: true },
  ]);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(true); // open by default
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  // Pending hydration: set when the user navigates to an existing session via
  // the sidebar. The hydration effect waits for convexMessages to load, then
  // replaces local state once. We can't react to (activeSessionId, convexMessages)
  // unconditionally because the in-place send flow ALSO updates convexMessages
  // (via persisted user/AI messages) and we don't want that to overwrite the
  // optimistic local state with a typewriter mid-flight.
  const pendingHydrateRef = useRef<Id<"chat_sessions"> | null>(null);
  const { add } = useLogs();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  /* ── Voice (Groq Whisper) ── */
  const onTranscript = useCallback((t: string) => {
    setInput((prev) => (prev ? `${prev} ${t}` : t).trim());
  }, []);
  const voice = useAudioRecorder(onTranscript);

  /* ── Image attachment ── */
  const onPickImage = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Not an image", "Please choose an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAttachedImage(reader.result as string);
    reader.readAsDataURL(file);
  }, [toast]);

  /* ── Cmd+V image paste ── */
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

  // Hydrate messages when loading a session. Only runs when the user
  // explicitly navigates via the sidebar (pendingHydrateRef === activeSessionId).
  // This prevents the new-session create-on-send flow from overwriting the
  // optimistic local state with the persisted DB copy.
  useEffect(() => {
    if (!activeSessionId) return;
    if (pendingHydrateRef.current !== activeSessionId) return;
    if (!convexMessages) return; // still loading
    const hydrated: Message[] = convexMessages.map((m, i) => ({
      kind: "text" as const, id: `cx-${i}`,
      role: m.role === "ai" ? "assistant" as const : "user" as const, text: m.content, streamed: false,
    }));
    setMessages(hydrated.length > 0 ? hydrated : [{ kind: "text", id: "init", role: "assistant", text: GREETING[style], streamed: true }]);
    pendingHydrateRef.current = null;
    // Auto-scroll to bottom of newly-loaded thread
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, convexMessages]);

  /** User clicked an old chat in the sidebar — request hydration. */
  const loadSession = useCallback((id: Id<"chat_sessions">) => {
    if (id === activeSessionId) {
      // Already on this session; if they tapped it again, just close the panel.
      setPanelOpen(false);
      return;
    }
    pendingHydrateRef.current = id;
    setActiveSessionId(id);
    // Show a placeholder while we wait for messages so it's clear something
    // happened. The hydrate effect will replace this momentarily.
    setMessages([{ kind: "text", id: "loading", role: "assistant", text: "Loading…", streamed: false }]);
  }, [activeSessionId]);

  const scroll = useCallback(() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50), []);

  const newChat = useCallback(() => {
    pendingHydrateRef.current = null;
    setActiveSessionId(null);
    setMessages([{ kind: "text", id: "init", role: "assistant", text: GREETING[style], streamed: true }]);
    setPanelOpen(false);
  }, [style]);

  const orderedSuggestions = useMemo(() => orderSuggestions(todaySuggestions), []);
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
    const v = text.trim();
    if (!v && !image) return;
    setInput("");
    setAttachedImage(null);
    setMessages((prev) => [...prev, { kind: "text", id: `u-${Date.now()}`, role: "user", text: v || "[image]" }]);
    scroll();

    const trigger = !image ? DRAFT_TRIGGERS[v.toLowerCase()] : undefined;
    if (trigger) {
      setThinking(true);
      setTimeout(() => {
        setThinking(false);
        const intro = trigger.draft.kind === "meal" ? "I've estimated the macros. Does this look right?" : "I've logged your workout. Does this look right?";
        setMessages((prev) => [
          ...prev,
          { kind: "text", id: `a-${Date.now()}`, role: "assistant", text: intro, streamed: true },
          { kind: "draft", id: `d-${Date.now() + 1}`, draft: trigger.draft, confirmReply: trigger.confirmReply, discardReply: trigger.discardReply, settled: false },
        ]);
        scroll();
      }, 1200);
      return;
    }

    setThinking(true);
    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const result = await createSession({ title: v.slice(0, 40) || "Image chat" });
        sessionId = result.id;
        setActiveSessionId(sessionId);
      }
      const result = await sendToAI({
        message: v,
        image,
        sessionId,
        coachType: "auto",
        today: localDateStr(),
      });
      const r = result as Record<string, unknown>;
      const reply = typeof r.reply === "string" ? r.reply : String(result);
      const coachType = typeof r.coachType === "string" ? r.coachType : undefined;
      const agent = coachToAgent(coachType);
      const loggedItem = (r.loggedItem && typeof r.loggedItem === "object" && "type" in (r.loggedItem as object))
        ? r.loggedItem as { type: string; data: any }
        : undefined;

      setThinking(false);
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
    } catch {
      setThinking(false);
      setMessages((prev) => [...prev, { kind: "text", id: `a-${Date.now()}`, role: "assistant", text: "Sorry, couldn't reach the AI right now. Please try again.", streamed: false }]);
      toast.error("Couldn't reach Stry", "Check your connection or try again");
    }
  }, [activeSessionId, createSession, sendToAI, scroll, toast]);

  return (
    <div className="flex h-[calc(100dvh-2rem)] lg:h-[calc(100dvh-2rem)] w-full -mx-4 lg:-mx-10 lg:-my-10 px-0">

      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) onPickImage(file); e.target.value = ""; }} />

      {/* Barcode modal */}
      <BarcodeModal open={barcodeOpen} onClose={() => setBarcodeOpen(false)} />

      {/* LEFT: Session sidebar */}
      <AnimatePresence initial={false}>
        {panelOpen && (
          <motion.div
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 220, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="shrink-0 flex flex-col gap-2 overflow-hidden border-r border-border px-3"
          >
            <div className="flex items-center justify-between pt-3 pb-2">
              <span className="text-[13px] font-bold text-text">Chats</span>
            </div>
            <button type="button" onClick={newChat}
              className="flex items-center gap-2 rounded-[12px] border border-border bg-card px-3 py-2.5 text-[13px] font-semibold text-text hover:bg-card-elev transition-colors">
              <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} /> New chat
            </button>
            <div className="flex-1 overflow-y-auto space-y-0.5 no-scrollbar">
              {sessions.length === 0 && <p className="text-[12px] text-text-muted px-2 py-3">No previous chats yet.</p>}
              {sessions.map((s) => (
                <div key={s.id} className={cn("group flex items-center gap-1 rounded-[10px] transition-colors", s.id === activeSessionId ? "bg-card-elev" : "hover:bg-card-elev")}>
                  <button type="button" onClick={() => loadSession(s.id)} className="flex-1 text-left px-3 py-2 min-w-0">
                    <div className="text-[12px] font-medium text-text truncate">{s.title}</div>
                    <div className="text-[10px] text-text-subtle">{new Date(s.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                  </button>
                  <button type="button" onClick={() => deleteSession({ id: s.id })} aria-label="Delete"
                    className="opacity-0 group-hover:opacity-100 mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-text-subtle hover:text-bubblegum transition-colors">
                    <Trash2 className="h-3 w-3" strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RIGHT: Chat column */}
      <div className="flex flex-col flex-1 min-w-0 px-4 lg:px-8 py-4 lg:py-6">
        {/* Header — toggle always at left edge */}
        <div className="flex items-center gap-3 pb-3 shrink-0">
          {/* Sidebar toggle — fixed position so it never moves */}
          <button type="button" onClick={() => setPanelOpen((o) => !o)} aria-label="Toggle chat history"
            className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors shrink-0",
              panelOpen ? "bg-card-elev text-text border-border-strong" : "border-border text-text-muted hover:bg-card-elev")}>
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
              <line x1="2" y1="4" x2="14" y2="4" /><line x1="2" y1="8" x2="10" y2="8" /><line x1="2" y1="12" x2="12" y2="12" />
            </svg>
          </button>

          {/* Stry avatar */}
          <div className="shrink-0 w-9 h-9 rounded-full overflow-hidden border border-border bg-card-elev relative">
            <div style={{ position: "absolute", top: -18, left: -18, width: 72, height: 72 }}>
              <VoxelAgent agent="main" size={72} />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-extrabold text-text leading-none">Stry</p>
            <p className="text-[11px] text-text-muted mt-0.5">Your AI wellness coach</p>
          </div>

          {/* Style picker */}
          <div className="flex items-center gap-0.5 rounded-full bg-card-elev border border-border p-0.5" role="radiogroup">
            {coachingPersonalities.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={style === p.id}
                onClick={() => update({ coachingStyle: p.id })}
                className={cn("rounded-full px-2 py-1 text-[11px] font-semibold transition-colors",
                  style === p.id ? "bg-ink text-text-on-ink" : "text-text-muted hover:text-text")}>
                {p.label}
              </button>
            ))}
          </div>

          {messages.length > 1 && (
            <button type="button" onClick={newChat} aria-label="New chat"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-muted hover:bg-card-elev transition-colors">
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pb-2">
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
                {m.role === "assistant"
                  ? <AssistantBubble text={m.text} agent={m.agent} isLast={i === lastTextIdx && !!m.streamed} />
                  : <UserBubble text={m.text} onEdit={() => { setInput(m.text); inputRef.current?.focus(); }} />}
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
          <div className="flex flex-wrap gap-1.5 py-2 shrink-0">
            {orderedSuggestions.map((s) => (
              <button key={s} type="button" onClick={() => { recordSuggestion(s); send(s); }}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-text-muted hover:text-text hover:bg-card-elev transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Image attachment preview */}
        <AnimatePresence>
          {attachedImage && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="shrink-0 flex justify-start py-2">
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
        <form onSubmit={(e) => { e.preventDefault(); send(input, attachedImage ?? undefined); }}
          className={cn("shrink-0 flex items-center gap-1.5 rounded-full bg-card border pl-4 pr-1.5 py-1.5 transition-colors",
            voice.recording ? "border-peach" : attachedImage ? "border-lavender" : "border-border-strong focus-within:border-lavender")}>
          <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
            placeholder={voice.recording ? "Listening…" : voice.transcribing ? "Transcribing…" : attachedImage ? "Add a note (optional)…" : "Ask Stry, paste an image, or speak…"}
            disabled={voice.recording || voice.transcribing}
            aria-label="Message Stry"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-text placeholder:text-text-subtle focus:outline-none py-1 disabled:opacity-50" />

          {/* Camera + barcode menu */}
          <div className="relative">
            <button type="button" aria-label="Add" onClick={() => setMoreMenuOpen((o) => !o)} onBlur={() => setTimeout(() => setMoreMenuOpen(false), 120)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-card-elev transition-colors">
              <Camera className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <AnimatePresence>
              {moreMenuOpen && (
                <motion.div initial={{ opacity: 0, y: 4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full mb-2 right-0 w-44 rounded-2xl bg-card border border-border shadow-[var(--shadow-elev)] py-1 z-20">
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

          {/* Voice */}
          <button type="button" aria-label={voice.recording ? "Stop" : "Voice"} onClick={() => voice.recording ? voice.stop() : voice.start()}
            disabled={voice.transcribing}
            className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-50",
              voice.recording ? "bg-peach text-ink" : "text-text-muted hover:bg-card-elev")}>
            {voice.transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> :
              voice.recording ? <MicOff className="h-4 w-4" strokeWidth={1.75} /> :
              <Mic className="h-4 w-4" strokeWidth={1.75} />}
          </button>

          <motion.button type="submit" aria-label="Send"
            disabled={(!input.trim() && !attachedImage) || thinking}
            animate={{ scale: (input.trim() || attachedImage) ? 1 : 0.88, opacity: (input.trim() || attachedImage) ? 1 : 0.45 }}
            transition={SPRING}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-text-on-ink disabled:cursor-not-allowed">
            <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
          </motion.button>
        </form>
      </div>
    </div>
  );
}
