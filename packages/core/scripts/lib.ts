import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

/** Gitignored folders for downloads and import output. */
export const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
export const CACHE_DIR = join(DATA_DIR, "cache");
export const OUT_DIR = join(DATA_DIR, "out");

/** Parses RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parses CSV with a header row into one object per data row, keyed by column name. */
export function csvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text.replace(/^\uFEFF/, ""));
  if (header === undefined) return [];
  return rows
    .filter((r) => r.length > 1 || (r[0] ?? "") !== "")
    .map((r) => Object.fromEntries(header.map((name, i) => [name, r[i] ?? ""])));
}

/** Reads the named files from a zip archive (stored or deflated entries, no zip64). Keys are base file names. */
export function unzip(archive: Buffer, wanted: readonly string[]): Map<string, string> {
  const EOCD = 0x06054b50;
  const CENTRAL = 0x02014b50;
  const LOCAL = 0x04034b50;
  let eocd = -1;
  for (let i = archive.length - 22; i >= Math.max(0, archive.length - 65_557); i--) {
    if (archive.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip archive");
  const entries = archive.readUInt16LE(eocd + 10);
  let p = archive.readUInt32LE(eocd + 16);
  const files = new Map<string, string>();
  for (let n = 0; n < entries; n++) {
    if (archive.readUInt32LE(p) !== CENTRAL) throw new Error("corrupt zip central directory");
    const method = archive.readUInt16LE(p + 10);
    const compressedSize = archive.readUInt32LE(p + 20);
    const nameLength = archive.readUInt16LE(p + 28);
    const extraLength = archive.readUInt16LE(p + 30);
    const commentLength = archive.readUInt16LE(p + 32);
    const localOffset = archive.readUInt32LE(p + 42);
    const name = basename(archive.toString("utf8", p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extraLength + commentLength;
    if (!wanted.includes(name)) continue;
    if (compressedSize === 0xffffffff) throw new Error(`zip64 entry not supported: ${name}`);
    if (archive.readUInt32LE(localOffset) !== LOCAL) throw new Error(`corrupt zip local header: ${name}`);
    const start = localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
    const data = archive.subarray(start, start + compressedSize);
    if (method !== 0 && method !== 8) throw new Error(`unsupported zip compression ${method}: ${name}`);
    files.set(name, (method === 8 ? inflateRawSync(data) : data).toString("utf8"));
  }
  const missing = wanted.filter((w) => !files.has(w));
  if (missing.length > 0) throw new Error(`zip is missing ${missing.join(", ")}`);
  return files;
}

/** Downloads a URL into the cache once and returns its bytes. Delete the cache folder to force a fresh download. */
export async function cachedDownload(url: string): Promise<Buffer> {
  await mkdir(CACHE_DIR, { recursive: true });
  const path = join(CACHE_DIR, basename(new URL(url).pathname));
  if (existsSync(path)) return readFile(path);
  console.log(`downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText} for ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path, bytes);
  return bytes;
}

/** Writes rows as newline-delimited JSON into the output folder and returns the file path. */
export async function writeNdjson(fileName: string, rows: readonly unknown[]): Promise<string> {
  await mkdir(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, fileName);
  await writeFile(path, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length > 0 ? "\n" : ""));
  return path;
}

/** Parses a numeric CSV cell. Empty or non-numeric cells are null, never zero. */
export function num(cell: string | undefined): number | null {
  if (cell === undefined || cell.trim() === "") return null;
  const value = Number(cell);
  return Number.isFinite(value) ? value : null;
}
