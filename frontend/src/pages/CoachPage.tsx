import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUp, Mic, Camera, MicOff, RotateCcw, Plus, MessageSquare, Copy, Check, Pencil, Download, Trash2 } from "lucide-react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { SuggestionChip } from "@/components/primitives/SuggestionChip";
import { AgentBadge } from "@/components/insights/AgentBadge";
import { LogConfirmCard } from "@/components/coach/LogConfirmCard";
import { VoxelAgent } from "@/components/voxel/VoxelAgent";
import { useTypewriter } from "@/hooks/useTypewriter";
import { useLogs } from "@/hooks/useLogs";
import { usePrefs } from "@/hooks/usePrefs";
import { useVoice } from "@/hooks/useVoice";
import { recordSuggestion, orderSuggestions } from "@/lib/behavior";
import { todaySuggestions, coachingPersonalities, DRAFT_TRIGGERS } from "@/data/mock";
import type { LogDraft, MealDraft, WorkoutDraft } from "@/data/mock";
import type { Agent, CoachingStyle } from "@/lib/storage";
import { cn } from "@/lib/utils";

/* ── Local message types (UI-only, not persisted to Convex directly) ── */
type TextMessage = { kind: "text"; id: string; role: "user" | "assistant"; text: string; agent?: Agent; streamed?: boolean; edits?: string[] };
type DraftMessage = { kind: "draft"; id: string; draft: LogDraft; confirmReply: string; discardReply: string; settled: boolean };
type PhotoMessage = { kind: "photo"; id: string };
type Message = TextMessage | DraftMessage | PhotoMessage;

const SPRING = { type: "spring", stiffness: 260, damping: 28 } as const;
const EASE = { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

const GREETING_BY_STYLE: Record<CoachingStyle, string> = {
  gentle: "Hey, I'm Stry. No pressure today — just here when you need me. What's on your mind?",
  motivating: "Hey! I'm Stry — your wellness companion. Ready to make today count? Let's get into it!",
  analytical: "Hi, I'm Stry. I'll help you track patterns and surface what matters. What would you like to log first?",
};

/* ── Agent PNG avatar ── */
function AgentAvatar({ agent = "main", size = 36 }: { agent?: Agent; size?: number }) {
  const canvasSize = size * 2;
  const offset = -size / 2;
  return (
    <div
      className="shrink-0 rounded-full overflow-hidden border border-border bg-card-elev relative"
      style={{ width: size, height: size }}
    >
      <div style={{ position: "absolute", top: offset, left: offset, width: canvasSize, height: canvasSize }}>
        <VoxelAgent agent={agent} size={canvasSize} />
      </div>
    </div>
  );
}

/* ── Bubble components ── */
function AssistantBubble({ text, agent, isLast, onCopy }: { text: string; agent?: Agent; isLast: boolean; onCopy: () => void }) {
  const { displayed, done } = useTypewriter(text, 16, isLast);
  const content = isLast ? displayed : text;
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onCopy();
  }

  return (
    <div className="flex items-end gap-2 max-w-[88%] group">
      <AgentAvatar agent={agent} size={32} />
      <div className="flex flex-col gap-1 min-w-0">
        <div className="rounded-[16px] rounded-bl-[4px] bg-card border border-border px-3.5 py-2.5 text-[14px] leading-relaxed text-text shadow-[var(--shadow-elev)]">
          {content}
          {isLast && !done && <span className="ml-0.5 inline-block h-3.5 w-0.5 align-middle animate-pulse bg-lavender" />}
        </div>
        <div className="flex items-center gap-2">
          {agent && done && <AgentBadge agent={agent} className="self-start" />}
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy message"
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

function UserBubble({ text, onEdit }: { text: string; onEdit: (newText: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  function submit() {
    const v = draft.trim();
    if (v && v !== text) onEdit(v);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="self-end max-w-[85%] flex flex-col gap-1.5">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === "Escape") setEditing(false); }}
          className="rounded-[16px] rounded-br-[4px] bg-ink text-text-on-ink px-3.5 py-2.5 text-[14px] leading-relaxed resize-none focus:outline-none w-full min-h-[60px]"
        />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => setEditing(false)} className="text-[11px] text-text-muted hover:text-text">Cancel</button>
          <button type="button" onClick={submit} className="text-[11px] font-semibold text-lavender hover:text-text">Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className="self-end max-w-[85%] flex flex-col items-end gap-1 group">
      <div className="rounded-[16px] rounded-br-[4px] bg-ink text-text-on-ink px-3.5 py-2.5 text-[14px] leading-relaxed">
        {text}
      </div>
      <button
        type="button"
        onClick={() => { setDraft(text); setEditing(true); }}
        aria-label="Edit message"
        className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text"
      >
        <Pencil className="h-3 w-3" strokeWidth={2} />
        Edit
      </button>
    </div>
  );
}

