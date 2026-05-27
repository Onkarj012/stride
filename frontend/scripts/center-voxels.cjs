#!/usr/bin/env node
/**
 * Center each voxel OBJ vertically so the mesh midpoint sits at Y=0.
 * Run once: node scripts/center-voxels.js
 */
const fs = require("fs");
const path = require("path");

const ANIMALS = ["elephant","panda","fox","bear","axolotl","mouse","unicorn"];
const BASE = path.join(__dirname, "../public/voxels");

for (const animal of ANIMALS) {
  const file = path.join(BASE, animal, `${animal}.vox.obj`);
  const lines = fs.readFileSync(file, "utf8").split("\n");

  // Collect Y values
  let minY = Infinity, maxY = -Infinity;
  for (const line of lines) {
    if (!line.startsWith("v ")) continue;
    const y = parseFloat(line.split(/\s+/)[2]);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const shift = -((minY + maxY) / 2);
  console.log(`${animal}: Y[${minY.toFixed(2)}..${maxY.toFixed(2)}] shift=${shift.toFixed(3)}`);

  const out = lines.map((line) => {
    if (!line.startsWith("v ")) return line;
    const parts = line.split(/\s+/);
    parts[2] = (parseFloat(parts[2]) + shift).toFixed(6);
    return parts.join(" ");
  });

  fs.writeFileSync(file, out.join("\n"), "utf8");
}
console.log("Done.");
