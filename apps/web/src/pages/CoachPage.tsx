import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Trash2, Barcode, ImagePlus, Paperclip, X, RotateCcw } from "lucide-react";
import { useQuery, useMutation, useAction } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { BarcodeModal } from "@/components/coach/BarcodeModal";
import { ConfirmationCard, type ConfirmationDecision, type ConfirmationPayload, type ConfirmationResult } from "@/components/coach/ConfirmationCard";
import { AgentBadge } from "@/components/ui-kit/AgentBadge";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ThinkingBubble } from "@/components/ui-kit/ChatMessage";
import { Skeleton } from "@/components/primitives/Skeleton";
import { CoachBubble, InputBar } from "@/components/ui-kit";
import type { AgentType, AttachItem, InputMode, Modality } from "@/components/ui-kit";
import { usePrefs } from "@/hooks/usePrefs";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useToast } from "@/context/ToastContext";
import { recordSuggestion, orderSuggestions } from "@/lib/behavior";
import { cn, localDateStr } from "@/lib/utils";
import { getAIErrorMessage } from "@/lib/ai-errors";
import { reportException } from "@/lib/observability";
import { MobileIcon } from "@/components/mobile/MobileKit";
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
  // Mirrored from the backend persona compatibility module. Keep this local
  // and tiny so the web build does not depend on Convex server modules.
  const personaToAgent: Record<string, Agent> = {
    overall: "main", general: "main",
    diet: "diet", nutrition: "diet",
    workout: "workout",
    recovery: "sleep",
    water: "water", hydration: "water",
    habit: "habit",
    mindset: "wellness", wellness: "wellness",
  };
  return personaToAgent[coachType ?? "general"] ?? "main";
}

type TextMessage = { kind: "text"; id: string; role: "user" | "assistant"; text: string; agent?: Agent; streamed?: boolean; entrance?: boolean; modality?: Modality; chip?: string };
type UndoEntry = { type: "meal" | "workout" | "sleep" | "water" | "mood" | "steps"; id: string; actionId?: string; groupId?: string; label: string; provenance?: string; confidence?: number; undone?: boolean; previous?: { hours: number; quality: string; note?: string } | { count: number } | null; expected?: { hours: number; quality: string; note?: string } | { count: number } };
type UndoMessage = { kind: "undo"; id: string; groupId?: string; entries: UndoEntry[] };
type MemoryApprovalEntry = { memoryId: string; kind: "food" | "workout"; label: string; status?: "pending" | "approved" | "rejected" };
type MemoryApprovalMessage = { kind: "memory-approval"; id: string; entries: MemoryApprovalEntry[] };
type MealRetryArgs = Omit<FunctionArgs<typeof api.meals.addMeal>, "allowDuplicate">;
type WorkoutRetryArgs = Omit<FunctionArgs<typeof api.workouts.addWorkout>, "allowDuplicate">;
type FailedLogItem =
  | { kind: "meal"; code: string; description: string; retryArgs: MealRetryArgs; logged?: boolean }
  | { kind: "workout"; code: string; description: string; retryArgs: WorkoutRetryArgs; logged?: boolean };
type DuplicateMessage = { kind: "duplicate"; id: string; items: FailedLogItem[] };
type ClarificationItem = { actionType: string; description: string; reason: string; resolvedDate?: string; confidence?: number };
type ClarificationPayload = { groupId: string; items: ClarificationItem[]; question: string };
type ClarificationMessage = { kind: "clarification"; id: string; groupId: string; items: ClarificationItem[]; question: string; resolved?: boolean };
type ConfirmationMessage = { kind: "confirmation"; id: string; payload: ConfirmationPayload; result?: ConfirmationResult };
type Message = TextMessage | UndoMessage | MemoryApprovalMessage | DuplicateMessage | ClarificationMessage | ConfirmationMessage;
type ChatSessionSummary = { id: Id<"chat_sessions">; title: string; updatedAt: number; isHome?: boolean };
type ConvexChatMessage = { role: "user" | "ai"; content: string };

function confidenceBand(confidence?: number): string | undefined {
  if (confidence == null) return undefined;
  return confidence >= 0.8 ? "high confidence" : confidence >= 0.6 ? "medium confidence" : "low confidence";
}

