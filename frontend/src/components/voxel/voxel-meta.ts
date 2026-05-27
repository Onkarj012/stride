import type { Agent } from "@/lib/storage";

export type VoxelMeta = {
  slug: string;
  rotationOffsetY: number;
  yOffset: number;
  scale: number;
  rimColor: string;
};

export const VOXEL_BY_AGENT: Record<Agent, VoxelMeta> = {
  main:     { slug: "elephant", rotationOffsetY: 0, yOffset: 0, scale: 1.0,  rimColor: "#b3a0ff" },
  diet:     { slug: "panda",    rotationOffsetY: 0, yOffset: 0, scale: 1.0,  rimColor: "#b8e5c0" },
  workout:  { slug: "fox",      rotationOffsetY: 0, yOffset: 0, scale: 1.0,  rimColor: "#fdb572" },
  sleep:    { slug: "bear",     rotationOffsetY: 0, yOffset: 0, scale: 1.0,  rimColor: "#a0c6ff" },
  water:    { slug: "axolotl",  rotationOffsetY: 0, yOffset: 0, scale: 1.05, rimColor: "#f4b5d6" },
  habit:    { slug: "mouse",    rotationOffsetY: 0, yOffset: 0, scale: 1.05, rimColor: "#a0c6ff" },
  wellness: { slug: "unicorn",  rotationOffsetY: 0, yOffset: 0, scale: 0.95, rimColor: "#b8e5c0" },
};

export function supportsWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return !!gl;
  } catch {
    return false;
  }
}
