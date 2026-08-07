import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Send,
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  CheckCircle2,
} from "lucide-react";
import { useDashboard } from "./context/DashboardContext";

export default function AiCoachPage() {
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    sessionsPanelOpen,
    setSessionsPanelOpen,
    sessionMessages,
    chatLoggedItem,
    sidebarWidth,
    sidebarResizeRef,
    chatInput,
    setChatInput,
    chatLoading,
    chatError,
    chatEndRef,
    handleNewSession,
    handleSendChat,
  } = useDashboard();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 h-full min-h-0 flex overflow-hidden"
    >
      {/* LEFT PANEL: Sessions sidebar */}
      <div
        className="shrink-0 h-full min-h-0 border-r-2 border-black dark:border-gray-700 flex flex-col overflow-hidden transition-[width] duration-200"
        style={{ width: sessionsPanelOpen ? sidebarWidth : 0 }}
      >
        <div
          className="p-3 border-b-2 border-black dark:border-gray-700 flex items-center justify-between shrink-0"
          style={{ minWidth: 160 }}
        >
          <span className="text-xs font-black tracking-wider truncate">
            CONVERSATIONS
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleNewSession}
              className="p-1.5 border-2 border-black dark:border-gray-700 hover:bg-red-600 hover:text-white transition-colors"
            >
              <MessageSquarePlus size={14} />
            </button>
            <button
              onClick={() => setSessionsPanelOpen((p) => !p)}
              className="p-1.5 border-2 border-black dark:border-gray-700 hover:bg-neutral-100 dark:hover:bg-gray-800 transition-colors"
            >
              <PanelLeftClose size={14} />
            </button>
          </div>
        </div>
        {/* Independently scrollable sessions list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {sessions.map((s: any) => (
            <button
              key={s.id}
              onClick={() => setActiveSessionId(s.id)}
              className={`w-full text-left px-3 py-2.5 border-b border-black/10 dark:border-gray-800 text-xs font-bold hover:bg-neutral-100 dark:hover:bg-gray-800 transition-colors truncate block ${
                activeSessionId === s.id
                  ? "bg-neutral-100 dark:bg-gray-800 border-l-2 border-l-red-600"
                  : ""
              }`}
            >
              <div className="truncate">{s.title || "New Chat"}</div>
              <div className="text-[10px] text-neutral-400 dark:text-gray-500 mt-0.5">
                {new Date(s.updatedAt || s.createdAt).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* RESIZE HANDLE for sidebar */}
      {sessionsPanelOpen && (
        <div
          className="w-1.5 shrink-0 bg-black/10 dark:bg-gray-700/50 hover:bg-red-600 dark:hover:bg-red-600 transition-colors cursor-col-resize"
          onMouseDown={(e) => {
            e.preventDefault();
            sidebarResizeRef.current = {
              startX: e.clientX,
              startWidth: sidebarWidth,
            };
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
        />
      )}

      {/* MAIN AREA */}
      <div className="flex-1 h-full min-h-0 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b-2 border-black dark:border-gray-700 flex items-center gap-3">
          {!sessionsPanelOpen && (
            <button
              onClick={() => setSessionsPanelOpen(true)}
              className="p-1.5 border-2 border-black dark:border-gray-700 hover:bg-neutral-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            >
              <PanelLeftOpen size={14} />
            </button>
          )}
          <div className="w-8 h-8 bg-black dark:bg-gray-100 text-white dark:text-gray-950 flex items-center justify-center shrink-0">
            <Bot size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black truncate">
              {sessions.find((s: any) => s.id === activeSessionId)?.title ||
                "STRIDE COACH"}
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-red-600">
              <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />{" "}
              ONLINE
            </div>
          </div>
        </div>

        {/* Independently scrollable messages area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {!activeSessionId && (
            <div className="text-center py-16">
              <div className="text-sm font-bold text-neutral-500 dark:text-gray-400 mb-4">
                Select or create a conversation to start.
              </div>
              <button
                onClick={handleNewSession}
                className="px-4 py-2 bg-black dark:bg-gray-100 text-white dark:text-gray-950 text-xs font-bold border-2 border-black dark:border-gray-700 hover:bg-red-600 transition-colors"
              >
                + NEW CHAT
              </button>
            </div>
          )}
          {activeSessionId && sessionMessages.length === 0 && (
            <div className="text-center py-16">
              <div className="text-sm font-bold text-neutral-500 dark:text-gray-400 mb-2">
                STRIDE COACH IS READY.
              </div>
              <div className="text-xs text-neutral-400 dark:text-gray-500">
                Ask anything, or describe your meals/workouts to log them
                directly.
              </div>
            </div>
          )}
          {sessionMessages.map((msg: any, i: number) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "ai" ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-xs lg:max-w-lg xl:max-w-3xl px-4 py-3 text-sm rounded-sm break-words ${
                  msg.role === "ai"
                    ? "bg-neutral-100 dark:bg-gray-800 border-2 border-black dark:border-gray-700 text-black dark:text-gray-100"
                    : "bg-black dark:bg-gray-100 text-white dark:text-gray-950 border-2 border-black dark:border-gray-700 font-bold"
                }`}
              >
                {msg.role === "ai" ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-lg font-black tracking-tighter mb-1">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-base font-black tracking-tighter mb-1">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-sm font-black mb-1">{children}</h3>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc pl-5 my-1 space-y-0.5">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="list-decimal pl-5 my-1 space-y-0.5">
                          {children}
                        </ol>
                      ),
                      li: ({ children }) => (
                        <li className="text-sm">{children}</li>
                      ),
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-2">
                          <table className="min-w-full border-collapse border border-black/20 dark:border-gray-600">
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ children }) => (
                        <thead className="bg-black/5 dark:bg-white/5">
                          {children}
                        </thead>
                      ),
                      th: ({ children }) => (
                        <th className="border border-black/20 dark:border-gray-600 px-2 py-1 text-xs font-black text-left">
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="border border-black/20 dark:border-gray-600 px-2 py-1 text-xs">
                          {children}
                        </td>
                      ),
                      p: ({ children }) => (
                        <p className="mb-1 last:mb-0">{children}</p>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-black">{children}</strong>
                      ),
                      em: ({ children }) => (
                        <em className="italic">{children}</em>
                      ),
                      code: ({ children }) => (
                        <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-xs font-mono">
                          {children}
                        </code>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-black/30 dark:border-gray-500 pl-3 my-1 italic">
                          {children}
                        </blockquote>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>
            </motion.div>
          ))}
          {chatLoggedItem && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex justify-start"
            >
              <div className="max-w-sm border-2 border-green-600 bg-green-50 dark:bg-green-950 p-3 rounded-sm">
                <div className="flex items-center gap-2 text-xs font-bold text-green-700 dark:text-green-400 mb-1">
                  <CheckCircle2 size={14} />
                  {chatLoggedItem.type === "meal"
                    ? "MEAL LOGGED"
                    : "WORKOUT LOGGED"}
                </div>
                {chatLoggedItem.type === "meal" && chatLoggedItem.data && (
                  <div className="text-xs text-green-700 dark:text-green-400">
                    {chatLoggedItem.data.name} · {chatLoggedItem.data.calories}{" "}
                    kcal · P:
                    {chatLoggedItem.data.protein}g C:
                    {chatLoggedItem.data.carbs}g F:
                    {chatLoggedItem.data.fat}g
                  </div>
                )}
                {chatLoggedItem.type === "workout" && chatLoggedItem.data && (
                  <div className="text-xs text-green-700 dark:text-green-400">
                    {chatLoggedItem.data.name} ·{" "}
                    {chatLoggedItem.data.exercises?.length || 0} exercises ·{" "}
                    {chatLoggedItem.data.intensity}
                  </div>
                )}
              </div>
            </motion.div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div className="shrink-0 p-4 border-t-2 border-black dark:border-gray-700">
          {chatError && (
            <div className="mb-2 text-xs font-bold text-red-600">
              {chatError}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !e.shiftKey && handleSendChat()
              }
              placeholder="Describe a meal or workout, or ask anything..."
              className="flex-1 px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-gray-600"
            />
            <button
              onClick={handleSendChat}
              disabled={chatLoading || !chatInput.trim() || !activeSessionId}
              className="px-4 py-2 bg-black dark:bg-gray-100 text-white dark:text-gray-950 font-bold text-sm border-2 border-black dark:border-gray-700 hover:bg-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-colors disabled:opacity-50"
            >
              {chatLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
