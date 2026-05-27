import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUp, Mic, MicOff, RotateCcw, Plus, ChevronLeft, Copy, Check, Trash2, Camera, Barcode, ImagePlus, X, Loader2 } from "lucide-react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { LogConfirmCard } from "@/components/coach/LogConfirmCard";
import { BarcodeModal } from "@/components/coach/BarcodeModal";
import { VoxelAgent } from "@/components/voxel/VoxelAgent";
import { AgentBadge } from "@/components/insights/AgentBadge";
import { useTypewriter } from "@/hooks/useTypewriter";
import { useLogs } from "@/hooks/useLogs";
import { usePrefs } from "@/hooks/usePrefs";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useToast } from "@/context/ToastContext";
import { recordSuggestion, orderSuggestions } from "@/lib/behavior";
import { todaySuggestions, coachingPersonalities, DRAFT_TRIGGERS } from "@/data/mock";
import type { LogDraft, MealDraft, WorkoutDraft } from "@/data/mock";
import type { Agent, CoachingStyle } from "@/lib/storage";
import { cn } from "@/lib/utils";

function coachToAgent(coachType?: string): Agent {
  switch (coachType) {
    case "diet": return "diet";
    case "workout": return "workout";
    case "recovery": return "sleep";
    case "mindset": return "habit";
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

/* ── Streaming assistant bubble ── */
function AssistantBubble({ text, agent, isLast }: { text: string; agent?: Agent; isLast: boolean }) {
  const { displayed, done } = useTypewriter(text, 18, isLast);
  const content = isLast ? displayed : text;
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-end gap-2.5 max-w-[85%] group">
      <div className="shrink-0 w-7 h-7 rounded-full overflow-hidden border border-border bg-card-elev relative">
        <div style={{ position: "absolute", top: -14, left: -14, width: 56, height: 56 }}>
          <VoxelAgent agent={agent ?? "main"} size={56} />
        </div>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        <div className="rounded-2xl rounded-bl-sm bg-card border border-border px-4 py-2.5 text-[14px] leading-relaxed text-text">
          {content}
          {isLast && !done && <span className="ml-0.5 inline-block h-3.5 w-0.5 align-middle animate-pulse bg-lavender" />}
        </div>
        <div className="flex items-center gap-2 ml-1">
          {agent && agent !== "main" && done && <AgentBadge agent={agent} />}
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text"
          >
            {copied ? <Check className="h-3 w-3 text-mint" strokeWidth={2.5} /> : <Copy className="h-3 w-3" strokeWidth={2} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="self-end max-w-[85%]">
      <div className="rounded-2xl rounded-br-sm bg-ink text-text-on-ink px-4 py-2.5 text-[14px] leading-relaxed">
        {text}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex items-end gap-2.5">
      <div className="shrink-0 w-7 h-7 rounded-full overflow-hidden border border-border bg-card-elev relative">
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
type ConvexSession = { id: Id<"chat_sessions">; title: string; updatedAt: number };

function SessionPanel({ sessions, activeId, onNew, onLoad, onDelete }: {
  sessions: ConvexSession[]; activeId: Id<"chat_sessions"> | null;
  onNew: () => void; onLoad: (s: ConvexSession) => void;
  onDelete: (id: Id<"chat_sessions">) => void;
}) {
  return (
    <motion.div
      initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      className="absolute inset-y-0 left-0 z-20 w-72 flex flex-col bg-bg border-r border-border shadow-[var(--shadow-elev)]"
    >
      <div className="flex items-center justify-end px-4 py-3 border-b border-border h-[60px]">
        <span className="text-[14px] font-bold text-text mr-auto pl-11">Chats</span>
      </div>
      <button type="button" onClick={onNew}
        className="flex items-center gap-2 mx-3 mt-3 mb-1 rounded-[12px] border border-border bg-card px-3 py-2.5 text-[13px] font-semibold text-text hover:bg-card-elev transition-colors">
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> New chat
      </button>
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5 no-scrollbar">
        {sessions.length === 0 && <p className="text-[12px] text-text-muted px-2 py-4">No previous chats yet.</p>}
        {sessions.map((s) => (
          <div key={s.id} className={cn("group flex items-center gap-1 rounded-[10px] transition-colors", s.id === activeId ? "bg-card-elev" : "hover:bg-card-elev")}>
            <button type="button" onClick={() => onLoad(s)} className="flex-1 text-left px-3 py-2 min-w-0">
              <div className="text-[13px] font-medium text-text truncate">{s.title}</div>
              <div className="text-[11px] text-text-subtle">{new Date(s.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
            </button>
            <button type="button" onClick={() => onDelete(s.id)} aria-label="Delete"
              className="opacity-0 group-hover:opacity-100 mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-text-subtle hover:text-bubblegum transition-colors">
              <Trash2 className="h-3 w-3" strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

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
  const [panelOpen, setPanelOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
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

  // Hydrate messages when loading a session
  useEffect(() => {
    if (!convexMessages || !activeSessionId) return;
    const hydrated: Message[] = convexMessages.map((m, i) => ({
      kind: "text" as const, id: `cx-${i}`,
      role: m.role as "user" | "assistant", text: m.content, streamed: false,
    }));
    setMessages(hydrated.length > 0 ? hydrated : [{ kind: "text", id: "init", role: "assistant", text: GREETING[style], streamed: true }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  const scroll = useCallback(() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50), []);

  const newChat = useCallback(() => {
    setActiveSessionId(null);
    setMessages([{ kind: "text", id: "init", role: "assistant", text: GREETING[style], streamed: true }]);
    setPanelOpen(false);
  }, [style]);

  const orderedSuggestions = useMemo(() => orderSuggestions(todaySuggestions), []);
  const hasUserMsg = messages.some((m) => m.kind === "text" && m.role === "user");
  const lastTextIdx = messages.reduce((acc, m, i) => m.kind === "text" ? i : acc, -1);

  const handleConfirm = useCallback((msgId: string, draft: LogDraft, confirmReply: string) => {
    if (draft.kind === "meal") {
      const d = draft as MealDraft;
      add("meal", d.description, { agent: "diet", meal: { kcal: d.kcal, protein: d.protein, carbs: d.carbs, fat: d.fat, items: d.items } });
      toast.success(`Logged: ${d.description}`, `${d.kcal} kcal · ${d.protein}g protein`);
    } else {
      const d = draft as WorkoutDraft;
      add("workout", d.description, { agent: "workout", workout: { type: d.type, duration: d.duration, distance: d.distance, kcal: d.kcal, intensity: d.intensity } });
      toast.success(`Logged workout`, `${d.duration} min · ${d.kcal} kcal`);
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
        today: new Date().toISOString().split("T")[0],
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
    <div className="relative flex flex-col h-[calc(100dvh-2rem)] lg:h-[calc(100dvh-5rem)] max-w-3xl mx-auto overflow-hidden -mx-2 lg:-mx-5 px-2 lg:px-5">

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

      {/* Barcode modal */}
      <BarcodeModal open={barcodeOpen} onClose={() => setBarcodeOpen(false)} />

      {/* Persistent sidebar toggle — same position whether open or closed */}
      <button
        type="button"
        onClick={() => setPanelOpen((o) => !o)}
        aria-label={panelOpen ? "Close chat history" : "Open chat history"}
        className={cn(
          "absolute top-2 left-2 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors",
          panelOpen
            ? "bg-card-elev text-text border border-border-strong"
            : "border border-border bg-card text-text-muted hover:bg-card-elev",
        )}
      >
        {panelOpen ? (
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
            <line x1="2" y1="4" x2="14" y2="4" /><line x1="2" y1="8" x2="10" y2="8" /><line x1="2" y1="12" x2="12" y2="12" />
          </svg>
        )}
      </button>

      {/* Session panel overlay */}
      <AnimatePresence>
        {panelOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 bg-bg/60 backdrop-blur-sm"
              onClick={() => setPanelOpen(false)}
            />
            <SessionPanel
              sessions={sessions} activeId={activeSessionId}
              onNew={newChat}
              onLoad={(s) => { setActiveSessionId(s.id); setPanelOpen(false); }}
              onDelete={(id) => deleteSession({ id })}
            />
          </>
        )}
      </AnimatePresence>

      {/* Header — note: pl-12 to leave space for persistent sidebar toggle */}
      <div className="flex items-center gap-3 pb-3 shrink-0 pl-11">
        {/* Stry avatar — clipped so it never overflows */}
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
                : <UserBubble text={m.text} />}
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
          placeholder={
            voice.recording ? "Listening…" :
            voice.transcribing ? "Transcribing…" :
            attachedImage ? "Add a note (optional)…" :
            "Ask Stry, paste an image, or speak…"
          }
          disabled={voice.recording || voice.transcribing}
          aria-label="Message Stry"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-text placeholder:text-text-subtle focus:outline-none py-1 disabled:opacity-50" />

        {/* Camera + barcode menu */}
        <div className="relative">
          <button type="button" aria-label="Add"
            onClick={() => setMoreMenuOpen((o) => !o)}
            onBlur={() => setTimeout(() => setMoreMenuOpen(false), 120)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-card-elev transition-colors">
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

        {/* Voice */}
        <button type="button" aria-label={voice.recording ? "Stop" : "Voice"}
          onClick={() => voice.recording ? voice.stop() : voice.start()}
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
  );
}
