import { useEffect, useState, lazy, Suspense, Component, type ReactNode } from "react";
import type { CSSProperties } from "react";
import { PixelAgent, type AgentKind, type AgentState } from "@/components/primitives/PixelAgent";
import { supportsWebGL } from "./voxel-meta";

const VoxelTrack = lazy(() =>
  import("./VoxelTrack").then((m) => ({ default: m.VoxelTrack })),
);

type VoxelAgentProps = {
  agent?: AgentKind;
  size?: number;
  state?: AgentState;
  static?: boolean;
  className?: string;
};

/* ── ErrorBoundary that falls back to PixelAgent ── */
type EBProps = { agent: AgentKind; size: number; state: AgentState; isStatic: boolean; className?: string; children: ReactNode };
type EBState = { hasError: boolean };
class VoxelErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return <PixelAgent agent={this.props.agent} size={this.props.size} state={this.props.state} static={this.props.isStatic} className={this.props.className} />;
    }
    return this.props.children;
  }
}

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
    <VoxelErrorBoundary agent={agent} size={size} state={state} isStatic={isStatic} className={className}>
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
    </VoxelErrorBoundary>
  );
}
