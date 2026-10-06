// Fixture days for the Today screen until slice 6 swaps in Convex data.
// Shapes follow the planned ledger: one entry per food, with slot, kcal and macros.

export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner'

export type Macros = { proteinG: number; carbsG: number; fatG: number }

export type Entry = Macros & {
  id: string
  slot: MealSlot
  loggedAt: string // local time, HH:mm
  food: string
  quantity: number
  unit: string
  kcal: number
}

export type Usual = { label: string; kcal: number }

export type Workout =
  | { status: 'planned'; name: string; minutes: number; exercises: string[] }
  | { status: 'done'; name: string; doneAt: string; summary: string }

export type DayVariant = 'midday' | 'empty' | 'night'

export type DayFixture = {
  variant: DayVariant
  clockMinutes: number // local minutes since midnight that the fixture represents
  targets: Macros & { kcal: number }
  entries: Entry[]
  next: { slot: MealSlot; around: string } | null
  usuals: { title: string; items: Usual[] }
  weighIn: { draftKg: number; trendNote: string } | null
  workout: Workout
  nightNote: string | null
}

type Food = Macros & { name: string; unit: string; kcal: number }

// Per-unit values from IFCT/USDA as used in the v5 mock.
const foods = {
  poha: { name: 'Poha', unit: 'plate', kcal: 270, proteinG: 6, carbsG: 45, fatG: 8 },
  chai: { name: 'Chai', unit: 'cup', kcal: 95, proteinG: 3, carbsG: 12, fatG: 4 },
  banana: { name: 'Banana', unit: 'piece', kcal: 105, proteinG: 1.3, carbsG: 27, fatG: 0.4 },
  roti: { name: 'Roti', unit: 'roti', kcal: 120, proteinG: 3.6, carbsG: 22, fatG: 2 },
  dal: { name: 'Tur dal', unit: 'katori', kcal: 160, proteinG: 9, carbsG: 24, fatG: 3.5 },
  bhindi: { name: 'Bhindi sabzi', unit: 'katori', kcal: 130, proteinG: 3, carbsG: 10, fatG: 9 },
  curd: { name: 'Curd', unit: 'katori', kcal: 100, proteinG: 6, carbsG: 7, fatG: 5 },
  whey: { name: 'Whey, 1 scoop', unit: 'scoop', kcal: 120, proteinG: 24, carbsG: 3, fatG: 1.5 },
  paneer: { name: 'Paneer bhurji', unit: 'katori', kcal: 290, proteinG: 18, carbsG: 6, fatG: 22 },
} satisfies Record<string, Food>

let nextId = 0

// Builds one ledger-shaped entry from a per-unit food and a quantity.
function entry(slot: MealSlot, loggedAt: string, food: Food, quantity: number): Entry {
  nextId += 1
  return {
    id: `fx-${nextId}`,
    slot,
    loggedAt,
    food: food.name,
    quantity,
    unit: food.unit,
    kcal: food.kcal * quantity,
    proteinG: food.proteinG * quantity,
    carbsG: food.carbsG * quantity,
    fatG: food.fatG * quantity,
  }
}

const targets = { kcal: 1890, proteinG: 110, carbsG: 215, fatG: 60 }

const pushA: Workout = {
  status: 'planned',
  name: 'Push A',
  minutes: 50,
  exercises: ['Bench press', 'Overhead press', 'Incline DB press', 'Triceps pushdown', 'Lateral raise'],
}

const morning = [
  entry('breakfast', '08:40', foods.poha, 1),
  entry('breakfast', '08:40', foods.chai, 1),
  entry('snack', '11:10', foods.banana, 1),
]

export const dayFixtures: Record<DayVariant, DayFixture> = {
  midday: {
    variant: 'midday',
    clockMinutes: 13 * 60 + 12,
    targets,
    entries: morning,
    next: { slot: 'lunch', around: '13:30' },
    usuals: {
      title: 'Usual lunch',
      items: [
        { label: '2 roti, dal, sabzi', kcal: 530 },
        { label: 'Rajma chawal', kcal: 370 },
        { label: 'Curd katori', kcal: 100 },
        { label: 'Whey + banana', kcal: 225 },
      ],
    },
    weighIn: { draftKg: 76.3, trendNote: 'trend 76.5, steady down' },
    workout: pushA,
    nightNote: null,
  },
  empty: {
    variant: 'empty',
    clockMinutes: 7 * 60 + 48,
    targets,
    entries: [],
    next: null,
    usuals: {
      title: 'Usual breakfast',
      items: [
        { label: 'Poha + chai', kcal: 365 },
        { label: 'Chai + 2 Marie', kcal: 151 },
        { label: '2 egg omelette', kcal: 270 },
        { label: 'Idli ×3 + sambar', kcal: 284 },
      ],
    },
    weighIn: { draftKg: 76.3, trendNote: 'trend 76.5, steady down' },
    workout: pushA,
    nightNote: null,
  },
  night: {
    variant: 'night',
    clockMinutes: 23 * 60 + 5,
    targets,
    entries: [
      ...morning,
      entry('lunch', '13:40', foods.roti, 2),
      entry('lunch', '13:40', foods.dal, 1),
      entry('lunch', '13:40', foods.bhindi, 1),
      entry('lunch', '13:40', foods.curd, 1),
      entry('snack', '17:20', foods.whey, 1),
      entry('snack', '17:20', foods.chai, 1),
      entry('dinner', '20:45', foods.paneer, 1),
      entry('dinner', '20:45', foods.roti, 2),
    ],
    next: null,
    usuals: {
      title: 'Before bed, usually',
      items: [
        { label: 'Paneer bhurji + 2 roti', kcal: 530 },
        { label: 'Dal rice', kcal: 340 },
        { label: 'Haldi doodh', kcal: 130 },
        { label: 'Chicken curry + rice', kcal: 420 },
      ],
    },
    weighIn: null,
    workout: {
      status: 'done',
      name: 'Push A',
      doneAt: '18:10',
      summary: '48 min · 15 sets · 6,420 kg moved · bench e1RM up 3.1 kg',
    },
    nightNote:
      "and the kitchen's closing. If you're hungry, a cup of haldi doodh (130) fits. If not, that's a good day. Sleep well.",
  },
}

// Picks the fixture that matches the local clock: empty before 10:30, night from 22:00.
export function fixtureForNow(now: Date): DayVariant {
  const minutes = now.getHours() * 60 + now.getMinutes()
  if (minutes >= 22 * 60 || minutes < 5 * 60) return 'night'
  if (minutes < 10 * 60 + 30) return 'empty'
  return 'midday'
}
