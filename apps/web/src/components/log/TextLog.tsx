import { useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { SLOTS, SLOT_NAMES, plainError, type MealSlot } from "@/lib/log";
import { submissionIdFor, type Submission } from "./submission";
import { loggedTitle, namesOf, useLogToast } from "./toasts";
import { field, primaryButton } from "./ui";

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
    <section className="flex flex-col gap-3 rounded-card bg-card p-5 shadow-card">
      <label className="flex flex-col gap-2">
        <span className="font-display text-lg font-bold">What did you eat?</span>
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
          className={`${field} resize-none`}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Meal"
          value={slot}
          onChange={(e) => chooseSlot(e.target.value)}
          className={field}
        >
          <option value="auto">Auto</option>
          {SLOTS.map((option) => (
            <option key={option} value={option}>
              {SLOT_NAMES[option]}
            </option>
          ))}
        </select>
        <button type="button" disabled={busy || !text.trim()} onClick={() => void submit()} className={primaryButton}>
          {busy ? "Logging…" : "Log"}
        </button>
        {busy ? <span className="text-sm text-ink2">{WORKING_TEXT}</span> : null}
      </div>

      {empty ? <p className="text-sm text-ink2">I didn't catch any food there. Try "2 roti and dal".</p> : null}
      {problem ? <p className="text-sm text-polo-ink">{problem}</p> : null}
    </section>
  );
}
