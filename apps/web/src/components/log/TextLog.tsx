import { useRef, useState } from "react";
import { useAction } from "convex/react";
import { ArrowUp } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Button, Polo, Select, Thinking } from "@/components/ui";
import { SLOTS, SLOT_NAMES, plainError, type MealSlot } from "@/lib/log";
import { submissionIdFor, type Submission } from "./submission";
import { loggedTitle, namesOf, useLogToast } from "./toasts";

const WORKING_TEXT = "Matching to IFCT and your usuals…";

// Typed logging for today. Enter sends and Shift+Enter adds a line. Clear matches are saved with an undo; fuzzy ones become a draft below.
export function TextLog() {
  const logInput = useAction(api.pipeline.log.logInput);
  const showLogged = useLogToast();
  const [text, setText] = useState("");
  const [slot, setSlot] = useState<MealSlot | "auto">("auto");
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pending = useRef<Submission>(null);

  // Sends the box. A retry of the same text and meal reuses its submission id, so the server logs it at most once.
  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const submissionId = submissionIdFor(pending, `${trimmed}|${slot}`);
    setBusy(true);
    setEmpty(false);
    setProblem(null);
    try {
      const result = await logInput({
        submissionId,
        input: { kind: "text", text: trimmed },
        ...(slot === "auto" ? {} : { defaultSlot: slot }),
      });
      pending.current = null;
      if (result.kind === "empty") {
        setEmpty(true);
        return;
      }
      setText("");
      if (result.kind === "committed") {
        showLogged({ title: loggedTitle(result.lines), sub: namesOf(result.lines), entryIds: result.entryIds });
      }
    } catch (err) {
      setProblem(plainError(err));
    } finally {
      setBusy(false);
    }
  }

  // Maps the select's value back to a meal, or "auto" for the server to decide.
  function chooseSlot(value: string) {
    if (value === "auto") setSlot("auto");
    else setSlot(SLOTS.find((option) => option === value) ?? "auto");
  }

  return (
    <section className="rounded-card bg-card p-6 shadow-card transition-shadow focus-within:shadow-[var(--shadow-card),0_0_0_2px_var(--color-polo-soft)]">
      <label className="flex flex-col">
        <span className="flex items-center gap-3">
          <Polo size={36} mood={busy ? "happy" : "idle"} />
          <span className="type-card-title">What did you eat?</span>
        </span>
        <textarea
          value={text}
          rows={2}
          placeholder="2 roti, katori dal, bhindi, chai"
          readOnly={busy}
          maxLength={2000}
          onChange={(e) => {
            setText(e.target.value);
            setEmpty(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          className="mt-4 min-h-16 w-full resize-none bg-transparent font-display text-[24px] leading-[1.2] font-[560] tracking-[-0.02em] text-ink placeholder:text-ink3/70 focus:outline-none focus-visible:outline-none read-only:text-ink2"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Select aria-label="Meal" value={slot} onChange={(e) => chooseSlot(e.target.value)} className="w-36">
          <option value="auto">Auto meal</option>
          {SLOTS.map((option) => (
            <option key={option} value={option}>
              {SLOT_NAMES[option]}
            </option>
          ))}
        </Select>
        {busy ? (
          <Thinking label={WORKING_TEXT} />
        ) : (
          <span className="type-caption text-ink3">
            <kbd className="font-body font-semibold text-ink2">Enter</kbd> to log · <kbd className="font-body font-semibold text-ink2">Shift Enter</kbd> for a new line
          </span>
        )}
        <Button className="ml-auto" disabled={busy || !text.trim()} onClick={() => void submit()}>
          {busy ? "Logging…" : "Log"}
          {busy ? null : <ArrowUp className="size-4" strokeWidth={2.2} />}
        </Button>
      </div>

      {empty ? <p className="mt-3 type-secondary text-ink2">I didn't catch any food there. Try "2 roti and dal".</p> : null}
      {problem ? (
        <p role="alert" className="mt-3 type-secondary text-polo-ink">
          {problem}
        </p>
      ) : null}
    </section>
  );
}
