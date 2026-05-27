import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUp, Mic, Camera, MicOff } from "lucide-react";
import { useUser } from "@clerk/react";
import { VoxelAgent } from "@/components/voxel/VoxelAgent";
import { ConfirmModal } from "@/components/coach/ConfirmModal";
import { SuggestionChip } from "@/components/primitives/SuggestionChip";
import { useTypewriter } from "@/hooks/useTypewriter";
import { useLogs } from "@/hooks/useLogs";
import { usePrefs } from "@/hooks/usePrefs";
import { useVoice } from "@/hooks/useVoice";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { recordSuggestion } from "@/lib/behavior";
import { getGreeting } from "@/lib/greeting";
import { cannedFlows, todaySuggestions, DRAFT_TRIGGERS } from "@/data/mock";
import type { LogDraft, MealDraft, WorkoutDraft } from "@/data/mock";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 260, damping: 28 } as const;

function StreamingReply({ text }: { text: string }) {
  const { displayed, done } = useTypewriter(text, 18, true);
  return (
    <p className="text-[14.5px] leading-relaxed text-text text-center max-w-[40ch] mx-auto">
      {displayed}
      {!done && <span className="ml-0.5 inline-block h-3.5 w-0.5 align-middle animate-pulse bg-lavender" />}
    </p>
  );
}

type AssistantConsoleProps = {
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

export function AssistantConsole({ inputRef }: AssistantConsoleProps) {
  const [textValue, setTextValue] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState<LogDraft | null>(null);
  const [pendingConfirmReply, setPendingConfirmReply] = useState<string>("");
  const [pendingDiscardReply, setPendingDiscardReply] = useState<string>("");

  const { logs, add } = useLogs();
  const { prefs } = usePrefs();
  const { user } = useUser();
  const style = prefs.coachingStyle;
  const internalRef = useRef<HTMLInputElement>(null);
  const activeRef = inputRef ?? internalRef;

  const firstName = user?.firstName ?? user?.username ?? "there";
  const greeting = getGreeting(firstName, logs);
  const isLarge = useMediaQuery("(min-width: 1024px)");

  const showReply = useCallback((text: string) => {
    setReply(text);
  }, []);

  const respond = useCallback((text: string) => {
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      showReply(text);
    }, 700);
  }, [showReply]);

  const handleConfirm = useCallback((confirmed: LogDraft) => {
    if (confirmed.kind === "meal") {
      const d = confirmed as MealDraft;
      add("meal", d.description, {
        agent: "diet",
        meal: { kcal: d.kcal, protein: d.protein, carbs: d.carbs, fat: d.fat, items: d.items },
        aiInsight: `AI-parsed: ${d.kcal} kcal, ${d.protein}g protein`,
      });
    } else {
      const d = confirmed as WorkoutDraft;
      add("workout", d.description, {
        agent: "workout",
        workout: { type: d.type, duration: d.duration, distance: d.distance, kcal: d.kcal, intensity: d.intensity },
        aiInsight: `AI-parsed: ${d.duration} min ${d.type}, ${d.kcal} kcal`,
      });
    }
    setDraft(null);
    showReply(pendingConfirmReply);
  }, [add, pendingConfirmReply, showReply]);

  const handleDiscard = useCallback(() => {
    setDraft(null);
    showReply(pendingDiscardReply);
  }, [pendingDiscardReply, showReply]);

  const send = useCallback((text: string) => {
    const v = text.trim();
    if (!v) return;
    setReply(null);
    setDraft(null);

    const trigger = DRAFT_TRIGGERS[v.toLowerCase()];
    if (trigger) {
      setThinking(true);
      setTimeout(() => {
        setThinking(false);
        setPendingConfirmReply(trigger.confirmReply);
        setPendingDiscardReply(trigger.discardReply);
        setDraft(trigger.draft);
      }, 1400);
      return;
    }

    const flow = cannedFlows[v];
    if (flow) {
      if (flow.log) add(flow.log.category, v, flow.log.extra);
      else add("note", v);
      respond(flow.reply[style]);
    } else {
      add("note", v);
      respond("Got it — I've noted that. Anything else?");
    }
  }, [add, respond, style]);

  const onVoiceResult = useCallback((text: string) => setTextValue(text), []);
  const voice = useVoice(onVoiceResult);

  const submit = () => { send(textValue); setTextValue(""); };

  const botState = thinking ? "thinking" : voice.recording ? "listening" : "idle";

  return (
    <>
      <div className="flex flex-col items-center gap-4 w-full">
        <div className="relative">
          <VoxelAgent agent="main" size={isLarge ? 224 : 180} state={botState} />
          {voice.recording && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 inline-flex h-2 w-2 rounded-full bg-peach animate-pulse" />
          )}
        </div>

        <div className="text-center space-y-1.5">
          <h1 className="text-display text-text leading-[1.05]">{greeting.headline}</h1>
          <p className="text-[16px] text-text-muted">{greeting.sub}</p>
        </div>

        {/* Reply / thinking — fixed-height slot, no draft card here */}
        <div className="min-h-[44px] flex items-center justify-center w-full max-w-[42ch]">
          <AnimatePresence mode="wait">
            {thinking && (
              <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="h-2 w-2 rounded-full bg-lavender"
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                  />
                ))}
              </motion.div>
            )}
            {!thinking && reply && (
              <motion.div key={reply} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={SPRING} className="w-full">
                <StreamingReply text={reply} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input bar */}
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}
          className={cn(
            "flex items-center gap-1.5 rounded-full bg-card border pl-5 pr-1.5 py-1.5 w-full max-w-lg transition-colors duration-150",
            voice.recording ? "border-peach" : "border-border-strong focus-within:border-lavender",
          )}
        >
          <input ref={activeRef} type="text" value={textValue} onChange={(e) => setTextValue(e.target.value)}
            placeholder={voice.recording ? "Listening…" : "Ask Stry anything…"}
            aria-label="Ask Stry"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-text placeholder:text-text-subtle focus:outline-none py-1.5"
          />
          <button type="button" aria-label="Photo" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-card-elev transition-colors">
            <Camera className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button type="button" aria-label={voice.recording ? "Stop listening" : "Voice input"}
            onClick={() => voice.recording ? voice.stop() : voice.start()}
            className={cn("inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors",
              voice.recording ? "bg-peach text-ink" : "text-text-muted hover:bg-card-elev")}>
            {voice.recording ? <MicOff className="h-4 w-4" strokeWidth={1.75} /> : <Mic className="h-4 w-4" strokeWidth={1.75} />}
          </button>
          <motion.button type="submit" aria-label="Send" disabled={!textValue.trim()}
            animate={{ scale: textValue.trim() ? 1 : 0.9, opacity: textValue.trim() ? 1 : 0.5 }}
            transition={SPRING}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-text-on-ink disabled:cursor-not-allowed">
            <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
          </motion.button>
        </form>

        <div className="flex flex-wrap justify-center gap-2 max-w-xl">
          {todaySuggestions.map((s) => (
            <SuggestionChip key={s} label={s} onClick={() => { recordSuggestion(s); send(s); }} />
          ))}
        </div>
      </div>

      {/* Draft confirmation lives in a portal — no layout impact */}
      <ConfirmModal
        draft={draft}
        onConfirm={handleConfirm}
        onDiscard={handleDiscard}
      />
    </>
  );
}
