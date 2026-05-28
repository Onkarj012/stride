import { Suspense, useCallback, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { View } from "@react-three/drei";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import {
  TextureLoader,
  NearestFilter,
  MeshStandardMaterial,
  type Mesh,
  type Group,
} from "three";
import type { AgentKind, AgentState } from "@/components/primitives/PixelAgent";
import { VOXEL_BY_AGENT } from "./voxel-meta";

type VoxelTrackProps = {
  agent: AgentKind;
  size: number;
  state: AgentState;
  spinning: boolean;
  className?: string;
};

/* ── Collectible prop per agent ── */
const PROP: Record<AgentKind, string | null> = {
  main:     "apple",
  diet:     "bamboo",
  workout:  "carrot",
  sleep:    "honey",
  water:    "fish",
  habit:    "banana",
  wellness: "carrot",
};

/* ── Shared material factory ── */
function useMeshMaterial(texturePath: string) {
  const texture = useLoader(TextureLoader, texturePath);
  return useMemo(() => {
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    return new MeshStandardMaterial({ map: texture, roughness: 0.55, metalness: 0 });
  }, [texture]);
}

/* ── Animal mesh ── */
function AnimalMesh({
  agent,
  state,
  mouseX,
  mouseY,
}: {
  agent: AgentKind;
  state: AgentState;
  mouseX: React.MutableRefObject<number>;
  mouseY: React.MutableRefObject<number>;
}) {
  const meta = VOXEL_BY_AGENT[agent];
  const obj = useLoader(OBJLoader, `/voxels/${meta.slug}/${meta.slug}.vox.obj`);
  const mat = useMeshMaterial(`/voxels/${meta.slug}/${meta.slug}.vox.png`);

  const cloned = useMemo(() => {
    const c = obj.clone(true);
    c.traverse((child) => {
      const m = child as Mesh;
      if (m.isMesh) m.material = mat;
    });
    return c;
  }, [obj, mat]);

  const groupRef = useRef<Group>(null);
  // Smooth mouse-driven rotation targets
  const targetRY = useRef(0);
  const targetRX = useRef(0);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;

    const t = performance.now() / 1000;

    // Gentle Y bob
    const amp = state === "listening" ? 0.08 : 0.04;
    g.position.y = Math.sin(t * 1.1) * amp;

    // Mouse-reactive tilt — map [-1..1] to ±0.25 rad
    targetRY.current = mouseX.current * 0.28;
    targetRX.current = -mouseY.current * 0.18;

    // Smooth lerp toward target
    const speed = 4 * delta;
    g.rotation.y += (targetRY.current - g.rotation.y) * speed;
    g.rotation.x += (targetRX.current - g.rotation.x) * speed;
  });

  return (
    <group ref={groupRef} scale={meta.scale}>
      <primitive object={cloned} />
    </group>
  );
}

/* ── Floating collectible prop ── */
function PropMesh({ slug, orbitRadius = 1.4 }: { slug: string; orbitRadius?: number }) {
  const obj = useLoader(OBJLoader, `/voxels/collectibles/${slug}/${slug}.vox.obj`);
  const mat = useMeshMaterial(`/voxels/collectibles/${slug}/${slug}.vox.png`);

  const cloned = useMemo(() => {
    const c = obj.clone(true);
    c.traverse((child) => {
      const m = child as Mesh;
      if (m.isMesh) m.material = mat;
    });
    return c;
  }, [obj, mat]);

  const groupRef = useRef<Group>(null);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const t = performance.now() / 1000;
    // Orbit around the animal + gentle float
    g.position.x = Math.cos(t * 0.55) * orbitRadius;
    g.position.z = Math.sin(t * 0.55) * orbitRadius * 0.4;
    g.position.y = 0.4 + Math.sin(t * 1.4) * 0.12;
    // Slowly spin the prop itself
    g.rotation.y = t * 0.8;
  });

  return (
    <group ref={groupRef} scale={0.55}>
      <primitive object={cloned} />
    </group>
  );
}

/* ── Scene ── */
function VoxelScene({
  agent,
  state,
  mouseX,
  mouseY,
}: {
  agent: AgentKind;
  state: AgentState;
  mouseX: React.MutableRefObject<number>;
  mouseY: React.MutableRefObject<number>;
}) {
  const meta = VOXEL_BY_AGENT[agent];
  const propSlug = PROP[agent];

  return (
    <>
      {/* Soft ambient */}
      <ambientLight intensity={0.6} />
      {/* Key — warm white from upper-right front */}
      <directionalLight position={[3, 5, 4]} intensity={1.4} color="#fff8f0" />
      {/* Cool fill from upper-left */}
      <directionalLight position={[-4, 3, 2]} intensity={0.5} color="#d0e8ff" />
      {/* Agent-tinted rim from behind */}
      <pointLight
        position={[0, 1.2, -3.5]}
        intensity={6}
        color={meta.rimColor}
        distance={7}
        decay={1.4}
      />
      {/* Warm bounce from below */}
      <directionalLight position={[0, -3, 1]} intensity={0.3} color="#ffe8d4" />

      <Suspense fallback={null}>
        <AnimalMesh agent={agent} state={state} mouseX={mouseX} mouseY={mouseY} />
        {propSlug && <PropMesh slug={propSlug} />}
      </Suspense>
    </>
  );
}

/* ── Public Track component ── */
export function VoxelTrack({ agent, size, state, className }: VoxelTrackProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const mouseX = useRef(0);
  const mouseY = useRef(0);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.current = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseY.current = ((e.clientY - rect.top) / rect.height) * 2 - 1;
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseX.current = 0;
    mouseY.current = 0;
  }, []);

  const style: CSSProperties = { width: size, height: size };

  return (
    <div
      ref={trackRef}
      style={style}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <View
        track={trackRef as React.RefObject<HTMLElement>}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Tight FOV + close camera so the animal fills the frame */}
        <perspectiveCamera position={[0, 0, 3.8]} fov={22} />
        <VoxelScene agent={agent} state={state} mouseX={mouseX} mouseY={mouseY} />
      </View>
    </div>
  );
}
