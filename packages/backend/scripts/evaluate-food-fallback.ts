import { readFile } from "node:fs/promises"

type Macros = { kcal: number; protein_g: number; carbs_g: number; fat_g: number }
type SavedOutputs = { database: Record<string, Macros>; llm: Record<string, Macros> }
type ReferenceCase = {
  name: string
  fdcId: number
  sourceUrl: string
  apiGuideUrl: string
  portionLabel: string
  portionGrams: number
  referencePer100g: Macros
  databaseFixture: Macros
  llmFixture: Macros
}

const cases: ReferenceCase[] = [
  {
    name: "Chapati / roti, plain",
    fdcId: 171844,
    sourceUrl: "https://api.nal.usda.gov/fdc/v1/food/171844?api_key=DEMO_KEY",
    apiGuideUrl: "https://fdc.nal.usda.gov/api-guide/",
    portionLabel: "one piece",
    portionGrams: 68,
    referencePer100g: { kcal: 297, protein_g: 11.25, carbs_g: 46.36, fat_g: 7.45 },
    databaseFixture: { kcal: 297, protein_g: 11.25, carbs_g: 46.36, fat_g: 7.45 },
    llmFixture: { kcal: 300, protein_g: 11, carbs_g: 45, fat_g: 7.5 },
  },
  {
    name: "White long-grain rice, cooked",
    fdcId: 168878,
    sourceUrl: "https://api.nal.usda.gov/fdc/v1/food/168878?api_key=DEMO_KEY",
    apiGuideUrl: "https://fdc.nal.usda.gov/api-guide/",
    portionLabel: "one cup",
    portionGrams: 158,
    referencePer100g: { kcal: 130, protein_g: 2.69, carbs_g: 28.17, fat_g: 0.28 },
    databaseFixture: { kcal: 130, protein_g: 2.69, carbs_g: 28.17, fat_g: 0.28 },
    llmFixture: { kcal: 135, protein_g: 2.7, carbs_g: 29, fat_g: 0.3 },
  },
  {
    name: "White long-grain parboiled rice, cooked",
    fdcId: 169708,
    sourceUrl: "https://api.nal.usda.gov/fdc/v1/food/169708?api_key=DEMO_KEY",
    apiGuideUrl: "https://fdc.nal.usda.gov/api-guide/",
    portionLabel: "one cup",
    portionGrams: 158,
    referencePer100g: { kcal: 123, protein_g: 2.91, carbs_g: 26.05, fat_g: 0.37 },
    databaseFixture: { kcal: 123, protein_g: 2.91, carbs_g: 26.05, fat_g: 0.37 },
    llmFixture: { kcal: 128, protein_g: 3, carbs_g: 27, fat_g: 0.4 },
  },
]

/** Narrows parsed JSON to a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Converts a source portion into the per-100-g basis used by Stride foods. */
function normalizePortion(per100g: Macros, grams: number): Macros {
  const normalize = (value: number): number => (value * grams / 100) * 100 / grams
  return {
    kcal: normalize(per100g.kcal),
    protein_g: normalize(per100g.protein_g),
    carbs_g: normalize(per100g.carbs_g),
    fat_g: normalize(per100g.fat_g),
  }
}

/** Reports absolute per-100-g differences for energy and each stored macro. */
function errors(prediction: Macros, reference: Macros): Macros {
  const rounded = (value: number): number => Math.round(value * 10_000) / 10_000
  return {
    kcal: rounded(Math.abs(prediction.kcal - reference.kcal)),
    protein_g: rounded(Math.abs(prediction.protein_g - reference.protein_g)),
    carbs_g: rounded(Math.abs(prediction.carbs_g - reference.carbs_g)),
    fat_g: rounded(Math.abs(prediction.fat_g - reference.fat_g)),
  }
}

/** Validates one untrusted saved model/database nutrient row. */
function readMacros(value: unknown): Macros | null {
  if (!isRecord(value)) return null
  const row = value
  const { kcal, protein_g, carbs_g, fat_g } = row
  if ([kcal, protein_g, carbs_g, fat_g].some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) return null
  if (typeof kcal !== "number" || typeof protein_g !== "number" || typeof carbs_g !== "number" || typeof fat_g !== "number") return null
  return { kcal, protein_g, carbs_g, fat_g }
}

/** Reads explicit offline outputs; live provider calls are not supported by this evaluator. */
async function readSavedOutputs(path: string): Promise<SavedOutputs> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"))
  if (!isRecord(parsed)) throw new Error("Saved outputs must be an object")
  const root = parsed
  const result: SavedOutputs = { database: {}, llm: {} }
  for (const source of ["database", "llm"] as const) {
    const rows = root[source]
    if (!isRecord(rows)) throw new Error(`Saved outputs need a ${source} object`)
    for (const item of cases) {
      const row = readMacros(rows[String(item.fdcId)])
      if (row === null) throw new Error(`${source} output is missing a valid FDC ${item.fdcId} row`)
      result[source][String(item.fdcId)] = row
    }
  }
  return result
}

/** Checks reference portion math and reports offline fixture or saved-output errors. */
async function main(): Promise<void> {
  const savedPath = process.argv.slice(2).find((argument) => argument !== "--")
  const saved = savedPath === undefined ? null : await readSavedOutputs(savedPath)
  const output = cases.map((item) => {
    const reference = normalizePortion(item.referencePer100g, item.portionGrams)
    if (Object.values(errors(reference, item.referencePer100g)).some((error) => error > 1e-9)) {
      throw new Error(`Portion normalization failed for FDC ${item.fdcId}`)
    }
    return {
      name: item.name,
      reference: {
        provider: "USDA FoodData Central",
        fdcId: item.fdcId,
        url: item.sourceUrl,
        apiGuideUrl: item.apiGuideUrl,
        portionLabel: item.portionLabel,
        portionGrams: item.portionGrams,
        perPortion: {
          kcal: item.referencePer100g.kcal * item.portionGrams / 100,
          protein_g: item.referencePer100g.protein_g * item.portionGrams / 100,
          carbs_g: item.referencePer100g.carbs_g * item.portionGrams / 100,
          fat_g: item.referencePer100g.fat_g * item.portionGrams / 100,
        },
        per100g: reference,
      },
      errorAbsPer100g: {
        database: errors(saved?.database[String(item.fdcId)] ?? item.databaseFixture, reference),
        llm: errors(saved?.llm[String(item.fdcId)] ?? item.llmFixture, reference),
      },
    }
  })
  process.stdout.write(`${JSON.stringify({
    evidence: saved === null
      ? "source-backed references and synthetic math fixtures; no live model output or model-quality claim"
      : "source-backed references and explicit saved database/model outputs; no live calls and no independent model-quality claim",
    errorUnits: "kcal and grams per 100 g, absolute",
    cases: output,
  }, null, 2)}\n`)
}

main()
