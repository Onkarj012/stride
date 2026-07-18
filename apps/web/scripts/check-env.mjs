import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const REQUIRED_VARS = ["VITE_CONVEX_URL", "VITE_CLERK_PUBLISHABLE_KEY"];

export function missingProductionEnv(env = process.env) {
  if (env.NODE_ENV === "development" || env.VITE_MODE === "development") return [];
  return REQUIRED_VARS.filter((name) => !env[name]);
}

function loadEnvFiles() {
  const fileEnv = {};
  for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      fileEnv[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
  return fileEnv;
}

const isDirectRun = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  const missing = missingProductionEnv({ ...loadEnvFiles(), ...process.env });
  if (missing.length > 0) {
    console.error(`Missing required production environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}
