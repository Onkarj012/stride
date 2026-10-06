import { describe, expect, it } from "vitest";
import { mapExercises } from "./exercises.ts";
import { mapFdc } from "./fdc.ts";
import { ifctAliases, mapIfct } from "./ifct.ts";
import { csvRecords, parseCsv } from "./lib.ts";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, commas and newlines inside fields", () => {
    expect(parseCsv('a,"b, c","say ""hi""","x\ny"\r\n1,2,3,4\n')).toEqual([
      ["a", "b, c", 'say "hi"', "x\ny"],
      ["1", "2", "3", "4"],
    ]);
    expect(csvRecords('"id","name"\n"1","Egg"\n')).toEqual([{ id: "1", name: "Egg" }]);
  });
});

describe("mapFdc", () => {
  const files = new Map([
    ["food.csv", [
      '"fdc_id","data_type","description","food_category_id","publication_date"',
      '"1","foundation_food","Beans, cooked","16","2026-04-30"',
      '"2","foundation_food","Salt, table","2","2026-04-30"',
      '"3","sample_food","Beans, sample","16","2026-04-30"',
      '"4","foundation_food","Oil, kJ only","4","2026-04-30"',
    ].join("\n")],
    ["food_nutrient.csv", [
      '"id","fdc_id","nutrient_id","amount"',
      '"10","1","2047","120"', '"11","1","1003","8"', '"12","1","1004","0.5"', '"13","1","1050","21"', '"14","1","1093","5"',
      '"20","2","1093","38758"',
      '"30","3","1008","100"', '"31","3","1003","1"', '"32","3","1004","1"', '"33","3","1005","1"',
      '"40","4","1062","3700"', '"41","4","1003","0"', '"42","4","1004","100"', '"43","4","1005","0"',
    ].join("\n")],
    ["food_portion.csv", [
      '"id","fdc_id","seq_num","amount","measure_unit_id","portion_description","modifier","gram_weight"',
      '"1","1","","1.0","1000","","","170"',
      '"2","1","","1.0","1000","","","180"',
      '"3","1","","0.5","1001","","","8"',
      '"4","1","","1.0","1011","","","263"',
      '"5","1","","3","9999","","oz","85"',
    ].join("\n")],
    ["measure_unit.csv", '"id","name"\n"1000","cup"\n"1001","tablespoon"\n"1011","paired raw w"\n"9999","undetermined"'],
  ]);
  const result = mapFdc(files, "foundation_food");

  it("keeps only the requested data type and drops foods missing kcal or a macro", () => {
    expect(result.foods.map((f) => f.sourceId)).toEqual(["1", "4"]);
    expect(result.skippedFoods).toBe(1);
  });

  it("falls back to Atwater energy, summed carbs and kJ", () => {
    expect(result.foods[0]?.per100g).toEqual({ kcal: 120, protein: 8, carbs: 21, fat: 0.5, fiber: null, sugar: null, sodiumMg: 5 });
    expect(result.foods[1]?.per100g.kcal).toBeCloseTo(3700 / 4.184, 9);
  });

  it("averages lab samples per measure, divides by amount and skips yield pairs and mass units", () => {
    expect(result.portions).toEqual([
      { source: "fdc", sourceId: "1", measure: "cup", description: "cup", gramsPerMeasure: 175 },
      { source: "fdc", sourceId: "1", measure: "tbsp", description: "tablespoon", gramsPerMeasure: 16 },
    ]);
    expect(result.skippedPortions).toBe(2);
  });
});

describe("mapIfct", () => {
  const header = "code,name,scie,lang,grup,enerc,protcnt,fatce,choavldf,fibtg,fsugar,na";
  const csv = [
    header,
    // Synthetic row in the IFCT layout. Real IFCT values must never be committed.
    'T001,"Test grain, raw",Testus granum,"A. Bhat; E. Plain grain; H. Chawal; Mar. Tandool (pandhre).",Cereals,1500,8,0.5,78,2.8,0.7,0.002',
    "X001,Mystery,,,Other,,1,1,1,,,",
  ].join("\n");

  it("converts kJ to kcal and sodium g to mg, and keeps English, Hindi and Marathi aliases", () => {
    const { foods, skippedFoods } = mapIfct(csv);
    expect(skippedFoods).toBe(1);
    expect(foods[0]).toMatchObject({ name: "Test grain, raw", source: "ifct", sourceId: "T001", verified: true });
    expect(foods[0]?.per100g.kcal).toBeCloseTo(1500 / 4.184, 9);
    expect(foods[0]?.per100g.sodiumMg).toBeCloseTo(2, 9);
    expect(foods[0]?.aliases).toEqual(["plain grain", "chawal", "tandool"]);
  });

  it("rejects a CSV without the expected columns", () => {
    expect(() => mapIfct("code,name\nA1,Rice\n")).toThrow(/missing columns/);
  });

  it("parses alias lists with slashes", () => {
    expect(ifctAliases("H. Bhains ka dhood; Tel. Gedha/Barre palu.", "Milk")).toEqual(["bhains ka dhood"]);
  });
});

describe("mapExercises", () => {
  it("keeps names, muscles, equipment and category, and never images", () => {
    const { exercises, skipped } = mapExercises([
      { id: "Bench", name: "Bench Press", category: "strength", equipment: "barbell", mechanic: "compound", level: "beginner",
        primaryMuscles: ["chest"], secondaryMuscles: ["triceps"], images: ["Bench/0.jpg"], instructions: ["Push."] },
      { id: "Bad", name: "No muscles", category: "strength", primaryMuscles: [] },
    ]);
    expect(skipped).toBe(1);
    expect(exercises).toEqual([{
      sourceId: "Bench", name: "Bench Press", category: "strength", equipment: "barbell", mechanic: "compound",
      level: "beginner", primaryMuscles: ["chest"], secondaryMuscles: ["triceps"],
    }]);
    expect(JSON.stringify(exercises)).not.toContain("jpg");
  });
});