function provenanceLabel(provenance?: string, confidence?: number): string | undefined {
  if (!provenance && confidence == null) return undefined;
  const source = (provenance ?? "unknown").replaceAll("_", " ");
  const band = confidenceBand(confidence);
  return band ? `${source} · ${band}` : source;
}

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

  const sessionsResult = useQuery(api.chat.getSessions);
  const sessions = (sessionsResult ?? []) as ChatSessionSummary[];
  const createSession = useMutation(api.chat.createSession);
  const deleteSession = useMutation(api.chat.deleteSession);
  const addMeal = useMutation(api.meals.addMeal);
  const addWorkout = useMutation(api.workouts.addWorkout);
  const undoAction = useMutation((api as any).actions_undo.undoAction);
  const undoGroup = useMutation((api as any).actions_undo.undoGroup);
  const approveFoodMemory = useMutation((api as any).food_memory.approveMemory);
  const rejectFoodMemory = useMutation((api as any).food_memory.rejectMemory);
  const approveWorkoutMemory = useMutation((api as any).workout_memory.approveMemory);
  const rejectWorkoutMemory = useMutation((api as any).workout_memory.rejectMemory);
  const sendToAI = useAction(api.ai.chat);
  const confirmGroup = useAction((api as any).ai.confirmGroup);
  const resolveClarification = useAction(api.ai.resolveClarification);
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
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [kbPad, setKbPad] = useState(0);
  const [pendingUndoIds, setPendingUndoIds] = useState<Set<string>>(() => new Set());
  const [pendingRetryIds, setPendingRetryIds] = useState<Set<string>>(() => new Set());
  const [activeClarificationGroupId, setActiveClarificationGroupId] = useState<Id<"actionGroups"> | null>(null);
  const [pendingConfirmIds, setPendingConfirmIds] = useState<Set<string>>(() => new Set());
  const [deletingSessionId, setDeletingSessionId] = useState<Id<"chat_sessions"> | null>(null);
  const [clarifyDates, setClarifyDates] = useState<Record<string, string>>({});
  const pendingUndoIdsRef = useRef<Set<string>>(new Set());
  const pendingRetryIdsRef = useRef<Set<string>>(new Set());
  const pendingHydrateRef = useRef<Id<"chat_sessions"> | null>(null);
  const sendingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  function resetClarificationState() {
    setActiveClarificationGroupId(null);
    setPendingConfirmIds(new Set());
    setClarifyDates({});
  }

  const onTranscript = useCallback((t: string) => {
    setInput((prev) => (prev ? `${prev} ${t}` : t).trim());
  }, []);
  const voice = useAudioRecorder(onTranscript);

  const onPickFile = useCallback((file: File) => {
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
    reader.onload = () => setAttachedFile({ name: file.name, content: String(reader.result ?? "").slice(0, 8000) });
    reader.readAsText(file);
  }, [toast]);

  const requestedMode = searchParams.get("mode");
  useEffect(() => {
    if (!requestedMode) return;
    if (requestedMode === "barcode") setBarcodeOpen(true);
    if (requestedMode === "photo") setTimeout(() => fileRef.current?.click(), 0);
    if (requestedMode === "ocr") setTimeout(() => docRef.current?.click(), 0);
    if (requestedMode === "voice") void voice.start();
    setSearchParams((current) => {
      current.delete("mode");
      return current;
    }, { replace: true });
  }, [requestedMode, setSearchParams, voice.start]);

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
    resetClarificationState();
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, convexMessages]);

  const loadSession = useCallback((id: Id<"chat_sessions">) => {
    if (id === activeSessionId) return;
    resetClarificationState();
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

  const resolveMemoryApproval = useCallback(async (messageId: string, entry: MemoryApprovalEntry, approved: boolean) => {
    try {
      if (entry.kind === "food") {
        await (approved ? approveFoodMemory : rejectFoodMemory)({ id: entry.memoryId });
      } else {
        await (approved ? approveWorkoutMemory : rejectWorkoutMemory)({ id: entry.memoryId });
      }
      setMessages((prev) => prev.map((message) => message.kind === "memory-approval" && message.id === messageId
        ? { ...message, entries: message.entries.map((candidate) => candidate.memoryId === entry.memoryId ? { ...candidate, status: approved ? ("approved" as const) : ("rejected" as const) } : candidate) }
        : message));
    } catch (err) {
      toast.error("Couldn't update memory", err instanceof Error ? err.message : "Try again");
    }
  }, [approveFoodMemory, rejectFoodMemory, approveWorkoutMemory, rejectWorkoutMemory, toast]);

  const undoAutoLog = useCallback(async (messageId: string, entry: UndoEntry) => {
    if (!entry.actionId || entry.undone || pendingUndoIdsRef.current.has(entry.actionId)) return;
    pendingUndoIdsRef.current.add(entry.actionId);
    setPendingUndoIds((prev) => new Set(prev).add(entry.actionId!));
    try {
      await undoAction({ actionId: entry.actionId as Id<"actions"> });
      setMessages((prev) => prev.map((m) => m.kind === "undo" && m.id === messageId
        ? { ...m, entries: m.entries.map((e) => e.actionId === entry.actionId ? { ...e, undone: true } : e) }
        : m));
      toast.success("Undone", `${entry.label} reversed`);
    } catch (err) {
      toast.error("Couldn't undo", err instanceof Error ? err.message : "Try again");
    } finally {
      pendingUndoIdsRef.current.delete(entry.actionId!);
      setPendingUndoIds((prev) => {
        const next = new Set(prev);
        next.delete(entry.actionId!);
        return next;
      });
    }
  }, [undoAction, toast]);

  const undoAutoGroup = useCallback(async (messageId: string, groupId: string, entries: UndoEntry[]) => {
    const pendingId = `group:${groupId}`;
    if (entries.every((entry) => entry.undone) || pendingUndoIdsRef.current.has(pendingId)) return;
    pendingUndoIdsRef.current.add(pendingId);
    setPendingUndoIds((prev) => new Set(prev).add(pendingId));
    try {
      const result = await undoGroup({ groupId: groupId as Id<"actionGroups"> }) as { results?: Array<{ actionId: string; status: string }> };
      const undoneIds = new Set((result.results ?? []).filter((item) => item.status === "undone" || item.status === "already_undone").map((item) => item.actionId));
      setMessages((prev) => prev.map((m) => m.kind === "undo" && m.id === messageId
        ? { ...m, entries: m.entries.map((entry) => entry.actionId && undoneIds.has(entry.actionId) ? { ...entry, undone: true } : entry) }
        : m));
      toast.success("Undone", "Saved items in this group were reversed");
    } catch (err) {
      toast.error("Couldn't undo", err instanceof Error ? err.message : "Try again");
    } finally {
      pendingUndoIdsRef.current.delete(pendingId);
      setPendingUndoIds((prev) => {
        const next = new Set(prev);
        next.delete(pendingId);
        return next;
      });
    }
  }, [undoGroup, toast]);

  const retryFailedLog = useCallback(async (messageId: string, itemIndex: number, item: FailedLogItem) => {
    const retryId = `${messageId}:${itemIndex}`;
    if (item.logged || pendingRetryIdsRef.current.has(retryId)) return;
    pendingRetryIdsRef.current.add(retryId);
    setPendingRetryIds((prev) => new Set(prev).add(retryId));
    try {
      await (item.kind === "meal"
        ? addMeal({ ...item.retryArgs, allowDuplicate: true })
        : addWorkout({ ...item.retryArgs, allowDuplicate: true }));
      setMessages((prev) => prev.map((message) => message.kind === "duplicate" && message.id === messageId
        ? { ...message, items: message.items.map((candidate, index) => index === itemIndex ? { ...candidate, logged: true } : candidate) }
        : message));
      toast.success(item.kind === "meal" ? `Logged: ${item.description}` : `Logged workout: ${item.description}`);
      scroll();
    } catch (err) {
      toast.error("Couldn't log", err instanceof Error ? err.message : "Try again");
    } finally {
      pendingRetryIdsRef.current.delete(retryId);
      setPendingRetryIds((prev) => {
        const next = new Set(prev);
        next.delete(retryId);
        return next;
      });
    }
  }, [addMeal, addWorkout, scroll, toast]);

  const resolveClarificationCard = useCallback(async (messageId: string, groupId: string, date: string) => {
    if (pendingConfirmIds.has(groupId)) return;
    setPendingConfirmIds((prev) => new Set(prev).add(groupId));
    try {
      const result = await resolveClarification({ groupId: groupId as Id<"actionGroups">, date });
      setActiveClarificationGroupId(null);
      setMessages((prev) => prev.map((message) => message.kind === "clarification" && message.id === messageId
        ? { ...message, resolved: true }
        : message));
      const loggedItem = result.loggedItems.length === 1
        ? result.loggedItems[0]
        : result.loggedItems.length > 1
          ? { type: "multiple", items: result.loggedItems }
          : null;
      if (loggedItem) {
        const undoEntries = undoEntriesFromLoggedItem(loggedItem);
        if (undoEntries.length > 0) {
          setMessages((prev) => [...prev, { kind: "undo", id: `undo-${Date.now()}`, groupId: undoEntries[0].groupId, entries: undoEntries }]);
        }
      }
      toast.success("Saved", date);
      scroll();
    } catch (err) {
      toast.error("Couldn't save", err instanceof Error ? err.message : "Try again");
    } finally {
      setPendingConfirmIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    }
  }, [resolveClarification, scroll, toast, pendingConfirmIds]);

  const confirmLargeGroup = useCallback(async (messageId: string, payload: ConfirmationPayload, decisions: ConfirmationDecision[]) => {
    if (pendingConfirmIds.has(payload.groupId)) return;
    setPendingConfirmIds((prev) => new Set(prev).add(payload.groupId));
    try {
      const result = await confirmGroup({ groupId: payload.groupId as Id<"actionGroups">, decisions }) as ConfirmationResult & { loggedItems?: any[]; unresolvedItems?: any[]; memoryApprovals?: MemoryApprovalEntry[] };
      setMessages((prev) => prev.map((message) => message.kind === "confirmation" && message.id === messageId ? { ...message, result } : message));
      const loggedItem = result.loggedItems?.length === 1
        ? result.loggedItems[0]
        : result.loggedItems && result.loggedItems.length > 1
          ? { type: "multiple", items: result.loggedItems }
          : null;
      if (loggedItem) {
        const undoEntries = undoEntriesFromLoggedItem(loggedItem);
        if (undoEntries.length > 0) {
          setMessages((prev) => [...prev, { kind: "undo", id: `undo-${Date.now()}`, groupId: undoEntries[0].groupId, entries: undoEntries }]);
        }
      }
      if (result.memoryApprovals?.length) {
        setMessages((prev) => [...prev, { kind: "memory-approval", id: `memory-${Date.now()}`, entries: result.memoryApprovals! }]);
      }
      if (result.status === "expired") toast.error("Confirmation expired", "This batch can no longer be saved");
      else if (result.unresolvedItems?.length) toast.error("Some items need attention", "Saved items remain available to undo");
      else if (result.status === "discarded") toast.success("Discarded", "No items were saved");
      else toast.success("Saved", "Confirmed items were logged");
      scroll();
    } catch (err) {
      toast.error("Couldn't save", err instanceof Error ? err.message : "Try again");
    } finally {
      setPendingConfirmIds((prev) => {
        const next = new Set(prev);
        next.delete(payload.groupId);
        return next;
      });
    }
  }, [confirmGroup, pendingConfirmIds, scroll, toast]);

  function undoEntriesFromLoggedItem(loggedItem: any): UndoEntry[] {
    const rawItems = loggedItem?.type === "multiple" ? loggedItem.items : loggedItem ? [loggedItem] : [];
    if (!Array.isArray(rawItems)) return [];
    return rawItems.flatMap((item: any) => {
      const id = item?.data?._id;
      const actionId = item?.data?.actionId;
      const groupId = item?.data?.groupId;
      if (!id || !actionId || !groupId) return [];
      switch (item.type) {
        case "meal":
        case "workout":
          return [{ type: item.type, id, actionId, groupId, label: item.data?.name ?? item.type, provenance: item.data?.provenance, confidence: item.data?.confidence }];
        case "sleep":
          return [{ type: "sleep" as const, id, actionId, groupId, label: `Sleep (${item.data?.hours}h)`, provenance: item.data?.provenance, confidence: item.data?.confidence, previous: item.data?.previous ?? null, expected: { hours: item.data?.hours, quality: item.data?.quality, note: item.data?.note } }];
        case "water":
          return [{ type: "water" as const, id, actionId, groupId, label: `Water (${item.data?.ml}ml)`, provenance: item.data?.provenance, confidence: item.data?.confidence }];
        case "mood":
          return [{ type: "mood" as const, id, actionId, groupId, label: `Mood (${item.data?.rating}/5)`, provenance: item.data?.provenance, confidence: item.data?.confidence }];
        case "steps":
          return [{ type: "steps" as const, id, actionId, groupId, label: `Steps (${item.data?.count})`, provenance: item.data?.provenance, confidence: item.data?.confidence, previous: item.data?.previous ?? null, expected: { count: item.data?.count } }];
        default:
          return [];
      }
    });
  }

  const newChat = useCallback(() => {
    pendingHydrateRef.current = null;
    resetClarificationState();
    setActiveSessionId(null);
    setMessages([{ kind: "text", id: "init", role: "assistant", text: GREETING[style], streamed: true }]);
  }, [style]);

  const removeSession = useCallback(async (id: Id<"chat_sessions">) => {
    setDeletingSessionId(id);
    try {
      await deleteSession({ id });
      toast.success("Chat deleted");
    } catch (error) {
      reportException(error, "chat_session_delete_failed");
      toast.error("Couldn't delete chat", error instanceof Error ? error.message : "Try again");
    } finally {
      setDeletingSessionId(null);
    }
  }, [deleteSession, toast]);

  const orderedSuggestions = useMemo(() => orderSuggestions(COACH_SUGGESTIONS), []);
  const hasUserMsg = messages.some((m) => m.kind === "text" && m.role === "user");
  const lastTextIdx = messages.reduce((acc, m, i) => m.kind === "text" ? i : acc, -1);
  const activeMode: InputMode = voice.recording || voice.transcribing ? "voice" : attachedImage ? "photo" : attachedFile ? "ocr" : "type";

  const send = useCallback(async (text: string, image?: string) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    const v = text.trim();
    if (!v && !image && !attachedFile) { sendingRef.current = false; return; }
    const messageText = attachedFile ? `[File: ${attachedFile.name}]\n${attachedFile.content}\n\n${v}`.trim() : v;
    const userMeta = image
      ? { modality: "photo" as const, chip: "Attached image" }
      : activeMode === "voice"
      ? { modality: "voice" as const, chip: "Voice note" }
      : attachedFile
      ? { modality: "ocr" as const, chip: "Nutrition label" }
      : undefined;
    setInput("");
    setAttachedImage(null);
    setAttachedFile(null);
    setMessages((prev) => [...prev, { kind: "text", id: `u-${Date.now()}`, role: "user", text: v || (image ? "Photo of meal" : "Nutrition label"), ...userMeta }]);
    scroll();

    setThinking(true);
    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const result = await createSession({ title: messageText.slice(0, 40) || "Image chat" });
        sessionId = result.id;
        setActiveSessionId(sessionId);
      }
      const result = await sendToAI({
        message: messageText,
        image,
        sessionId,
        coachType: "auto",
        today: localDateStr(),
        clarificationGroupId: activeClarificationGroupId ?? undefined,
        clientSubmissionId: crypto.randomUUID(),
      });
      const r = result as Record<string, unknown>;
      const reply = typeof r.reply === "string" ? r.reply : String(result);
      const coachType = typeof r.coachType === "string" ? r.coachType : undefined;
      const agent = coachToAgent(coachType);
      const loggedItem = (r.loggedItem && typeof r.loggedItem === "object" && "type" in (r.loggedItem as object))
        ? r.loggedItem as { type: string; data: any } : undefined;
      const failedItems = Array.isArray(r.failedItems)
        ? r.failedItems.filter((item): item is FailedLogItem => {
            if (!item || typeof item !== "object") return false;
            const candidate = item as Partial<FailedLogItem>;
            return (candidate.kind === "meal" || candidate.kind === "workout")
              && typeof candidate.code === "string"
              && typeof candidate.description === "string"
              && !!candidate.retryArgs
              && typeof candidate.retryArgs === "object";
          })
        : [];
      const clarification = (r.clarification && typeof r.clarification === "object" && "groupId" in (r.clarification as object))
        ? r.clarification as ClarificationPayload
        : undefined;
      const confirmation = (r.confirmation && typeof r.confirmation === "object" && "groupId" in (r.confirmation as object) && "items" in (r.confirmation as object))
        ? r.confirmation as ConfirmationPayload
        : undefined;
      const memoryApprovals = Array.isArray(r.memoryApprovals) ? r.memoryApprovals as MemoryApprovalEntry[] : [];
      if (clarification) setActiveClarificationGroupId(clarification.groupId as Id<"actionGroups">);
      else if (activeClarificationGroupId) setActiveClarificationGroupId(null);

      setMessages((prev) => [...prev, { kind: "text", id: `a-${Date.now()}`, role: "assistant", text: reply, agent, streamed: true }]);
      scroll();

      if (failedItems.length > 0) {
        setMessages((prev) => [...prev, { kind: "duplicate", id: `duplicate-${Date.now()}`, items: failedItems }]);
        scroll();
      }

      if (clarification) {
        setMessages((prev) => [...prev, { kind: "clarification", id: `clarify-${Date.now()}`, ...clarification }]);
        scroll();
      }

      if (confirmation) {
        setMessages((prev) => [...prev, { kind: "confirmation", id: `confirm-${Date.now()}`, payload: confirmation }]);
        scroll();
      }

      if (memoryApprovals.length > 0) {
        setMessages((prev) => [...prev, { kind: "memory-approval", id: `memory-${Date.now()}`, entries: memoryApprovals }]);
        scroll();
      }

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
          setMessages((prev) => [...prev, { kind: "undo", id: `undo-${Date.now()}`, groupId: undoEntries[0].groupId, entries: undoEntries }]);
          scroll();
        }
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const userMsg = getAIErrorMessage(err)
        ?? (raw.toLowerCase().includes("api_key") || raw.toLowerCase().includes("api key") || raw.includes("not set")
        ? "AI is not configured — contact the app owner to set up the API key."
        : raw.includes("429") || raw.toLowerCase().includes("rate limit") || raw.toLowerCase().includes("quota")
        ? "Stry is busy — try again in a moment."
        : raw.toLowerCase().includes("timeout") || raw.toLowerCase().includes("timed out")
        ? "Request timed out — check your connection."
        : "Couldn't reach Stry right now. Please try again.");
      setMessages((prev) => [...prev, { kind: "text", id: `a-${Date.now()}`, role: "assistant", text: userMsg, streamed: false }]);
      toast.error("Error", userMsg);
    } finally {
      sendingRef.current = false;
      setThinking(false);
    }
  }, [activeMode, activeSessionId, activeClarificationGroupId, attachedFile, createSession, sendToAI, scroll, toast]);

  const attachItems: AttachItem[] = [
    { key: "photo", label: "Photo of meal", mode: "photo", icon: <ImagePlus className="h-[18px] w-[18px]" strokeWidth={1.9} />, onSelect: () => fileRef.current?.click() },
    { key: "barcode", label: "Scan barcode", mode: "barcode", icon: <Barcode className="h-[18px] w-[18px]" strokeWidth={1.9} />, onSelect: () => setBarcodeOpen(true) },
    { key: "ocr", label: "Nutrition label", mode: "ocr", icon: <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.9} />, onSelect: () => docRef.current?.click() },
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
      <input ref={docRef} type="file" accept=".md,.txt,text/markdown,text/plain" className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) onPickFile(file); e.target.value = ""; }} />
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
                {sessionsResult === undefined ? (
                  <div className="space-y-2 py-3"><Skeleton className="h-10 w-full rounded-[10px]" /><Skeleton className="h-10 w-full rounded-[10px]" /></div>
                ) : sessions.length === 0 ? <p className="text-[13px] text-ink/45 dark:text-white/40 py-4 text-center">No previous chats yet.</p> : sessions.map((s) => (
                  <div key={s.id} className={cn("group flex items-center gap-1 rounded-[10px] transition-colors", s.id === activeSessionId ? "bg-lavender/20 text-ink dark:text-lavender" : "text-ink/55 dark:text-white/55 active:bg-ink/5 dark:active:bg-white/5")}>
                    <button type="button" onClick={() => { loadSession(s.id); setMobileHistoryOpen(false); }} className="flex-1 text-left px-3 py-3 min-w-0">
                      <div className="text-[13px] font-bold truncate">{s.title}</div>
                      <div className="text-[10px] opacity-70">{new Date(s.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                    </button>
                    <button type="button" disabled={deletingSessionId === s.id} onClick={() => { if (s.id === activeSessionId) newChat(); void removeSession(s.id); }} aria-label="Delete"
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
              if (m.kind === "memory-approval") {
                return (
                  <div key={m.id} className="max-w-[92%] rounded-[16px] border border-lavender/30 bg-lavender/10 p-3.5 space-y-2" style={{ zoom: 0.72 } as React.CSSProperties}>
                    <p className="text-[13px] font-bold text-ink dark:text-surface">Save this as a preference?</p>
                    {m.entries.map((entry) => (
                      <div key={entry.memoryId} className="flex items-center justify-between gap-2">
                        <span className="text-[12px] text-ink/70 dark:text-white/65">{entry.label}</span>
                        {entry.status && entry.status !== "pending" ? (
                          <span className="text-[11px] font-bold text-ink/45 dark:text-white/45">{entry.status}</span>
                        ) : (
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => void resolveMemoryApproval(m.id, entry, true)} className="rounded-full border border-mint/40 px-2.5 py-1 text-[11px] font-bold text-ink dark:text-surface">Approve</button>
                            <button type="button" onClick={() => void resolveMemoryApproval(m.id, entry, false)} className="rounded-full border border-ink/15 px-2.5 py-1 text-[11px] font-bold text-ink/60 dark:text-white/60">Reject</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              }
              if (m.kind === "undo") {
                if (m.entries.length === 0) return null;
                return (
                  <div key={m.id} className="flex flex-wrap gap-2 max-w-[92%]" style={{ zoom: 0.72 } as React.CSSProperties}>
                    {m.entries.length > 1 && m.groupId && (
                      <button
                        type="button"
                        disabled={m.entries.every((entry) => entry.undone) || pendingUndoIds.has(`group:${m.groupId}`)}
                        onClick={() => undoAutoGroup(m.id, m.groupId!, m.entries)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors",
                          m.entries.every((entry) => entry.undone) || pendingUndoIds.has(`group:${m.groupId}`)
                            ? "border-ink/10 text-ink/35 dark:border-white/10 dark:text-white/30 cursor-default"
                            : "border-bubblegum/30 text-bubblegum hover:bg-bubblegum/10 dark:border-bubblegum/40 cursor-pointer",
                        )}
                      >
                        <RotateCcw className="h-3 w-3" strokeWidth={2.4} />
                        {pendingUndoIds.has(`group:${m.groupId}`) ? "Undoing all" : "Undo all"}
                      </button>
                    )}
                    {m.entries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        disabled={!entry.actionId || entry.undone || pendingUndoIds.has(entry.actionId)}
                        onClick={() => undoAutoLog(m.id, entry)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors",
                          !entry.actionId || entry.undone || pendingUndoIds.has(entry.actionId)
                            ? "border-ink/10 text-ink/35 dark:border-white/10 dark:text-white/30 cursor-default"
                            : "border-bubblegum/30 text-bubblegum hover:bg-bubblegum/10 dark:border-bubblegum/40 cursor-pointer",
                        )}
                      >
                        <RotateCcw className="h-3 w-3" strokeWidth={2.4} />
                        <span className="flex flex-col items-start leading-tight">
                          <span>{entry.undone ? `${entry.label} reversed` : pendingUndoIds.has(entry.actionId ?? "") ? `Undoing: ${entry.label}` : `Undo: ${entry.label}`}</span>
                          {provenanceLabel(entry.provenance, entry.confidence) && <span className="text-[9px] font-semibold opacity-65">{provenanceLabel(entry.provenance, entry.confidence)}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              }
              if (m.kind === "duplicate") {
                if (m.items.length === 0) return null;
                return (
                  <div key={m.id} className="flex flex-wrap gap-2 max-w-[92%]" style={{ zoom: 0.72 } as React.CSSProperties}>
                    {m.items.map((item, itemIndex) => {
                      const retryId = `${m.id}:${itemIndex}`;
                      const pending = pendingRetryIds.has(retryId);
                      return (
                        <button
                          key={`${item.kind}-${itemIndex}`}
                          type="button"
                          disabled={item.logged || pending}
                          onClick={() => retryFailedLog(m.id, itemIndex, item)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors",
                            item.logged || pending
                              ? "border-ink/10 text-ink/35 dark:border-white/10 dark:text-white/30 cursor-default"
                              : "border-bubblegum/30 text-bubblegum hover:bg-bubblegum/10 dark:border-bubblegum/40 cursor-pointer",
                          )}
                        >
                          <RotateCcw className="h-3 w-3" strokeWidth={2.4} />
                          {item.logged ? `Logged: ${item.description}` : pending ? `Logging: ${item.description}` : `Log anyway: ${item.description}`}
                        </button>
                      );
                    })}
                  </div>
                );
              }
              if (m.kind === "confirmation") {
                return (
                  <ConfirmationCard
                    key={m.id}
                    payload={m.payload}
                    result={m.result}
                    pending={pendingConfirmIds.has(m.payload.groupId)}
                    onConfirm={(decisions) => void confirmLargeGroup(m.id, m.payload, decisions)}
                  />
                );
              }
              if (m.kind === "clarification") {
                if (m.resolved || m.items.length === 0) return null;
                const pending = pendingConfirmIds.has(m.groupId);
                const defaultDate = m.items[0]?.resolvedDate ?? localDateStr();
                const dateValue = clarifyDates[m.id] ?? defaultDate;
                return (
                  <div key={m.id} className="max-w-[92%] rounded-[16px] border border-ink/8 dark:border-white/10 bg-white dark:bg-[#1a1e2e] shadow-[0_8px_24px_rgba(13,16,27,0.06)] p-3.5 space-y-3" style={{ zoom: 0.72 } as React.CSSProperties}>
                    <div className="space-y-2">
                      {m.items.map((item, index) => (
                        <div key={index} className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-extrabold uppercase tracking-wide text-ink/45 dark:text-white/45">{item.actionType}</span>
                            <span className="text-[12px] font-medium text-ink dark:text-surface">{item.description}</span>
                          </div>
                          <p className="text-[12px] text-ink/60 dark:text-white/55 leading-snug">{item.reason}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[13px] font-medium text-ink dark:text-surface">{m.question}</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={dateValue}
                        disabled={pending}
                        onChange={(e) => setClarifyDates((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        className="h-9 rounded-[10px] border border-ink/12 dark:border-white/12 bg-surface dark:bg-[#0b0d15] px-3 text-[13px] font-medium text-ink dark:text-surface focus:outline-none focus:ring-2 focus:ring-lavender/40"
                      />
                      <button
                        type="button"
                        disabled={pending || !dateValue}
                        onClick={() => void resolveClarificationCard(m.id, m.groupId, dateValue)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors",
                          pending || !dateValue
                            ? "border-ink/10 text-ink/35 dark:border-white/10 dark:text-white/30 cursor-default"
                            : "border-bubblegum/30 text-bubblegum hover:bg-bubblegum/10 dark:border-bubblegum/40 cursor-pointer",
                        )}
                      >
                        <RotateCcw className="h-3 w-3" strokeWidth={2.4} />
                        {pending ? "Saving…" : "Confirm"}
                      </button>
                    </div>
                    <p className="text-[11px] text-ink/40 dark:text-white/40">Or just tell me the date in chat.</p>
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
              submitEnabled={!!input.trim() || !!attachedImage || !!attachedFile}
              placeholder={voice.recording ? "Listening..." : voice.transcribing ? "Transcribing..." : attachedFile ? "Add a note (optional)..." : "Message Stry — what did you eat or train?"}
              ariaLabel="Message Stry"
            />
            {voice.error && <p className="text-[11px] text-bubblegum mt-1.5">{getAIErrorMessage(voice.error) ?? voice.error}</p>}
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
              {sessionsResult === undefined ? (
                <div className="space-y-2 py-3"><Skeleton className="h-10 w-full rounded-[10px]" /><Skeleton className="h-10 w-full rounded-[10px]" /></div>
              ) : sessions.length === 0 ? <p className="text-[13px] text-ink/45 dark:text-white/40 py-4 text-center">No previous chats yet.</p> : sessions.map((s) => (
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
                    disabled={deletingSessionId === s.id}
                    onClick={() => { if (s.id === activeSessionId) newChat(); void removeSession(s.id); }}
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
