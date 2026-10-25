import { readFile } from "node:fs/promises"

type Macros = { kcal: number; protein_g: number; carbs_g: number; fat_g: number }
type NutrientPrediction = { basis: "per100g"; values: Macros } | { basis: "portion"; values: Macros; grams: number }
type SavedOutputs = {
  capturedAt?: string
  llmModel?: string
  database: Record<string, NutrientPrediction>
  llm: Record<string, NutrientPrediction>
}
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
    name: "Bread, chapati or roti, plain, commercially prepared",
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
    name: "Rice, white, long-grain, parboiled, enriched, cooked",
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

/** Scales a per-100-g nutrient row to a named portion. */
function toPortion(values: Macros, grams: number): Macros {
  const scale = (value: number): number => value * grams / 100
  return {
    kcal: scale(values.kcal),
    protein_g: scale(values.protein_g),
    carbs_g: scale(values.carbs_g),
    fat_g: scale(values.fat_g),
  }
}

/** Converts explicitly labeled nutrient totals to the per-100-g basis used for comparison. */
function normalizePrediction(prediction: NutrientPrediction): Macros {
  if (prediction.basis === "per100g") return prediction.values
  if (!Number.isFinite(prediction.grams) || prediction.grams <= 0) throw new Error("Portion grams must be positive")
  const scale = (value: number): number => value * 100 / prediction.grams
  return {
    kcal: scale(prediction.values.kcal),
    protein_g: scale(prediction.values.protein_g),
    carbs_g: scale(prediction.values.carbs_g),
    fat_g: scale(prediction.values.fat_g),
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

/** Validates one untrusted nutrient row from a saved output file. */
function readMacros(value: unknown): Macros | null {
  if (!isRecord(value)) return null
  const { kcal, protein_g, carbs_g, fat_g } = value
  if ([kcal, protein_g, carbs_g, fat_g].some((macro) => typeof macro !== "number" || !Number.isFinite(macro) || macro < 0)) return null
  if (typeof kcal !== "number" || typeof protein_g !== "number" || typeof carbs_g !== "number" || typeof fat_g !== "number") return null
  return { kcal, protein_g, carbs_g, fat_g }
}

/** Parses an explicitly based prediction from a saved file. */
function readPrediction(value: unknown): NutrientPrediction | null {
  if (!isRecord(value)) return null
  const values = readMacros(value.values)
  if (values === null) return null
  if (value.basis === "per100g") return { basis: "per100g", values }
  if (value.basis === "portion" && typeof value.grams === "number" && Number.isFinite(value.grams) && value.grams > 0) {
    return { basis: "portion", values, grams: value.grams }
  }
  return null
}

/** Reads explicit offline database/model outputs and validates their basis. */
async function readSavedOutputs(path: string): Promise<SavedOutputs> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"))
  if (!isRecord(parsed)) throw new Error("Saved outputs must be an object")
  const root = parsed
  const result: SavedOutputs = { database: {}, llm: {} }
  if (typeof root.capturedAt === "string") result.capturedAt = root.capturedAt
  if (typeof root.llmModel === "string") result.llmModel = root.llmModel
  for (const source of ["database", "llm"] as const) {
    const rows = root[source]
    if (!isRecord(rows)) throw new Error(`Saved outputs need a ${source} object`)
    for (const item of cases) {
      const prediction = readPrediction(rows[String(item.fdcId)])
      if (prediction === null) throw new Error(`${source} output is missing a valid based FDC ${item.fdcId} row`)
      result[source][String(item.fdcId)] = prediction
    }
  }
  return result
}

/** Verifies conversion from a non-100-g portion and rejects zero-mass totals. */
function assertPortionMath(): void {
  const firstCase = cases[0]
  if (firstCase === undefined) throw new Error("No reference cases are configured")
  const reference = firstCase.referencePer100g
  const grams = 50
  const normalized = normalizePrediction({ basis: "portion", grams, values: toPortion(reference, grams) })
  if (Object.values(errors(normalized, reference)).some((error) => error > 1e-9)) throw new Error("Non-100-g portion normalization failed")
  try {
    normalizePrediction({ basis: "portion", grams: 0, values: reference })
  } catch (err) {
    if (err instanceof Error && err.message === "Portion grams must be positive") return
    throw err;
  }
  throw new Error("Zero-mass portion was accepted")
}

/** Reports offline fixture or saved-output errors without a live model call. */
async function main(): Promise<void> {
  assertPortionMath()
  const savedPath = process.argv.slice(2).find((argument) => argument !== "--")
  const saved = savedPath === undefined ? null : await readSavedOutputs(savedPath)
  const output = cases.map((item) => {
    const reference = item.referencePer100g
    const database = saved?.database[String(item.fdcId)] ?? { basis: "per100g", values: item.databaseFixture } satisfies NutrientPrediction
    const llm = saved?.llm[String(item.fdcId)] ?? { basis: "per100g", values: item.llmFixture } satisfies NutrientPrediction
    return {
      name: item.name,
      reference: {
        provider: "USDA FoodData Central",
        fdcId: item.fdcId,
        url: item.sourceUrl,
        apiGuideUrl: item.apiGuideUrl,
        portionLabel: item.portionLabel,
        portionGrams: item.portionGrams,
        perPortion: toPortion(reference, item.portionGrams),
        per100g: reference,
      },
      predictions: { database, llm },
      portionGramsAbsoluteError: {
        database: database.basis === "portion" ? Math.abs(database.grams - item.portionGrams) : null,
        llm: llm.basis === "portion" ? Math.abs(llm.grams - item.portionGrams) : null,
      },
      errorAbsPer100g: {
        database: errors(normalizePrediction(database), reference),
        llm: errors(normalizePrediction(llm), reference),
      },
    }
  })
  process.stdout.write(`${JSON.stringify({
    evidence: saved === null
      ? "source-backed references and synthetic math fixtures; no live model output or model-quality claim"
      : "source-backed references and explicit saved database/model outputs; no live calls and no independent model-quality claim",
    ...(saved?.capturedAt === undefined ? {} : { capturedAt: saved.capturedAt }),
    ...(saved?.llmModel === undefined ? {} : { llmModel: saved.llmModel }),
    errorUnits: "kcal and grams per 100 g, absolute",
    cases: output,
  }, null, 2)}\n`)
}

main()