function PhotoBubble() {
  return (
    <div className="self-end max-w-[60%] flex flex-col items-end gap-1">
      <div className="rounded-[16px] rounded-br-[4px] overflow-hidden border border-border">
        <img
          src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80"
          alt="Meal photo"
          className="w-full object-cover max-h-48"
        />
        <div className="bg-ink px-3 py-2 text-[13px] text-text-on-ink">What are the macros for this?</div>
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex items-end gap-2">
      <AgentAvatar agent="main" size={32} />
      <div className="rounded-[16px] rounded-bl-[4px] bg-card border border-border px-3.5 py-3 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-lavender"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Convex session type ── */
type ConvexSession = { id: Id<"chat_sessions">; title: string; updatedAt: number };

/* ── Sidebar session item ── */
function SidebarSession({ session, active, onLoad, onRename, onDelete, onDownload }: {
  session: ConvexSession; active: boolean;
  onLoad: () => void; onRename: (t: string) => void; onDelete: () => void; onDownload: () => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(session.title);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (renaming) {
    return (
      <div className="px-1">
        <input
          autoFocus
          value={renameVal}
          onChange={(e) => setRenameVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onRename(renameVal.trim() || session.title); setRenaming(false); }
            if (e.key === "Escape") setRenaming(false);
          }}
          onBlur={() => { onRename(renameVal.trim() || session.title); setRenaming(false); }}
          className="w-full rounded-[10px] bg-card-elev border border-lavender px-2 py-1 text-[12px] text-text focus:outline-none"
        />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onLoad}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
        className={cn(
          "w-full text-left rounded-[12px] px-3 py-2 text-[12px] transition-colors",
          active ? "bg-card-elev text-text font-semibold" : "text-text-muted hover:bg-card-elev hover:text-text",
        )}
      >
        <div className="truncate">{session.title}</div>
        <div className="text-[10px] text-text-subtle mt-0.5">
          {new Date(session.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
      </button>

      {menu && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menu.y, left: menu.x, zIndex: 50 }}
          className="min-w-[140px] rounded-[14px] bg-card border border-border shadow-[var(--shadow-elev)] py-1 overflow-hidden"
        >
          {[
            { icon: Pencil, label: "Rename", action: () => { setRenaming(true); setMenu(null); } },
            { icon: Download, label: "Download", action: () => { onDownload(); setMenu(null); } },
            { icon: Trash2, label: "Delete", action: () => { onDelete(); setMenu(null); }, danger: true },
          ].map(({ icon: Icon, label, action, danger }) => (
            <button
              key={label}
              type="button"
              onClick={action}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium transition-colors hover:bg-card-elev",
                danger ? "text-bubblegum" : "text-text",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              {label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ── Main page ── */
export function CoachPage() {
  const { prefs, update } = usePrefs();
  const style = prefs.coachingStyle;

  // ── Convex ──
  const sessions = useQuery(api.chat.getSessions) ?? [];
  const createSession = useMutation(api.chat.createSession);
  const deleteSession = useMutation(api.chat.deleteSession);
  const renameSession = useMutation(api.chat.updateSessionTitle);
  const sendToAI = useAction(api.ai.chat);

  const [activeSessionId, setActiveSessionId] = useState<Id<"chat_sessions"> | null>(null);
  const convexMessages = useQuery(
    api.chat.getMessages,
    activeSessionId ? { sessionId: activeSessionId } : "skip",
  );

  // ── Local UI messages (includes draft/photo bubbles not stored in Convex) ──
  const [localMessages, setLocalMessages] = useState<Message[]>(() => [
    { kind: "text", id: "init", role: "assistant", text: GREETING_BY_STYLE[style], streamed: true },
  ]);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { add } = useLogs();
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // When a session is loaded from sidebar, hydrate local messages from Convex
  useEffect(() => {
    if (!convexMessages || !activeSessionId) return;
    const hydrated: Message[] = convexMessages.map((m, i) => ({
      kind: "text" as const,
      id: `convex-${i}`,
      role: m.role as "user" | "assistant",
      text: m.content,
      streamed: false,
    }));
    setLocalMessages(hydrated.length > 0 ? hydrated : [
      { kind: "text", id: "init", role: "assistant", text: GREETING_BY_STYLE[style], streamed: true },
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  const scroll = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const clearChat = useCallback(() => {
    setActiveSessionId(null);
    setLocalMessages([
      { kind: "text", id: "init", role: "assistant", text: GREETING_BY_STYLE[style], streamed: true },
    ]);
  }, [style]);

  const loadSession = useCallback((session: ConvexSession) => {
    setActiveSessionId(session.id);
    setSidebarOpen(false);
  }, []);

  const editMessage = useCallback((id: string, newText: string) => {
    setLocalMessages((prev) => prev.map((m) =>
      m.id === id && m.kind === "text"
        ? { ...m, text: newText, edits: [...((m as TextMessage).edits ?? [(m as TextMessage).text]), newText] }
        : m,
    ));
  }, []);

  const orderedSuggestions = useMemo(
    () => orderSuggestions(todaySuggestions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localMessages.length],
  );

  /* ── Draft confirm / discard ── */
  const handleConfirm = useCallback((msgId: string, draft: LogDraft, confirmReply: string) => {
    if (draft.kind === "meal") {
      const d = draft as MealDraft;
      add("meal", d.description, {
        agent: "diet",
        meal: { kcal: d.kcal, protein: d.protein, carbs: d.carbs, fat: d.fat, items: d.items },
        aiInsight: `AI-parsed: ${d.kcal} kcal, ${d.protein}g protein`,
      });
    } else {
      const d = draft as WorkoutDraft;
      add("workout", d.description, {
        agent: "workout",
        workout: { type: d.type, duration: d.duration, distance: d.distance, kcal: d.kcal, intensity: d.intensity },
        aiInsight: `AI-parsed: ${d.duration} min ${d.type}, ${d.kcal} kcal`,
      });
    }
    setLocalMessages((prev) =>
      prev.map((m) => m.id === msgId && m.kind === "draft" ? { ...m, settled: true } : m),
    );
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setLocalMessages((prev) => [
        ...prev,
        { kind: "text", id: `a-${Date.now()}`, role: "assistant", text: confirmReply, agent: draft.kind === "meal" ? "diet" : "workout", streamed: true },
      ]);
      scroll();
    }, 600);
  }, [add, scroll]);

  const handleDiscard = useCallback((msgId: string, discardReply: string) => {
    setLocalMessages((prev) =>
      prev.map((m) => m.id === msgId && m.kind === "draft" ? { ...m, settled: true } : m),
    );
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setLocalMessages((prev) => [
        ...prev,
        { kind: "text", id: `a-${Date.now()}`, role: "assistant", text: discardReply, streamed: true },
      ]);
      scroll();
    }, 400);
  }, [scroll]);

  /* ── Send ── */
  const send = useCallback(async (text: string) => {
    const v = text.trim();
    if (!v) return;
    setInput("");

    setLocalMessages((prev) => [
      ...prev,
      { kind: "text", id: `u-${Date.now()}`, role: "user", text: v },
    ]);
    scroll();

    // Draft triggers (local, no AI call needed)
    const trigger = DRAFT_TRIGGERS[v.toLowerCase()];
    if (trigger) {
      setThinking(true);
      setTimeout(() => {
        setThinking(false);
        const intro = trigger.draft.kind === "meal"
          ? "I've estimated the macros for that meal. Does this look right?"
          : "I've logged your workout details. Does this look right?";
        setLocalMessages((prev) => [
          ...prev,
          { kind: "text", id: `a-${Date.now()}`, role: "assistant", text: intro, streamed: true },
          { kind: "draft", id: `d-${Date.now() + 1}`, draft: trigger.draft, confirmReply: trigger.confirmReply, discardReply: trigger.discardReply, settled: false },
        ]);
        scroll();
      }, 1400);
      return;
    }

    // Real AI call via Convex action
    setThinking(true);
    try {
      // Create a session on first real message
      let sessionId = activeSessionId;
      if (!sessionId) {
        const result = await createSession({ title: v.slice(0, 40) });
        sessionId = result.id;
        setActiveSessionId(sessionId);
      }

      const result = await sendToAI({
        message: v,
        sessionId,
        coachType: style === "analytical" ? "nutrition" : style === "motivating" ? "fitness" : "general",
        today: new Date().toISOString().split("T")[0],
      });
      const reply = typeof result === "string" ? result : (result as unknown as { reply: string }).reply ?? String(result);

      setThinking(false);
      setLocalMessages((prev) => [
        ...prev,
        { kind: "text", id: `a-${Date.now()}`, role: "assistant", text: reply, agent: "main", streamed: true },
      ]);
      scroll();
    } catch {
      setThinking(false);
      setLocalMessages((prev) => [
        ...prev,
        { kind: "text", id: `a-${Date.now()}`, role: "assistant", text: "Sorry, I couldn't reach the AI right now. Please try again.", streamed: false },
      ]);
    }
  }, [activeSessionId, createSession, sendToAI, style, scroll]);

  const onVoiceResult = useCallback((text: string) => setInput(text), []);
  const voice = useVoice(onVoiceResult);

  const lastTextIdx = localMessages.reduce((acc, m, i) => m.kind === "text" ? i : acc, -1);
  const hasUserMsg = localMessages.some((m) => m.kind === "text" && m.role === "user");

  return (
    <div className="flex h-[calc(100dvh-2rem)] lg:h-[calc(100dvh-5rem)] max-w-5xl mx-auto gap-3">
      {/* History sidebar */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.div
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 220, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="shrink-0 flex flex-col gap-2 overflow-hidden"
          >
            <button type="button" onClick={clearChat} className="flex items-center gap-2 rounded-[14px] border border-border bg-card px-3 py-2.5 text-[13px] font-semibold text-text hover:bg-card-elev transition-colors whitespace-nowrap">
              <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
              New chat
            </button>
            <div className="flex-1 overflow-y-auto space-y-0.5 no-scrollbar">
              {sessions.length === 0 && <p className="text-[12px] text-text-muted px-2 py-3 whitespace-nowrap">No previous chats yet.</p>}
              {sessions.map((s) => (
                <SidebarSession
                  key={s.id}
                  session={s}
                  active={s.id === activeSessionId}
                  onLoad={() => loadSession(s)}
                  onRename={(title) => renameSession({ id: s.id, title })}
                  onDelete={() => deleteSession({ id: s.id })}
                  onDownload={() => {
                    const text = localMessages
                      .filter((m): m is TextMessage => m.kind === "text")
                      .map((m) => `${m.role === "user" ? "You" : "Stry"}: ${m.text}`)
                      .join("\n");
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
                    a.download = `${s.title.slice(0, 30)}.txt`;
                    a.click();
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main chat column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={EASE}
          className="flex items-center gap-3 pb-3"
        >
          <button
            type="button"
            aria-label="Chat history"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full border border-border transition-colors", sidebarOpen ? "bg-card-elev text-text" : "text-text-muted hover:bg-card-elev")}
          >
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.1 }}
          >
            <AgentAvatar agent="main" size={40} />
          </motion.div>
          <div className="flex-1 min-w-0">
            <motion.h1 initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ ...EASE, delay: 0.2 }} className="text-[16px] font-extrabold text-text leading-none">
              Stry
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...EASE, delay: 0.35 }} className="text-[12px] text-text-muted mt-0.5">
              Your AI wellness coach
            </motion.p>
          </div>
          {/* Personality picker */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...EASE, delay: 0.45 }}
            className="flex items-center gap-0.5 rounded-full bg-card-elev border border-border p-0.5"
            role="radiogroup"
            aria-label="Coaching style"
          >
            {coachingPersonalities.map((p) => {
              const active = style === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => update({ coachingStyle: p.id })}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-150",
                    active ? "bg-ink text-text-on-ink" : "text-text-muted hover:text-text",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </motion.div>
          {localMessages.length > 1 && (
            <motion.button
              type="button"
              aria-label="Clear chat"
              onClick={clearChat}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...EASE, delay: 0.5 }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-muted hover:text-text hover:bg-card-elev transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
            </motion.button>
          )}
        </motion.div>

        {/* Conversation */}
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pb-4">
          {localMessages.map((m, i) => {
            if (m.kind === "photo") {
              return (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="flex justify-end">
                  <PhotoBubble />
                </motion.div>
              );
            }
            if (m.kind === "draft") {
              if (m.settled) return null;
              return (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="flex justify-start pl-10">
                  <LogConfirmCard draft={m.draft} onConfirm={(d) => handleConfirm(m.id, d, m.confirmReply)} onDiscard={() => handleDiscard(m.id, m.discardReply)} />
                </motion.div>
              );
            }
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "assistant" ? (
                  <AssistantBubble text={m.text} agent={m.agent} isLast={i === lastTextIdx && !!m.streamed} onCopy={() => {}} />
                ) : (
                  <UserBubble text={m.text} onEdit={(t) => editMessage(m.id, t)} />
                )}
              </motion.div>
            );
          })}
          {thinking && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
              <ThinkingBubble />
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestion chips */}
        {!hasUserMsg && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...EASE, delay: 0.5 }} className="flex flex-wrap gap-1.5 py-2">
            {orderedSuggestions.map((s) => (
              <SuggestionChip key={s} label={s} onClick={() => { recordSuggestion(s); send(s); }} />
            ))}
          </motion.div>
        )}

        {/* Input bar */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...EASE, delay: 0.4 }}
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className={cn(
            "flex items-center gap-1.5 rounded-full bg-card border pl-4 pr-1.5 py-1.5 transition-colors duration-150",
            voice.recording ? "border-peach" : "border-border-strong focus-within:border-lavender",
          )}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={voice.recording ? "Listening…" : "Ask Stry anything…"}
            aria-label="Message Stry"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-text placeholder:text-text-subtle focus:outline-none py-1"
          />
          <button type="button" aria-label={voice.recording ? "Stop" : "Voice"} onClick={() => voice.recording ? voice.stop() : voice.start()}
            className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors", voice.recording ? "bg-peach text-ink" : "text-text-muted hover:bg-card-elev")}>
            {voice.recording ? <MicOff className="h-4 w-4" strokeWidth={1.75} /> : <Mic className="h-4 w-4" strokeWidth={1.75} />}
          </button>
          <button type="button" aria-label="Photo" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-card-elev transition-colors">
            <Camera className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <motion.button type="submit" aria-label="Send" disabled={!input.trim()}
            animate={{ scale: input.trim() ? 1 : 0.88, opacity: input.trim() ? 1 : 0.45 }}
            transition={SPRING}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-text-on-ink disabled:cursor-not-allowed">
            <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
          </motion.button>
        </motion.form>
      </div>
    </div>
  );
}
