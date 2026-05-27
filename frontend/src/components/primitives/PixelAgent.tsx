import { useEffect, useState } from "react";
import { motion } from "motion/react";

/**
 * PixelAgent — 16×16 pixel art faces for the 7 specialist agents.
 * Each pixel renders as an 8×8 SVG <rect>; total viewport 128×128.
 * shape-rendering: crispEdges keeps edges sharp at any size.
 *
 * Faces only — no body — to keep the silhouette focused.
 */

export type AgentKind =
  | "main"      // Elephant — main wellness agent (Stry)
  | "diet"      // Panda
  | "workout"   // Tiger
  | "sleep"     // Koala
  | "water"     // Dolphin
  | "habit"     // Ant
  | "wellness"; // Deer

export type AgentState = "idle" | "blink" | "thinking" | "listening";

/* ── Color palette ──────────────────────────────────────── */
/* Shared chars used across all designs */
const COMMON: Record<string, string> = {
  _: "transparent",
  I: "#0d101b", // ink (eyes, outlines, mouths)
  W: "#ffffff", // white highlights / muzzle
  K: "#1a1d2c", // soft black (panda body parts)
  P: "#f4b5d6", // pink (cheeks, ear interior)
};

/* Per-agent palette: maps the agent's grid chars to color hex.
 * `X` = primary head color, `Y` = secondary, `Z` = tertiary. */
const PALETTES: Record<AgentKind, Record<string, string>> = {
  main:     { X: "#bcb4cc", Y: "#9ea5b8", Z: "#b3a0ff" }, // grey + lavender accent
  diet:     { X: "#ffffff", Y: "#1a1d2c", Z: "#b8e5c0" }, // white + black + mint accent
  workout:  { X: "#fdb572", Y: "#ffd9b3", Z: "#0d101b" }, // peach + light + ink stripes
  sleep:    { X: "#a8acc1", Y: "#8a8fa8", Z: "#b3a0ff" }, // grey-blue + lavender night
  water:    { X: "#a0c6ff", Y: "#cde0ff", Z: "#7da6e8" }, // sky + light + deep
  habit:    { X: "#c97a7a", Y: "#7a2a2a", Z: "#f4b5d6" }, // dusty red
  wellness: { X: "#d8a877", Y: "#a37b4a", Z: "#b8e5c0" }, // tan + brown + mint accent
};

/* ── Pixel art designs — faces only ────────────────────────
 * Each entry is exactly 16 rows × 16 chars.
 * Allowed chars per row: X Y Z W I K P _
 * Faces use most space; no body shown.                                              */

/* Elephant (Main / Stry) — wide ears + trunk silhouette */
const PX_ELEPHANT_IDLE = [
  "________________",
  "__XX________XX__",
  "_XXXX______XXXX_",
  "XXPXXX____XXXPXX",
  "XPPXXXXXXXXXXPPX",
  "XPYXXXXXXXXXXYPX",
  "XXXXXIWXXIWXXXXX",
  "XXXXXIIXXIIXXXXX",
  "XXXXXXXXXXXXXXXX",
  "XXXXXIIIIIIXXXXX",
  "_XXXXXXXXXXXXXX_",
  "__XXXXXXXXXXXX__",
  "____XXXXXXXX____",
  "_____XXXXXX_____",
  "______XXXX______",
  "_______XX_______",
];
const PX_ELEPHANT_BLINK = [
  "________________",
  "__XX________XX__",
  "_XXXX______XXXX_",
  "XXPXXX____XXXPXX",
  "XPPXXXXXXXXXXPPX",
  "XPYXXXXXXXXXXYPX",
  "XXXXXIIXXIIXXXXX",
  "XXXXXXXXXXXXXXXX",
  "XXXXXXXXXXXXXXXX",
  "XXXXXIIIIIIXXXXX",
  "_XXXXXXXXXXXXXX_",
  "__XXXXXXXXXXXX__",
  "____XXXXXXXX____",
  "_____XXXXXX_____",
  "______XXXX______",
  "_______XX_______",
];
const PX_ELEPHANT_THINK = [
  "________________",
  "__XX________XX__",
  "_XXXX_____ZZZZZ_",
  "XXPXXX___ZIIIIZ_",  // thought bubble Z
  "XPPXXXXXXZIIIIZ_",
  "XPYXXXXXXXZZZZ__",
  "XXXXXIWXXIWXXXXX",
  "XXXXXIIXXIIXXXXX",
  "XXXXXXXXXXXXXXXX",
  "XXXXXIIIIIIXXXXX",
  "_XXXXXXXXXXXXXX_",
  "__XXXXXXXXXXXX__",
  "____XXXXXXXX____",
  "_____XXXXXX_____",
  "______XXXX______",
  "_______XX_______",
];
const PX_ELEPHANT_LISTEN = [
  "________________",
  "__XX________XX__",
  "_XXXX______XXXX_",
  "XXPXXX____XXXPXX",
  "XPPXXXXXXXXXXPPX",
  "XPYXXXXXXXXXXYPX",
  "XXXXIIWWXXWWIIXX",  // wide eyes
  "XXXXIWWWXXWWWIXX",
  "XXXXIIWWXXWWIIXX",
  "XXXXXXXXXXXXXXXX",
  "_XXXXXXXXXXXXXX_",
  "__XXXXXXXXXXXX__",
  "____XXXXXXXX____",
  "_____XXXXXX_____",
  "______XXXX______",
  "_______XX_______",
];

