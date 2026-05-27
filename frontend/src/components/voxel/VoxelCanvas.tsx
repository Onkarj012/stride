import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { View, PerspectiveCamera } from "@react-three/drei";

/**
 * Global root canvas. Mounted once at the app level — every VoxelAgent
 * portals into this single WebGL context via drei's <View>.
 *
 * Positioned fixed so it doesn't push layout. View tracks the bounds
 * of each DOM element that hosts a VoxelAgent.
 */
export function VoxelCanvas() {
  return (
    <Canvas
      eventSource={typeof document !== "undefined" ? document.body : undefined}
      eventPrefix="client"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        pointerEvents: "none",
        zIndex: 1,
      }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      dpr={[1, 2]}
    >
      <Suspense fallback={null}>
        <View.Port />
      </Suspense>
    </Canvas>
  );
}

/* Re-export the View track component so consumers don't import drei directly */
export { View };
export { PerspectiveCamera };
