import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  User,
  Send,
  Trash2,
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { Id } from "../../../backend/convex/_generated/dataModel";
import { VoiceInputButton } from "../VoiceInputButton";
import { TypingIndicator } from "../ui/AnimatedComponents";
import { springs, chatBubbleIn } from "../../lib/animations";

interface AICoachTabProps {
  sessions: any[];
  activeSessionId: Id<"chat_sessions"> | null;
  setActiveSessionId: (id: Id<"chat_sessions"> | null) => void;
  sessionMessages: { role: string; content: string; coachType?: string }[];
  coaches: any[];
  selectedCoach: string;
  setSelectedCoach: (id: string) => void;
  chatInput: string;
  setChatInput: (val: string) => void;
  chatLoading: boolean;
  chatError: string;
  onSendChat: () => Promise<void>;
  onNewSession: () => Promise<void>;
  onDeleteSession: (id: Id<"chat_sessions">, e: React.MouseEvent) => Promise<void>;
  markdownComponents: any;
  getContextualPrompts: () => string[];
}

export default function AICoachTab({
  sessions,
  activeSessionId,
  setActiveSessionId,
  sessionMessages,
  coaches,
  selectedCoach,
  setSelectedCoach,
  chatInput,
  setChatInput,
  chatLoading,
  chatError,
  onSendChat,
  onNewSession,
  onDeleteSession,
  markdownComponents,
  getContextualPrompts,
}: AICoachTabProps) {
  const [sessionsPanelOpen, setSessionsPanelOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessionMessages]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (sidebarResizeRef.current) {
        const dx = e.clientX - sidebarResizeRef.current.startX;
        const newWidth = Math.min(400, Math.max(200, sidebarResizeRef.current.startWidth + dx));
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      sidebarResizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleChatInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    if (chatInputRef.current) {
      chatInputRef.current.style.height = 'auto';
      chatInputRef.current.style.height = Math.min(chatInputRef.current.scrollHeight, 150) + 'px';
    }
  };

  return (
    <motion.div
      key="ai-coach-tab"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex-1 min-h-0 flex overflow-hidden will-change-transform"
      data-testid="ai-coach-tab"
    >
      <motion.div
        animate={{ width: sessionsPanelOpen ? sidebarWidth : 0 }}
        transition={springs.snappy}
        className="shrink-0 border-r border-[var(--border-default)] flex flex-col overflow-hidden bg-[var(--bg-card)]"
      >
        <div className="p-3 border-b border-[var(--border-default)] flex items-center justify-between" style={{ minWidth: 180 }}>
          <span className="text-xs font-mono uppercase tracking-wider">Chats</span>
          <div className="flex items-center gap-1">
            <motion.button
              data-testid="new-chat-btn"
              onClick={onNewSession}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-1.5 border border-[var(--border-default)] hover:bg-accent hover:text-[var(--theme-primary-text)] transition-colors"
            >
              <MessageSquarePlus size={14} />
            </motion.button>
            <motion.button
              onClick={() => setSessionsPanelOpen(false)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-1.5 border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
              <PanelLeftClose size={14} />
            </motion.button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence>
            {sessions.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-4 text-xs font-mono text-[var(--text-muted)] tracking-wide"
              >
                No chats yet
              </motion.div>
            )}
          </AnimatePresence>
          {sessions.map((s, idx) => (
            <motion.button
              key={s.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03, ...springs.snappy }}
              whileHover={{ x: 4, backgroundColor: "var(--bg-elevated)" }}
              onClick={() => setActiveSessionId(s.id)}
              className={`w-full text-left px-3 py-3 border-b border-[var(--border-default)] text-xs font-mono transition-colors group ${activeSessionId === s.id ? "bg-[var(--bg-elevated)] border-l-2 border-l-accent" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="truncate tracking-wide flex-1">{s.title}</div>
                <motion.span
                  onClick={(e) => onDeleteSession(s.id, e)}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ scale: 1.2, color: "#f87171" }}
                  className="opacity-0 group-hover:opacity-100 p-1 transition-opacity"
                >
                  <Trash2 size={12} />
                </motion.span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{new Date(s.updatedAt).toLocaleDateString()}</div>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {sessionsPanelOpen && (
        <div
          className="w-1 shrink-0 bg-[var(--border-default)] hover:bg-accent transition-colors cursor-col-resize"
          onMouseDown={(e) => { sidebarResizeRef.current = { startX: e.clientX, startWidth: sidebarWidth }; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--bg-main)]">
        <div className="shrink-0 px-5 py-4 border-b border-[var(--border-default)] flex items-center gap-3 bg-[var(--bg-card)]">
          <AnimatePresence>
            {!sessionsPanelOpen && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setSessionsPanelOpen(true)}
                className="p-2 border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-colors"
              >
                <PanelLeftOpen size={14} />
              </motion.button>
            )}
          </AnimatePresence>
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            transition={springs.bouncy}
            className="w-12 h-12 bg-accent flex items-center justify-center shadow-brutal-sm"
          >
            <Bot size={24} className="text-[var(--theme-primary-text)]" strokeWidth={2} />
          </motion.div>
          <div className="flex-1 min-w-0">
            <div className="font-heading text-xl uppercase tracking-normal">Stride Coach</div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-accent">
              <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
              {selectedCoach === "auto"
                ? "AUTO \u2022 Routing to the best coach"
                : coaches.find((c: any) => c.id === selectedCoach)?.tagline || "ONLINE \u2022 Ready to help"}
            </div>
          </div>
          {coaches.length > 0 && (
            <div className="hidden sm:flex items-center gap-1">
              {coaches.map((coach: any) => (
                <button
                  key={coach.id}
                  onClick={() => setSelectedCoach(coach.id)}
                  className={`px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-all ${
                    selectedCoach === coach.id
                      ? 'bg-accent text-[var(--theme-primary-text)]'
                      : 'border border-[var(--border-default)] hover:border-accent text-[var(--text-secondary)]'
                  }`}
                  title={coach.tagline}
                >
                  {coach.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <AnimatePresence mode="popLayout">
            {sessionMessages.length === 0 && (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={springs.smooth}
                className="text-center py-16"
              >
                <Bot size={64} className="mx-auto mb-4 text-accent opacity-60" />
                <div className="font-heading text-2xl uppercase mb-2 tracking-normal">
                  How can I help?
                </div>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-sm text-[var(--text-muted)] max-w-md mx-auto leading-relaxed tracking-wide"
                >
                  Describe your meals or workouts and I'll log them for you. Ask me about nutrition, fitness advice, or your progress!
                </motion.p>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-wrap gap-2 justify-center mt-6"
                >
                  {getContextualPrompts().map((suggestion, idx) => (
                    <motion.button
                      key={suggestion}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4 + idx * 0.05 }}
                      whileHover={{ scale: 1.05, borderColor: "var(--theme-primary)" }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setChatInput(suggestion)}
                      className="px-3 py-2 border border-[var(--border-default)] text-xs font-mono hover:border-accent hover:text-accent transition-colors tracking-wide"
                    >
                      {suggestion}
                    </motion.button>
                  ))}
                </motion.div>
              </motion.div>
            )}

            {sessionMessages.map((msg, i) => (
              <motion.div
                key={`msg-${i}`}
                variants={chatBubbleIn}
                initial="initial"
                animate="animate"
                layout
                className={`flex ${msg.role === "ai" ? "justify-start" : "justify-end"}`}
              >
                {msg.role === "ai" && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={springs.bouncy}
                    className="w-9 h-9 bg-accent flex items-center justify-center shrink-0 mr-3 mt-1 shadow-brutal-sm"
                  >
                    <Bot size={18} className="text-[var(--theme-primary-text)]" />
                  </motion.div>
                )}
                <div className={`max-w-[70%] ${msg.role === "ai" ? "space-y-1" : ""}`}>
                  {msg.role === "ai" && msg.coachType && msg.coachType !== "overall" && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-[10px] font-mono uppercase tracking-wider text-accent"
                    >
                      {coaches.find((c: any) => c.id === msg.coachType)?.name || msg.coachType}
                    </motion.div>
                  )}
                  <div className={`px-4 py-3 text-sm leading-relaxed tracking-wide ${
                    msg.role === "ai"
                      ? "bg-[var(--bg-card)] border border-[var(--border-default)] shadow-sm"
                      : "bg-accent text-[var(--theme-primary-text)] shadow-brutal-sm"
                  }`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
                {msg.role === "human" && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={springs.bouncy}
                    className="w-9 h-9 bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center justify-center shrink-0 ml-3 mt-1"
                  >
                    <User size={18} />
                  </motion.div>
                )}
              </motion.div>
            ))}

            {chatLoading && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={springs.snappy}
                className="flex justify-start"
              >
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-9 h-9 bg-accent flex items-center justify-center shrink-0 mr-3 shadow-brutal-sm"
                >
                  <Bot size={18} className="text-[var(--theme-primary-text)]" />
                </motion.div>
                <div className="bg-[var(--bg-card)] border border-[var(--border-default)] px-5 py-4 shadow-sm">
                  <TypingIndicator />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={chatEndRef} />
        </div>

        <div className="shrink-0 p-4 border-t border-[var(--border-default)] bg-[var(--bg-card)]">
          <AnimatePresence>
            {chatError && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="mb-2 text-xs font-mono text-red-400 tracking-wide overflow-hidden"
              >
                {chatError}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-end gap-3">
            <motion.div className="flex-1" whileFocus={{ scale: 1.01 }}>
              <textarea
                ref={chatInputRef}
                data-testid="chat-input"
                value={chatInput}
                onChange={handleChatInputChange}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSendChat(); } }}
                placeholder="Describe a meal, log a workout, or ask anything..."
                rows={1}
                className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent focus:shadow-[0_0_0_2px_var(--theme-primary)] placeholder:text-[var(--text-muted)] resize-none min-h-[48px] max-h-[150px] leading-relaxed tracking-wide transition-all"
                style={{ height: 'auto' }}
              />
            </motion.div>
            <VoiceInputButton
              value={chatInput}
              onChange={setChatInput}
              className="h-[48px]"
            />
            <motion.button
              data-testid="send-chat-btn"
              onClick={onSendChat}
              disabled={chatLoading || !chatInput.trim()}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={springs.snappy}
              className="px-5 py-3 bg-accent text-[var(--theme-primary-text)] font-mono font-bold transition-all disabled:opacity-50 h-[48px] shadow-brutal-sm disabled:shadow-none"
            >
              <AnimatePresence mode="wait">
                {chatLoading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, rotate: 0 }}
                    animate={{ opacity: 1, rotate: 360 }}
                    exit={{ opacity: 0 }}
                    transition={{ rotate: { duration: 1, repeat: Infinity, ease: "linear" } }}
                  >
                    <Loader2 size={18} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="send"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                  >
                    <Send size={18} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-[10px] font-mono text-[var(--text-muted)] mt-2 tracking-wide"
          >
            Press Enter to send, Shift+Enter for new line
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
