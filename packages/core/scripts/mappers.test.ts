import { describe, expect, it } from "vitest";
import { mapExercises } from "./exercises.ts";
import { mapFdc } from "./fdc.ts";
import { ifctAliases, mapIfct } from "./ifct.ts";
import { mapCofid } from "./cofid.ts";
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

describe("mapFdc with FNDDS rows", () => {
  // Real values from the 2024-10-31 survey zip (Dal fdc_id 2707427, Cappuccino 2710472), trimmed to the nutrients used.
  const files = new Map([
    ["food.csv", [
      '"fdc_id","data_type","description","food_category_id","publication_date"',
      '"2707427","survey_fndds_food","Dal","2802","2022-10-28"',
      '"2710472","survey_fndds_food","Coffee, Cappuccino","7302","2022-10-28"',
    ].join("\n")],
    ["nutrient.csv", [
      '"id","name","unit_name","nutrient_nbr","rank"',
      '"1003","Protein","G","203","600.0"',
      '"1004","Total lipid (fat)","G","204","800.0"',
      '"1005","Carbohydrate, by difference","G","205","1110.0"',
      '"1008","Energy","KCAL","208","300.0"',
    ].join("\n")],
    ["food_nutrient.csv", [
      '"id","fdc_id","nutrient_id","amount"',
      '"1","2707427","208","145"', '"2","2707427","203","8.6"', '"3","2707427","204","4.31"', '"4","2707427","205","19.17"',
      '"5","2710472","208","27"', '"6","2710472","203","1.71"', '"7","2710472","204","0.99"', '"8","2710472","205","2.75"',
    ].join("\n")],
    ["food_portion.csv", [
      '"id","fdc_id","seq_num","amount","measure_unit_id","portion_description","modifier","gram_weight"',
      '"310953","2710472","1","","9999","1 fl oz","30000","30.0"',
      '"310954","2710472","4","","9999","Quantity not specified","90000","360.0"',
      '"310955","2710472","5","","9999","1 cup (8 fl oz)","10215","240.0"',
      '"310956","2710472","6","","9999","1 small","62015","360.0"',
    ].join("\n")],
  ]);
  const result = mapFdc(files, "survey_fndds_food");

  it("reads legacy nutrient numbers through nutrient.csv", () => {
    expect(result.skippedFoods).toBe(0);
    expect(result.foods.map((f) => [f.name, f.per100g.kcal, f.per100g.protein, f.per100g.fat, f.per100g.carbs])).toEqual([
      ["Dal", 145, 8.6, 4.31, 19.17],
      ["Coffee, Cappuccino", 27, 1.71, 0.99, 2.75],
    ]);
    expect(result.foods[0]).toMatchObject({ source: "fdc", sourceId: "2707427", verified: true });
  });

  it("skips portions whose measure no one can type, numbers, guideline, individual and surface", () => {
    const untypeable = mapFdc(
      new Map([
        ["food.csv", '"fdc_id","data_type","description"\n"9","survey_fndds_food","Test"'],
        ["food_nutrient.csv", '"fdc_id","nutrient_id","amount"\n"9","1008","100"\n"9","1003","1"\n"9","1004","1"\n"9","1005","1"'],
        ["food_portion.csv", [
          '"id","fdc_id","amount","measure_unit_id","portion_description","modifier","gram_weight"',
          '"1","9","","9999","4","10001","40.0"',
          '"2","9","","9999","5.3 oz","10002","50.0"',
          '"3","9","","9999","guideline amount per meal","10003","60.0"',
          '"4","9","","9999","individual","10004","70.0"',
          '"5","9","","9999","1 surface inch","10005","80.0"',
          '"6","9","","9999","1 slice","10006","30.0"',
        ].join("\n")],
      ]),
      "survey_fndds_food",
    );
    expect(untypeable.portions.map((p) => p.measure)).toEqual(["slice"]);
    expect(untypeable.skippedPortions).toBe(5);
  });

  it("names portions by measure and drops numeric modifiers and unspecified quantities", () => {
    expect(result.portions).toEqual([
      { source: "fdc", sourceId: "2710472", measure: "fl oz", description: "1 fl oz", gramsPerMeasure: 30 },
      { source: "fdc", sourceId: "2710472", measure: "cup", description: "1 cup (8 fl oz)", gramsPerMeasure: 240 },
      { source: "fdc", sourceId: "2710472", measure: "small", description: "1 small", gramsPerMeasure: 360 },
    ]);
    expect(result.skippedPortions).toBe(1);
  });
});

