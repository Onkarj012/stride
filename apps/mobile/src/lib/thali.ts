export type ThaliUnit = 'piece' | 'katori' | 'tsp'
export type ThaliGroup = 'Breads' | 'Rice' | 'Dal' | 'Sabzi' | 'Sides'
export type ThaliItem = { id: string; name: string; unit: ThaliUnit; step: number; group: ThaliGroup }
export type ThaliCounts = Record<string, number>

// Builds one catalog entry; the id is the lowercase name with dashes.
function item(name: string, group: ThaliGroup, unit: ThaliUnit, step: number): ThaliItem {
  return { id: name.toLowerCase().replace(/ /g, '-'), name, unit, step, group }
}

// Most foods one plate may hold. Mirrors MAX_EXTRACTED_ITEMS in packages/backend/convex/pipeline/extract.ts.
export const MAX_THALI_FOODS = 20

export const THALI_ITEMS: ThaliItem[] = [
  item('roti', 'Breads', 'piece', 1),
  item('phulka', 'Breads', 'piece', 1),
  item('bhakri', 'Breads', 'piece', 1),
  item('puri', 'Breads', 'piece', 1),
  item('paratha', 'Breads', 'piece', 1),
  item('rice', 'Rice', 'katori', 0.5),
  item('jeera rice', 'Rice', 'katori', 0.5),
  item('dal', 'Dal', 'katori', 0.5),
  item('amti', 'Dal', 'katori', 0.5),
  item('sambar', 'Dal', 'katori', 0.5),
  item('rajma', 'Dal', 'katori', 0.5),
  item('chole', 'Dal', 'katori', 0.5),
  item('bhindi sabzi', 'Sabzi', 'katori', 0.5),
  item('aloo sabzi', 'Sabzi', 'katori', 0.5),
  item('paneer sabzi', 'Sabzi', 'katori', 0.5),
  item('mixed veg', 'Sabzi', 'katori', 0.5),
  item('palak paneer', 'Sabzi', 'katori', 0.5),
  item('curd', 'Sides', 'katori', 0.5),
  item('salad', 'Sides', 'katori', 0.5),
  item('papad', 'Sides', 'piece', 1),
  item('pickle', 'Sides', 'tsp', 1),
  item('ghee', 'Sides', 'tsp', 1),
  item('gulab jamun', 'Sides', 'piece', 1),
]

// Ready-made plates. Keys are catalog ids.
export const THALI_PRESETS: { name: string; counts: ThaliCounts }[] = [
  { name: 'Maharashtrian', counts: { bhakri: 2, amti: 1, 'bhindi-sabzi': 1, rice: 1, pickle: 1, papad: 1 } },
  { name: 'Punjabi', counts: { roti: 3, rajma: 1, 'paneer-sabzi': 1, 'jeera-rice': 1, salad: 0.5 } },
  { name: 'Office canteen', counts: { roti: 3, dal: 1, 'mixed-veg': 1, rice: 1, curd: 0.5 } },
  { name: 'South Indian', counts: { rice: 1.5, sambar: 1, 'aloo-sabzi': 0.5, curd: 0.5, papad: 1 } },
]

// Prints a count as a word or plain number: 0.5 is "half", and whole numbers have no ".0".
function amount(n: number): string {
  return n === 0.5 ? 'half' : String(n)
}

// The amount and unit without the food name, e.g. "3", "half katori", "1 tsp".
export function thaliQuantity(item: ThaliItem, n: number): string {
  return item.unit === 'piece' ? amount(n) : `${amount(n)} ${item.unit}`
}

// The plate as a plain sentence, in catalog order. Empty plates give ''.
export function thaliText(counts: ThaliCounts): string {
  const parts: string[] = []
  for (const item of THALI_ITEMS) {
    const n = counts[item.id] ?? 0
    if (n > 0) parts.push(`${thaliQuantity(item, n)} ${item.name}`)
  }
  return parts.join(', ')
}