/* Panda (Diet) — round head, black ears + eye patches, small smile */
const PX_PANDA = [
  "___KK______KK___",
  "__KKKK____KKKK__",
  "_KKXXXXXXXXXXKK_",
  "KKXXXXXXXXXXXXKK",
  "XXXXXXXXXXXXXXXX",
  "XXXKKKXXXXKKKXXX",
  "XXKKKKKXXKKKKKXX",
  "XXKKWKKXXKKWKKXX",
  "XXKKKKKXXKKKKKXX",
  "XXXKKKXXXXKKKXXX",
  "XXXXXXXKKXXXXXXX",
  "XXXXXXXKKXXXXXXX",
  "XXXXXIIXXIIXXXXX",
  "_XXXXXIIIIXXXXX_",
  "__XXXXXXXXXXXX__",
  "____XXXXXXXX____",
];

/* Tiger (Workout) — pointy ears, stripes, white muzzle */
const PX_TIGER = [
  "_XX________XX___",
  "XXXX______XXXX__",
  "XXXXXX__XXXXXX__",
  "XXXXXXXXXXXXXXXX",
  "ZXXXXXXXXXXXXXXZ",
  "XXZXXXXXXXXXXZXX",
  "XXXXXIIXXIIXXXXX",
  "XXZXXIWXXIWXXZXX",
  "XXXXXXXXXXXXXXXX",
  "XXXXXWWWWWWXXXXX",
  "XXXXWWWZZWWWXXXX",
  "XXZXWWWZZWWWXZXX",
  "XXXXWZZWWZZWXXXX",
  "_XXXXWWWWWWXXXX_",
  "__XXXXXXXXXXXX__",
  "____XXXXXXXX____",
];

/* Koala (Sleep) — huge fluffy ears, big black nose, sleepy eyes */
const PX_KOALA = [
  "XXXX______XXXX__",
  "XXPXX____XXPXX__",
  "XPPPXX__XPPPXX__",
  "XPPXXXXXXXPPXXX_",
  "_XXXXXXXXXXXXX__",
  "__XXXXXXXXXXX___",
  "__XXIIXXIIXXX___",  // sleepy eyes (lines)
  "__XXXXXXXXXXX___",
  "__XXIIIIIIXXX___",  // big black nose
  "__XXIIIIIIXXX___",
  "__XXIIIIIIXXX___",
  "__XXXIIIIXXXX___",
  "__XXXXIIXXXXX___",
  "___XXXXXXXX_____",
  "____XXXXXX______",
  "________________",
];

/* Dolphin (Water) — sleek dome head, smile, tapering snout */
const PX_DOLPHIN = [
  "________________",
  "____XXXXXXXX____",
  "__XXXXXXXXXXXX__",
  "_XXXXXXXXXXXXXX_",
  "XXXXXXXXXXXXXXXX",
  "XXXXIWXXXXIWXXXX",
  "XXXIWWXXXXIWWXXX",
  "XXXIIWXXXXIIWXXX",
  "XXXXXXXXXXXXXXXX",
  "XXXXXPPPPPPXXXXX",
  "XXXXPPPPPPPPXXXX",
  "XXXXXPPPPPPXXXXX",
  "XXXXXXXXXXXXXXXX",
  "_XXXXXXXXXXXXXX_",
  "___XXXXXXXXXX___",
  "_____XXXXXX_____",
];

