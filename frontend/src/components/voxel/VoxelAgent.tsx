import { useEffect, useState, lazy, Suspense } from "react";
import type { CSSProperties } from "react";
import { PixelAgent, type AgentKind, type AgentState } from "@/components/primitives/PixelAgent";
import { supportsWebGL } from "./voxel-meta";

/* The heavy 3D scene is split into its own module so three.js stays in the
 * lazy-loaded voxel-vendor chunk. */
const VoxelTrack = lazy(() =>
  import("./VoxelTrack").then((m) => ({ default: m.VoxelTrack })),
);

type VoxelAgentProps = {
  agent?: AgentKind;
  size?: number;
  state?: AgentState;
  /** Disable the idle bob (e.g. for static dock thumbnails) */
  static?: boolean;
  className?: string;
};

export function VoxelAgent({
  agent = "main",
  size = 128,
  state = "idle",
  static: isStatic = false,
  className,
}: VoxelAgentProps) {
  const [webgl, setWebgl] = useState<boolean | null>(null);

  useEffect(() => {
    setWebgl(supportsWebGL());
  }, []);

  const style: CSSProperties = { width: size, height: size };

  // Until we know, render an invisible placeholder of the right size to avoid layout shift.
  if (webgl === null) {
    return <div style={style} className={className} aria-hidden />;
  }

  // Fallback to pixel art if WebGL not available
  if (!webgl) {
    return (
      <PixelAgent
        agent={agent}
        size={size}
        state={state}
        static={isStatic}
        className={className}
      />
    );
  }

  return (
    <Suspense
      fallback={
        <PixelAgent
          agent={agent}
          size={size}
          state={state}
          static={isStatic}
          className={className}
        />
      }
    >
      <VoxelTrack
        agent={agent}
        size={size}
        state={state}
        spinning={!isStatic}
        className={className}
      />
    </Suspense>
  );
}
