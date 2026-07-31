/**
 * Chat card sizing system.
 *
 * One set of layout rules shared by the Home surface (AssistantConsole) and the
 * Coach surface (CoachPage) so cards can never drift apart between the two.
 * Sizing is expressed as real responsive layout (widths, gutters, minimum
 * target and type sizes) — never as a post-hoc visual transform such as CSS
 * `zoom`, which shrinks type below legibility and bypasses breakpoints.
 *
 * The rules are documented, with the reasoning and the QA checklist, in
 * `SIZING.md` next to this file. Change them here and there together.
 */

/** Minimum interactive target on any card control, in CSS pixels. */
export const CHAT_CARD_MIN_TOUCH_PX = 44;

/** Minimum type size for any text rendered inside a card, in CSS pixels. */
export const CHAT_CARD_MIN_TYPE_PX = 13;

/** Absolute maximum rendered card width, in CSS pixels. */
export const CHAT_CARD_MAX_WIDTH_PX = 560;

/**
 * Transcript column. Identical max width and gutters on Home and Coach:
 * 16px gutters below `sm`, 20px from `sm`, 24px from `lg`, capped at 720px.
 */
export const CHAT_COLUMN = "mx-auto w-full max-w-[720px] px-4 sm:px-5 lg:px-6";

/**
 * Card band. Full column width on phones (where the gutters already provide the
 * breathing room), capped at 560px from `sm` up so a card never stretches the
 * whole chat column.
 */
export const CHAT_CARD_BAND = "w-full max-w-full sm:max-w-[560px]";

/** Card shell: border, elevation, radius and padding. */
export const CHAT_CARD_SURFACE =
  "w-full rounded-[16px] border border-ink/8 bg-white p-4 shadow-[0_8px_24px_rgba(13,16,27,0.06)] dark:border-white/10 dark:bg-[#1a1e2e]";

/** Nested row inside a card (one logged/pending item). */
export const CHAT_CARD_ROW = "rounded-[12px] border border-ink/8 p-3 dark:border-white/10";

/** Minimum interactive target, applied to every control a card renders. */
export const CHAT_CARD_TOUCH_TARGET = "min-h-[44px] min-w-[44px]";

/** Primary/secondary pill button geometry (already includes the touch target). */
export const CHAT_CARD_PILL =
  `${CHAT_CARD_TOUCH_TARGET} inline-flex items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-extrabold transition-colors disabled:cursor-default disabled:opacity-40`;

/** Text input / date input geometry (already includes the touch target). */
export const CHAT_CARD_FIELD =
  `${CHAT_CARD_TOUCH_TARGET} rounded-[10px] border border-ink/10 bg-surface px-3 text-[14px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-lavender/40 disabled:opacity-50 dark:border-white/10 dark:bg-[#0b0d15] dark:text-surface`;

/** Icon-only control (remove, toggle) — square, still 44px minimum. */
export const CHAT_CARD_ICON_BUTTON =
  `${CHAT_CARD_TOUCH_TARGET} inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-default disabled:opacity-40`;

/* ── Type scale ──────────────────────────────────────────────────────────── */

/** Card title. */
export const CHAT_CARD_TITLE = "text-[15px] font-extrabold leading-snug text-ink dark:text-surface";
/** Body copy inside a card. */
export const CHAT_CARD_BODY = "text-[14px] leading-relaxed text-ink dark:text-surface";
/** Secondary/meta copy — the smallest type any card may use. */
export const CHAT_CARD_META = "text-[13px] leading-snug text-ink/55 dark:text-white/55";
/** Uppercase category label. */
export const CHAT_CARD_EYEBROW =
  "text-[13px] font-extrabold uppercase tracking-[0.04em] text-ink/45 dark:text-white/45";

const TOUCH_TOKENS = CHAT_CARD_TOUCH_TARGET.split(" ");

/**
 * Objective check used by tests and reviewers: does this control carry the
 * shared minimum-target rule? Class-based rather than pixel-based so it holds
 * in jsdom and stays honest about what actually ships in the stylesheet.
 */
export function hasMinimumTouchTarget(element: Element): boolean {
  const className = element.getAttribute("class") ?? "";
  return TOUCH_TOKENS.every((token) => className.split(/\s+/).includes(token));
}
