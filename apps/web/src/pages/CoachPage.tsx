import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Trash2, Barcode, ImagePlus, Paperclip, X } from "lucide-react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { BarcodeModal } from "@/components/coach/BarcodeModal";
import { ChatTurnMessage, type PersistedChatMessage } from "@/components/chat/cards/ChatTurnMessage";
import { parseChatTurnCards } from "@/components/chat/cards/ChatTurnCards";
import { useChatCardActions } from "@/components/chat/cards/useChatCardActions";
import { CHAT_CARD_BAND, CHAT_CARD_PILL, CHAT_COLUMN } from "@/components/chat/cards/cardSizing";
import { AgentBadge } from "@/components/ui-kit/AgentBadge";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ThinkingBubble } from "@/components/ui-kit/ChatMessage";
import { Skeleton } from "@/components/primitives/Skeleton";
import { CoachBubble, InputBar } from "@/components/ui-kit";
import type { AttachItem, InputMode, Modality } from "@/components/ui-kit";
import { useSubmissionId } from "@/lib/submissionId";
import { usePrefs } from "@/hooks/usePrefs";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useToast } from "@/context/ToastContext";
import { recordSuggestion, orderSuggestions } from "@/lib/behavior";
import { cn, localDateStr } from "@/lib/utils";
import { getAIErrorMessage } from "@/lib/ai-errors";
import { reportException } from "@/lib/observability";
import { MobileIcon } from "@/components/mobile/MobileKit";
import type { CoachingStyle } from "@/lib/storage";

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

type MemoryApprovalEntry = { memoryId: string; kind: "food" | "workout"; label: string; status?: "pending" | "approved" | "rejected" };
/**
 * Transient additions to the transcript. Everything durable — messages, cards,
 * outcomes — lives on the persisted chat message and is rendered from there.
 */
type LocalNote =
  | { kind: "text"; id: string; text: string }
  | { kind: "memory-approval"; id: string; entries: MemoryApprovalEntry[] };
type PendingSend = { submissionId: string; text: string; modality?: Modality; chip?: string };
type ChatSessionSummary = { id: Id<"chat_sessions">; title: string; updatedAt: number };

const RAIL_SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;
const CHAT_RAIL_STORAGE_KEY = "stride_chat_rail_expanded";

const GREETING: Record<CoachingStyle, string> = {
  gentle: "Hey, I'm Stry. No pressure — just here when you need me.",
  motivating: "Hey! I'm Stry. Ready to make today count? Let's go!",
  analytical: "Hi, I'm Stry. I'll help you track patterns. What would you like to log?",
};

const MAX_IMAGE_EDGE = 1600;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.ceil(base64.length * 3 / 4);
}

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
    } catch {
      // Fall back to an object URL for browsers with partial ImageBitmap support.
    }
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Couldn't decode image"));
      element.src = sourceUrl;
    });
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      cleanup: () => URL.revokeObjectURL(sourceUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(sourceUrl);
    throw error;
  }
}

async function resizeImageForUpload(file: File): Promise<string> {
  const decoded = await decodeImage(file);
  const { source, width: sourceWidth, height: sourceHeight } = decoded;
  try {
    if (!sourceWidth || !sourceHeight) throw new Error("Image has no dimensions");
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Couldn't prepare image");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    let quality = 0.8;
    let output = canvas.toDataURL("image/jpeg", quality);
    while (dataUrlBytes(output) > MAX_IMAGE_BYTES && quality > 0.4) {
      quality -= 0.1;
      output = canvas.toDataURL("image/jpeg", quality);
    }
    while (dataUrlBytes(output) > MAX_IMAGE_BYTES && Math.max(canvas.width, canvas.height) > 640) {
      canvas.width = Math.max(1, Math.round(canvas.width * 0.8));
      canvas.height = Math.max(1, Math.round(canvas.height * 0.8));
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      output = canvas.toDataURL("image/jpeg", quality);
    }
    if (dataUrlBytes(output) > MAX_IMAGE_BYTES) throw new Error("Image is too large after resizing");
    return output;
  } finally {
    decoded.cleanup();
  }
}