/* Ant (Habit) — antennae, small head, big compound eyes */
const PX_ANT = [
  "____II_____II___",
  "____I______I____",
  "____I______I____",
  "_____I____I_____",
  "_____II__II_____",
  "______IXXI______",
  "_____XXXXXX_____",
  "____XXXXXXXX____",
  "____XWWWWWWX____",
  "____XWIIIIWX____",
  "____XWIIIIWX____",
  "____XWWWWWWX____",
  "_____XXXXXX_____",
  "______IXXI______",
  "______I__I______",
  "________________",
];

/* Deer (Wellness) — antlers branching up, black nose, gentle eyes */
const PX_DEER = [
  "_Y_Y_Y____Y_Y_Y_",
  "_YYYYY____YYYYY_",
  "__YYY______YYY__",
  "___YY______YY___",
  "____XXXXXXXX____",
  "___XXXXXXXXXX___",
  "__XXXXXXXXXXXX__",
  "_XXXXIWXXIWXXXX_",
  "_XXXXIIXXIIXXXX_",
  "_XXXXXXXXXXXXXX_",
  "_XXXXXXIIXXXXXX_",
  "__XXXXIIIIXXXX__",
  "__XXXXIIIIXXXX__",
  "___XXXXXXXXXX___",
  "____XXXXXXXX____",
  "______XXXX______",
];

const FRAMES: Record<AgentKind, Record<AgentState, string[]>> = {
  main: {
    idle: PX_ELEPHANT_IDLE,
    blink: PX_ELEPHANT_BLINK,
    thinking: PX_ELEPHANT_THINK,
    listening: PX_ELEPHANT_LISTEN,
  },
  diet:     { idle: PX_PANDA,   blink: PX_PANDA,   thinking: PX_PANDA,   listening: PX_PANDA },
  workout:  { idle: PX_TIGER,   blink: PX_TIGER,   thinking: PX_TIGER,   listening: PX_TIGER },
  sleep:    { idle: PX_KOALA,   blink: PX_KOALA,   thinking: PX_KOALA,   listening: PX_KOALA },
  water:    { idle: PX_DOLPHIN, blink: PX_DOLPHIN, thinking: PX_DOLPHIN, listening: PX_DOLPHIN },
  habit:    { idle: PX_ANT,     blink: PX_ANT,     thinking: PX_ANT,     listening: PX_ANT },
  wellness: { idle: PX_DEER,    blink: PX_DEER,    thinking: PX_DEER,    listening: PX_DEER },
};

/* ── Component ──────────────────────────────────────── */

const PIXEL = 8;
const GRID = 16;
const VIEWPORT = PIXEL * GRID;

type PixelAgentProps = {
  agent?: AgentKind;
  size?: number;
  state?: AgentState;
  /** Disable idle bob (for chat bubbles, dock items) */
  static?: boolean;
  className?: string;
};

export function PixelAgent({
  agent = "main",
  size = 128,
  state = "idle",
  static: isStatic = false,
  className,
}: PixelAgentProps) {
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    // Only the main elephant has blink frames distinct from idle.
    if (agent !== "main" || state !== "idle") return;
    let timeoutId: number | undefined;
    const blinkLoop = () => {
      setBlinking(true);
      window.setTimeout(() => setBlinking(false), 130);
      timeoutId = window.setTimeout(blinkLoop, 2800 + Math.random() * 2400);
    };
    timeoutId = window.setTimeout(blinkLoop, 1200 + Math.random() * 1500);
    return () => { if (timeoutId !== undefined) window.clearTimeout(timeoutId); };
  }, [agent, state]);

  const frames = FRAMES[agent];
  const data = state === "idle" && blinking ? frames.blink : frames[state];
  const palette = PALETTES[agent];

  const colorFor = (ch: string): string | null => {
    const fromCommon = COMMON[ch];
    if (fromCommon !== undefined) return fromCommon === "transparent" ? null : fromCommon;
    return palette[ch] ?? null;
  };

  const pixels: React.ReactElement[] = [];
  data.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = colorFor(row[x]);
      if (!color) continue;
      pixels.push(
        <rect
          key={`${x}-${y}`}
          x={x * PIXEL}
          y={y * PIXEL}
          width={PIXEL}
          height={PIXEL}
          fill={color}
        />,
      );
    }
  });

  const Wrapper = isStatic ? "svg" : motion.svg;
  const motionProps = isStatic
    ? {}
    : {
        animate: { y: [0, -4, 0] },
        transition: { duration: 3.4, repeat: Infinity, ease: "easeInOut" as const },
      };

  return (
    <Wrapper
      viewBox={`0 0 ${VIEWPORT} ${VIEWPORT}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={agent}
      className={className}
      {...motionProps}
    >
      {pixels}
    </Wrapper>
  );
}