describe("mapFdc with a quantity in a FNDDS label and no amount", () => {
  const files = new Map([
    ["food.csv", '"fdc_id","data_type","description"\n"9","survey_fndds_food","Test"'],
    ["food_nutrient.csv", '"fdc_id","nutrient_id","amount"\n"9","1008","100"\n"9","1003","1"\n"9","1004","1"\n"9","1005","1"'],
    ["food_portion.csv", [
      '"id","fdc_id","amount","measure_unit_id","portion_description","modifier","gram_weight"',
      '"1","9","","9999","5 balls","","41"',
      '"2","9","","9999","1/2 slice","","48"',
      '"3","9","","9999","1 1/2 cups","","90"',
      '"4","9","","9999","1-2 pieces","","30"',
    ].join("\n")],
  ]);
  const result = mapFdc(files, "survey_fndds_food");

  it("divides the gram weight by the leading quantity, so grams are per one unit", () => {
    expect(result.portions.map((p) => [p.measure, p.gramsPerMeasure])).toEqual([
      ["ball", 8.2],
      ["slice", 96],
      ["cup", 60],
    ]);
  });

  it("skips a label whose leading number it cannot read", () => {
    expect(result.skippedPortions).toBe(1);
  });

  it("drops odd measures and keeps a portion whose NLEA wording is stripped", () => {
    const odd = mapFdc(
      new Map([
        ["food.csv", '"fdc_id","data_type","description"\n"9","survey_fndds_food","Test"'],
        ["food_nutrient.csv", '"fdc_id","nutrient_id","amount"\n"9","1008","100"\n"9","1003","1"\n"9","1004","1"\n"9","1005","1"'],
        ["food_portion.csv", [
          '"id","fdc_id","amount","measure_unit_id","portion_description","modifier","gram_weight"',
          '"1","9","","9999","1 serving","","0.1"',
          '"2","9","","9999","1 melon","","4518"',
          '"3","9","","9999","","serving (1 NLEA serving - about 4 crackers)","30"',
          '"4","9","","9999","1 100-calorie package (3 cakes)","","32"',
          '"5","9","","9999","2 1 4","","10"',
          '"6","9","","9999","Quantity not specified, if appetizer","","115"',
        ].join("\n")],
      ]),
      "survey_fndds_food",
    );
    expect(odd.portions).toEqual([
      { source: "fdc", sourceId: "9", measure: "serving", description: "serving (about 4 crackers)", gramsPerMeasure: 30 },
    ]);
    expect(odd.skippedPortions).toBe(5);
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

  it("drops rows with a negative required nutrient and reads negative optional nutrients as missing", () => {
    const malformed = [
      header,
      "N001,Negative energy,,,Other,-5,1,1,1,1,1,0.001",
      "N002,Negative protein,,,Other,500,-1,1,1,1,1,0.001",
      "N003,Negative extras,,,Other,500,1,1,1,-2,-1,-0.5",
    ].join("\n");
    const { foods, skippedFoods } = mapIfct(malformed);
    expect(skippedFoods).toBe(2);
    expect(foods.map((f) => f.sourceId)).toEqual(["N003"]);
    expect(foods[0]?.per100g).toMatchObject({ fiber: null, sugar: null, sodiumMg: null });
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

describe("mapCofid", () => {
  const COLUMNS = "Food Code,Food Name,Group,Energy (kcal) (kcal),Protein (g),Fat (g),Carbohydrate (g),Total sugars (g),AOAC fibre (g),NSP (g)";
  // Synthetic rows in the CoFID layout. Column order is shuffled on purpose: lookup is by header name.
  const proximates = [
    "Group,Food Code,Food Name,Energy (kcal) (kcal),Protein (g),Fat (g),Carbohydrate (g),Total sugars (g),AOAC fibre (g),NSP (g)",
    "AB,T-1,\"Test bean, cooked\",100,8,Tr,15,1.2,N,3.1",
    "AB,T-2,Test seed,50,Tr,2,4,N,N,2.5",
    "AB,T-3,Test nut,Tr,5,3,4,N,N,N",
    "AB,T-4,Test leaf,20,1,1,1,,,",
    "Q,T-5,Test beer,30,0.3,Tr,2.2,0.5,N,N",
    "AB,T-6,Test gap,N,5,5,5,5,5,5",
  ].join("\n");
  const inorganics = [" ,Food Name,Sodium (mg),Potassium (mg)", " T-1 ,Test bean,240,900", "T-2,Test seed,N,1", "T-6,Test gap,9,9"].join("\n");

  it("reads columns by header name, not position", () => {
    const { foods } = mapCofid(proximates, inorganics);
    expect(foods[0]).toMatchObject({ name: "Test bean, cooked", aliases: [], source: "cofid", sourceId: "T-1", verified: true });
    expect(foods[0]?.per100g).toMatchObject({ kcal: 100, protein: 8, fat: 0, carbs: 15, sugar: 1.2 });
  });

  it("reads Tr as zero and N as unknown", () => {
    const { foods } = mapCofid(proximates, inorganics);
    expect(foods.find((f) => f.sourceId === "T-2")?.per100g).toMatchObject({ protein: 0, fat: 2, sugar: null, fiber: 2.5 });
    expect(foods.find((f) => f.sourceId === "T-3")?.per100g).toMatchObject({ kcal: 0, protein: 5, fat: 3, sugar: null, fiber: null });
  });

  it("uses AOAC fibre, falls back to NSP, and is null when both are N", () => {
    const { foods } = mapCofid(proximates, inorganics);
    expect(foods.find((f) => f.sourceId === "T-1")?.per100g.fiber).toBe(3.1);
    const onlyN = mapCofid(`${COLUMNS}\nT-7,Test,AB,10,1,1,1,1,N,N`, inorganics);
    expect(onlyN.foods[0]?.per100g.fiber).toBeNull();
  });

  it("joins sodium by trimmed food code and leaves it null when the code has N or no match", () => {
    const { foods } = mapCofid(proximates, inorganics);
    expect(foods.find((f) => f.sourceId === "T-1")?.per100g.sodiumMg).toBe(240);
    expect(foods.find((f) => f.sourceId === "T-2")?.per100g.sodiumMg).toBeNull();
    expect(foods.find((f) => f.sourceId === "T-4")?.per100g.sodiumMg).toBeNull();
  });

  it("skips alcoholic drinks (group Q) and foods missing kcal or a macro", () => {
    const { foods, skippedFoods } = mapCofid(proximates, inorganics);
    expect(foods.map((f) => f.sourceId)).toEqual(["T-1", "T-2", "T-3", "T-4"]);
    expect(skippedFoods).toBe(1);
    const missingKcal = mapCofid(`${COLUMNS}\nT-8,No energy,AB,N,1,1,1,,,`, inorganics);
    expect(missingKcal).toEqual({ foods: [], skippedFoods: 1 });
  });

  it("rejects a CSV without the expected columns", () => {
    expect(() => mapCofid("Food Code,Food Name\nA,Rice\n", inorganics)).toThrow(/missing columns/);
  });

  it("rejects an inorganics sheet without a sodium column, so sodium is never wiped silently", () => {
    expect(() => mapCofid(proximates, proximates)).toThrow(/Sodium \(mg\)/);
    expect(() => mapCofid(proximates, "")).toThrow(/Sodium \(mg\)/);
  });
});