export function CoachPage() {
  const navigate = useNavigate();
  const { prefs } = usePrefs();
  const style = prefs.coachingStyle;
  const reduceMotion = useReducedMotion();

  const sessionsResult = useQuery(api.chat.getSessions);
  const sessions = (sessionsResult ?? []) as ChatSessionSummary[];
  const createSession = useMutation(api.chat.createSession);
  const deleteSession = useMutation(api.chat.deleteSession);
  const approveFoodMemory = useMutation((api as any).food_memory.approveMemory);
  const rejectFoodMemory = useMutation((api as any).food_memory.rejectMemory);
  const approveWorkoutMemory = useMutation((api as any).workout_memory.approveMemory);
  const rejectWorkoutMemory = useMutation((api as any).workout_memory.rejectMemory);
  const sendToAI = useAction(api.ai.chat);
  const parseNutritionImage = useAction(api.ai.parseNutritionImage);
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeSessionId, setActiveSessionId] = useState<Id<"chat_sessions"> | null>(null);
  const convexMessages = useQuery(api.chat.getMessages, activeSessionId ? { sessionId: activeSessionId } : "skip") as PersistedChatMessage[] | undefined;
  const persistedMessages = useMemo(() => convexMessages ?? [], [convexMessages]);

  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);
  const [freshSubmissionId, setFreshSubmissionId] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");
  const [panelOpen, setPanelOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(CHAT_RAIL_STORAGE_KEY) !== "false"; }
    catch { return true; }
  });
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedLabel, setAttachedLabel] = useState<{ name: string; content: string } | null>(null);
  const [labelParsing, setLabelParsing] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [pendingPickerMode, setPendingPickerMode] = useState<"photo" | "ocr" | null>(null);
  const [kbPad, setKbPad] = useState(0);
  const [deletingSessionId, setDeletingSessionId] = useState<Id<"chat_sessions"> | null>(null);
  const sendingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const labelFileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const submissionIds = useSubmissionId();
  // A retained retry id belongs to the chat it failed in; switching chats drops it.
  const clearSubmissionId = submissionIds.clear;

  const scroll = useCallback(() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50), []);

  const addMemoryApprovals = useCallback((entries: MemoryApprovalEntry[]) => {
    if (entries.length === 0) return;
    setNotes((prev) => [...prev, { kind: "memory-approval", id: `memory-${Date.now()}`, entries }]);
  }, []);

  const { handlers: cardHandlers, state: cardState } = useChatCardActions({
    onConfirmResult: (result) => addMemoryApprovals((result.memoryApprovals ?? []) as MemoryApprovalEntry[]),
    onSettled: () => scroll(),
  });

  /**
   * A pending clarification is reconstructed from the persisted cards, so a
   * free-text date answer still resolves the right group after a reload.
   */
  const activeClarificationGroupId = useMemo(() => {
    for (let index = persistedMessages.length - 1; index >= 0; index -= 1) {
      const cards = parseChatTurnCards(persistedMessages[index].turnCards);
      const clarification = cards.find((card) => card.kind === "clarification");
      if (clarification && clarification.kind === "clarification") {
        return clarification.data.groupId;
      }
      if (cards.length > 0) return null;
    }
    return null;
  }, [persistedMessages]);

  const onTranscript = useCallback((t: string) => {
    setInput((prev) => (prev ? `${prev} ${t}` : t).trim());
  }, []);
  const voice = useAudioRecorder(onTranscript);

  const requestedMode = searchParams.get("mode");
  useEffect(() => {
    if (!requestedMode) return;
    if (requestedMode === "barcode") setBarcodeOpen(true);
    if (requestedMode === "photo" || requestedMode === "ocr") setPendingPickerMode(requestedMode);
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
    void resizeImageForUpload(file)
      .then((imageDataUrl) => setAttachedImage(imageDataUrl))
      .catch(() => toast.error("Couldn't read image", "Please choose another photo"));
  }, [toast]);

  const onPickNutritionLabel = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Not an image", "Choose a photo of the nutrition label");
      return;
    }
    void resizeImageForUpload(file)
      .then((imageDataUrl) => {
        setLabelParsing(true);
        return parseNutritionImage({ imageDataUrl, userDescription: input.trim() || undefined })
          .then((result) => {
            const label = result as {
              name: string;
              caloriesPer100g: number;
              proteinPer100g: number;
              carbsPer100g: number;
              fatPer100g: number;
              servingSize?: number;
              servingUnit?: string;
              userPortionGrams?: number;
            };
            const serving = label.servingSize != null ? `Serving size: ${label.servingSize}${label.servingUnit ?? "g"}.\n` : "";
            const portion = label.userPortionGrams != null ? `Estimated portion: ${label.userPortionGrams}g.\n` : "";
            setAttachedLabel({
              name: label.name || "Nutrition label",
              content: `${label.name || "Nutrition label"}\n${serving}${portion}Per 100g: ${label.caloriesPer100g} kcal, ${label.proteinPer100g}g protein, ${label.carbsPer100g}g carbs, ${label.fatPer100g}g fat.`,
            });
            toast.success("Label read", "Review the details, then send to log it.");
          })
      })
      .catch((error) => toast.error("Couldn't read label", getAIErrorMessage(error) ?? "Choose a clearer photo and try again."))
      .finally(() => setLabelParsing(false));
  }, [input, parseNutritionImage, toast]);

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

  // Scroll to the newest turn whenever persisted history arrives or grows.
  useEffect(() => {
    if (persistedMessages.length === 0) return;
    const timer = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }), 50);
    return () => clearTimeout(timer);
  }, [persistedMessages.length, activeSessionId]);

  const loadSession = useCallback((id: Id<"chat_sessions">) => {
    if (id === activeSessionId) return;
    setActiveSessionId(id);
    setNotes([]);
    setPendingSend(null);
    setFreshSubmissionId(null);
    clearSubmissionId();
  }, [activeSessionId, clearSubmissionId]);

  // Load session from sidebar ?session= param, then clear the param from URL
  useEffect(() => {
    const sid = searchParams.get("session");
    if (!sid || sessions.length === 0) return;
    const match = sessions.find((s) => s.id === sid);
    if (match) { loadSession(match.id as Id<"chat_sessions">); setSearchParams({}, { replace: true }); }
  }, [searchParams, sessions, loadSession, setSearchParams]);

  const resolveMemoryApproval = useCallback(async (noteId: string, entry: MemoryApprovalEntry, approved: boolean) => {
    try {
      if (entry.kind === "food") {
        await (approved ? approveFoodMemory : rejectFoodMemory)({ id: entry.memoryId });
      } else {
        await (approved ? approveWorkoutMemory : rejectWorkoutMemory)({ id: entry.memoryId });
      }
      setNotes((prev) => prev.map((note) => note.kind === "memory-approval" && note.id === noteId
        ? { ...note, entries: note.entries.map((candidate) => candidate.memoryId === entry.memoryId ? { ...candidate, status: approved ? ("approved" as const) : ("rejected" as const) } : candidate) }
        : note));
    } catch (err) {
      toast.error("Couldn't update memory", err instanceof Error ? err.message : "Try again");
    }
  }, [approveFoodMemory, rejectFoodMemory, approveWorkoutMemory, rejectWorkoutMemory, toast]);

  const newChat = useCallback(() => {
    setActiveSessionId(null);
    setNotes([]);
    setPendingSend(null);
    setFreshSubmissionId(null);
    clearSubmissionId();
  }, [clearSubmissionId]);

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
  const hasUserMsg = persistedMessages.some((m) => m.role === "user") || pendingSend !== null;
  const activeMode: InputMode = voice.recording || voice.transcribing ? "voice" : attachedImage ? "photo" : attachedLabel ? "ocr" : "type";
  const pendingSendPersisted = pendingSend !== null
    && persistedMessages.some((m) => m.role === "user" && m.clientSubmissionId === pendingSend.submissionId);

  const send = useCallback(async (text: string, image?: string) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    const v = text.trim();
    if (!v && !image && !attachedLabel) { sendingRef.current = false; return; }
    const labelForSend = attachedLabel;
    const messageText = labelForSend ? `[Nutrition label: ${labelForSend.name}]\n${labelForSend.content}\n\n${v}`.trim() : v;
    const userMeta = image
      ? { modality: "photo" as const, chip: "Attached image" }
      : activeMode === "voice"
      ? { modality: "voice" as const, chip: "Voice note" }
      : labelForSend
      ? { modality: "ocr" as const, chip: "Nutrition label" }
      : undefined;
    // Stable per-attempt id: retrying the same message reuses it so the backend
    // de-duplicates instead of logging twice.
    const clientSubmissionId = submissionIds.idFor(`${messageText}|${image ? "image" : ""}`);
    setInput("");
    setAttachedImage(null);
    setPendingSend({
      submissionId: clientSubmissionId,
      text: v || (image ? "Photo of meal" : "Nutrition label"),
      ...userMeta,
    });
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
        today: localDateStr(),
        clarificationGroupId: (activeClarificationGroupId ?? undefined) as Id<"actionGroups"> | undefined,
        clientSubmissionId,
      });
      const r = result as Record<string, unknown>;
      const loggedItem = (r.loggedItem && typeof r.loggedItem === "object" && "type" in (r.loggedItem as object))
        ? r.loggedItem as { type: string; data: any } : undefined;
      const memoryApprovals = Array.isArray(r.memoryApprovals) ? r.memoryApprovals as MemoryApprovalEntry[] : [];

      // The reply text and every card are read back from the persisted turn;
      // nothing about this turn is held in component state.
      submissionIds.clear();
      setFreshSubmissionId(clientSubmissionId);
      addMemoryApprovals(memoryApprovals);
      scroll();

      // Toasts stay, but only as a supplementary notification — the result card
      // in the transcript is the durable record.
      if (loggedItem) {
        if (loggedItem.type === "meal") {
          const d = loggedItem.data;
          const calories = finiteNumber(d.calories);
          const protein = finiteNumber(d.protein);
          const detail = [
            calories !== undefined ? `${Math.round(calories)} kcal` : undefined,
            protein !== undefined ? `${Math.round(protein)}g protein` : undefined,
          ].filter(Boolean).join(" · ");
          toast.success(`Logged: ${typeof d.name === "string" && d.name ? d.name : "meal"}`, detail || undefined);
        } else if (loggedItem.type === "workout") {
          const d = loggedItem.data;
          const caloriesBurned = finiteNumber(d.caloriesBurned);
          const detail = [
            typeof d.duration === "string" && d.duration ? d.duration : undefined,
            caloriesBurned !== undefined ? `${Math.round(caloriesBurned)} kcal burned` : undefined,
          ].filter(Boolean).join(" · ");
          toast.success(`Logged workout: ${typeof d.name === "string" && d.name ? d.name : "workout"}`, detail || undefined);
        } else if (loggedItem.type === "sleep") {
          const d = loggedItem.data;
          const hours = finiteNumber(d.hours);
          const detail = [hours !== undefined ? `${hours}h` : undefined, typeof d.quality === "string" ? d.quality : undefined].filter(Boolean).join(" · ");
          toast.success("Logged sleep", detail || undefined);
        } else if (loggedItem.type === "water") {
          const d = loggedItem.data;
          const ml = finiteNumber(d.ml);
          toast.success("Logged water", ml !== undefined ? `${Math.round(ml)}ml` : undefined);
        } else if (loggedItem.type === "mood") {
          const d = loggedItem.data;
          const rating = finiteNumber(d.rating);
          toast.success("Logged mood", rating !== undefined ? `rating ${rating}/5` : undefined);
        } else if (loggedItem.type === "steps") {
          const d = loggedItem.data;
          const count = finiteNumber(d.count);
          toast.success("Logged steps", count !== undefined ? `${Math.round(count)} steps` : undefined);
        }
      }
      if (labelForSend) setAttachedLabel(null);
    } catch (err) {
      if (labelForSend) setAttachedLabel(labelForSend);
      const raw = err instanceof Error ? err.message : "";
      const userMsg = getAIErrorMessage(err)
        ?? (raw.toLowerCase().includes("api_key") || raw.toLowerCase().includes("api key") || raw.includes("not set")
        ? "AI is not configured — contact the app owner to set up the API key."
        : raw.includes("429") || raw.toLowerCase().includes("rate limit") || raw.toLowerCase().includes("quota")
        ? "Stry is busy — try again in a moment."
        : raw.toLowerCase().includes("timeout") || raw.toLowerCase().includes("timed out")
        ? "Request timed out — check your connection."
        : "Couldn't reach Stry right now. Please try again.");
      // Keep the submission id so a retry of this exact message stays idempotent.
      setNotes((prev) => [...prev, { kind: "text", id: `err-${Date.now()}`, text: userMsg }]);
      toast.error("Error", userMsg);
    } finally {
      sendingRef.current = false;
      setPendingSend(null);
      setThinking(false);
    }
  }, [activeMode, activeSessionId, activeClarificationGroupId, addMemoryApprovals, attachedLabel, createSession, sendToAI, scroll, submissionIds, toast]);

  const attachItems: AttachItem[] = [
    { key: "photo", label: "Photo of meal", mode: "photo", icon: <ImagePlus className="h-[18px] w-[18px]" strokeWidth={1.9} />, onSelect: () => fileRef.current?.click() },
    { key: "barcode", label: "Scan barcode", mode: "barcode", icon: <Barcode className="h-[18px] w-[18px]" strokeWidth={1.9} />, onSelect: () => setBarcodeOpen(true) },
    { key: "ocr", label: "Nutrition label", mode: "ocr", icon: <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.9} />, onSelect: () => labelFileRef.current?.click() },
  ];

  return (
    /* Break out of AppLayout padding — same technique as HomePage */
    <div className="flex h-full flex-col lg:h-dvh lg:flex-row lg:-mx-10 lg:-mt-10 lg:-mb-12 overflow-hidden bg-surface dark:bg-[#090b12] transition-colors duration-300">

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) onPickImage(file); e.target.value = ""; }} />
      <input ref={labelFileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) onPickNutritionLabel(file); e.target.value = ""; }} />
      <BarcodeModal open={barcodeOpen} onClose={() => setBarcodeOpen(false)} date={localDateStr()} />

      {pendingPickerMode && (
        <div className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-2xl border border-lavender/25 bg-lavender/10 px-4 py-3 text-[13px] text-text" role="status">
          <span>{pendingPickerMode === "ocr" ? "Ready to read a nutrition label?" : "Ready to attach a meal photo?"}</span>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => {
              const mode = pendingPickerMode;
              setPendingPickerMode(null);
              (mode === "ocr" ? labelFileRef : fileRef).current?.click();
            }} className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-text-on-ink">Choose photo</button>
            <button type="button" onClick={() => setPendingPickerMode(null)} className="rounded-full px-2 py-1.5 text-xs font-semibold text-text-muted">Not now</button>
          </div>
        </div>
      )}

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
          <div className={cn(CHAT_COLUMN, "pt-5 pb-3 space-y-4")}>
            {!hasUserMsg && (
              <div>
                <CoachBubble
                  agentType="overall"
                  defaultStyle={style}
                  messages={{
                    gentle: GREETING.gentle,
                    motivating: GREETING.motivating,
                    analytical: GREETING.analytical,
                  }}
                />
              </div>
            )}

            {/* Every durable turn — text and cards — is rendered from persisted state. */}
            {persistedMessages.map((message, index) => {
              const submissionId = message.clientSubmissionId;
              return (
                <ChatTurnMessage
                  key={`${submissionId ?? "m"}-${index}`}
                  message={message}
                  handlers={cardHandlers}
                  state={cardState}
                  fresh={message.role === "ai" && submissionId != null && submissionId === freshSubmissionId}
                  onEdit={message.role === "user" ? () => { setInput(message.content); inputRef.current?.focus(); } : undefined}
                />
              );
            })}

            {pendingSend && !pendingSendPersisted && (
              <MessageBubble
                key={pendingSend.submissionId}
                role="user"
                content={pendingSend.text}
                modality={pendingSend.modality}
                chip={pendingSend.chip}
              />
            )}

            {notes.map((note) => {
              if (note.kind === "text") {
                return <MessageBubble key={note.id} role="ai" content={note.text} />;
              }
              return (
                <div key={note.id} className={cn(CHAT_CARD_BAND, "rounded-[16px] border border-lavender/30 bg-lavender/10 p-4 space-y-2")}>
                  <p className="text-[15px] font-extrabold text-ink dark:text-surface">Save this as a preference?</p>
                  {note.entries.map((entry) => (
                    <div key={entry.memoryId} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[14px] text-ink/70 dark:text-white/65">{entry.label}</span>
                      {entry.status && entry.status !== "pending" ? (
                        <span className="text-[13px] font-bold text-ink/45 dark:text-white/45">{entry.status}</span>
                      ) : (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => void resolveMemoryApproval(note.id, entry, true)} className={cn(CHAT_CARD_PILL, "border border-mint/40 text-ink dark:text-surface")}>Approve</button>
                          <button type="button" onClick={() => void resolveMemoryApproval(note.id, entry, false)} className={cn(CHAT_CARD_PILL, "border border-ink/15 text-ink/60 dark:text-white/60")}>Reject</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
            {thinking && <ThinkingBubble />}
            <div ref={bottomRef} />
          </div>
        </div>

        {!hasUserMsg && (
          <div className={cn(CHAT_COLUMN, "shrink-0 pb-2")}>
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
              className={cn(CHAT_COLUMN, "shrink-0 pb-2 flex")}
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
          {attachedLabel && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
              className={cn(CHAT_COLUMN, "shrink-0 pb-2")}
            >
              <div className="relative rounded-xl border border-lavender/20 bg-lavender/10 px-3 py-2 pr-8 text-[12px] text-text">
                <p className="font-semibold">{attachedLabel.name}</p>
                <p className="mt-0.5 text-text-muted">{attachedLabel.content.split("\n").at(-1)}</p>
                <button type="button" onClick={() => setAttachedLabel(null)} aria-label="Remove nutrition label"
                  className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white dark:bg-lavender dark:text-ink">
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="shrink-0" style={{ paddingBottom: kbPad > 0 ? `${kbPad}px` : "max(env(safe-area-inset-bottom), 0.75rem)" }}>
          <div className={cn(CHAT_COLUMN, "pt-1")}>
            <InputBar
              inputRef={inputRef}
              value={input}
              onValueChange={setInput}
              onSubmit={() => { void send(input, attachedImage ?? undefined); if (inputRef.current) inputRef.current.style.height = "auto"; }}
              activeMode={activeMode}
              attachItems={attachItems}
              onVoice={() => voice.recording ? voice.stop() : voice.start()}
              voiceState={voice.transcribing ? "transcribing" : voice.recording ? "recording" : "idle"}
              busy={thinking || labelParsing}
              disabled={voice.transcribing || labelParsing}
              submitEnabled={!!input.trim() || !!attachedImage || !!attachedLabel}
              placeholder={voice.recording ? "Listening..." : voice.transcribing ? "Transcribing..." : labelParsing ? "Reading nutrition label..." : attachedLabel ? "Add a note (optional)..." : "Message Stry — what did you eat or train?"}
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
