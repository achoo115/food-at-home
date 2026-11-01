import { termMatches } from '../lib/recipeFilter'
import { inferContainer, isRefrigerateOnly, SEALED, HIGH_ACID, type Container } from '../lib/container'

type ShelfLifeEntry = Partial<Record<'fridge' | 'freezer' | 'pantry', number>>

export const shelfLife: Record<string, ShelfLifeEntry> = {
  chicken: { fridge: 2, freezer: 270 },
  'ground beef': { fridge: 2, freezer: 120 },
  steak: { fridge: 5, freezer: 180 },
  pork: { fridge: 5, freezer: 180 },
  fish: { fridge: 2, freezer: 180 },
  shrimp: { fridge: 2, freezer: 180 },
  bacon: { fridge: 7, freezer: 30 },
  'deli meat': { fridge: 5, freezer: 60 },
  sausage: { fridge: 2, freezer: 60 },
  tofu: { fridge: 7, freezer: 150 },
  eggs: { fridge: 35 },
  milk: { fridge: 7 },
  yogurt: { fridge: 14 },
  butter: { fridge: 30, freezer: 270 },
  cheese: { fridge: 21, freezer: 180 },
  'cream cheese': { fridge: 14 },
  'sour cream': { fridge: 21 },
  'heavy cream': { fridge: 10 },
  apples: { fridge: 28, pantry: 7 },
  bananas: { pantry: 7, freezer: 90 },
  berries: { fridge: 5, freezer: 180 },
  grapes: { fridge: 10 },
  oranges: { fridge: 21, pantry: 7 },
  lemons: { fridge: 21, pantry: 7 },
  limes: { fridge: 21, pantry: 7 },
  avocado: { fridge: 5, pantry: 3 },
  tomatoes: { fridge: 7, pantry: 5 },
  lettuce: { fridge: 7 },
  spinach: { fridge: 5, freezer: 180 },
  kale: { fridge: 7, freezer: 180 },
  broccoli: { fridge: 5, freezer: 180 },
  cauliflower: { fridge: 7, freezer: 180 },
  carrots: { fridge: 21, freezer: 180 },
  celery: { fridge: 14 },
  cucumbers: { fridge: 7 },
  peppers: { fridge: 7, freezer: 180 },
  onions: { pantry: 30, fridge: 14 },
  garlic: { pantry: 60 },
  potatoes: { pantry: 21, fridge: 14 },
  'sweet potatoes': { pantry: 14 },
  mushrooms: { fridge: 7, freezer: 180 },
  corn: { fridge: 3, freezer: 180 },
  zucchini: { fridge: 5, freezer: 180 },
  ginger: { fridge: 21, freezer: 180 },
  herbs: { fridge: 7 },
  jalapeño: { fridge: 7 },
  bread: { pantry: 7, fridge: 14, freezer: 90 },
  rice: { pantry: 365 },
  pasta: { pantry: 365 },
  flour: { pantry: 180, freezer: 365 },
  sugar: { pantry: 730 },
  oats: { pantry: 365 },
  cereal: { pantry: 180 },
  tortillas: { pantry: 7, fridge: 14, freezer: 180 },
  'peanut butter': { pantry: 180 },
  ketchup: { fridge: 180 },
  mustard: { fridge: 365 },
  mayonnaise: { fridge: 60 },
  'soy sauce': { pantry: 365 },
  'hot sauce': { pantry: 365 },
  salsa: { fridge: 14 },
  jam: { fridge: 90 },
  honey: { pantry: 730 },
  'olive oil': { pantry: 365 },
  juice: { fridge: 7 },
  'almond milk': { fridge: 10 },
  'oat milk': { fridge: 10 },
  'ice cream': { freezer: 60 },
  'frozen vegetables': { freezer: 240 },
  'frozen pizza': { freezer: 180 },
  'frozen fruit': { freezer: 240 },
  // Sealed shelf-stable goods (added 2026-10-31). Longest matching key wins, so
  // 'peeled tomatoes' beats 'tomatoes' and 'century eggs' beats 'eggs'.
  'peeled tomatoes': { pantry: 540, fridge: 7 },
  'crushed tomatoes': { pantry: 540, fridge: 7 },
  'diced tomatoes': { pantry: 540, fridge: 7 },
  'whole tomatoes': { pantry: 540, fridge: 7 },
  'san marzano': { pantry: 540, fridge: 7 },
  'tomato sauce': { pantry: 540, fridge: 7 },
  'tomato paste': { pantry: 540, fridge: 10 },
  marinara: { pantry: 540, fridge: 7 },
  'pasta sauce': { pantry: 540, fridge: 7 },
  passata: { pantry: 540, fridge: 7 },
  'coconut milk': { pantry: 730, fridge: 5 },
  'evaporated milk': { pantry: 365, fridge: 5 },
  'condensed milk': { pantry: 365, fridge: 14 },
  beans: { pantry: 730, fridge: 4 },
  chickpeas: { pantry: 730, fridge: 4 },
  broth: { pantry: 365, fridge: 5 },
  stock: { pantry: 365, fridge: 5 },
  tuna: { pantry: 730, fridge: 2 },
  sardines: { pantry: 730, fridge: 2 },
  anchovies: { pantry: 730, fridge: 60 },
  mussels: { pantry: 730, fridge: 2 },
  'smoked trout': { pantry: 730, fridge: 3 },
  'smoked salmon': { pantry: 730, fridge: 3 },
  'maple syrup': { pantry: 540, fridge: 365 },
  vinegar: { pantry: 1095, fridge: 1095 },
  wine: { pantry: 365, fridge: 7 },
  'cooking wine': { pantry: 365, fridge: 60 },
  'curry roux': { pantry: 365, fridge: 90 },
  'century eggs': { pantry: 120, fridge: 150 },
  'egg bites': { fridge: 7, freezer: 90 },
  'sesame paste': { fridge: 180 },
  tahini: { pantry: 365, fridge: 180 },
  kimchi: { fridge: 180 },
  miso: { fridge: 365 },
  hummus: { fridge: 7 },
  'fresh salsa': { fridge: 7 },
  'cooked rice': { pantry: 365, fridge: 4 },
  'jasmine rice': { pantry: 365, fridge: 4 },
}


const FALLBACK_DAYS: Record<Location, number> = {
  fridge: 7,
  freezer: 90,
  pantry: 180,
}

/** Sealed container, unopened, stored in the pantry. */
const CONTAINER_PANTRY_DAYS: Partial<Record<Container, number>> = {
  can: 730,
  jar: 540,
  bottle: 365,
  carton: 365,
  box: 365,
}
const HIGH_ACID_CAN_DAYS = 540

/** A sealed container in the fridge with no table entry: assume it is opened. */
const CONTAINER_FRIDGE_FALLBACK = 14
const FROZEN_FALLBACK = 180

/** Refrigerate-only item that somehow sits in the pantry: short date, never a container date. */
const REFRIGERATE_ONLY_IN_PANTRY = 7

export type Location = 'fridge' | 'freezer' | 'pantry'

function lookupTable(itemName: string, location: Location): number | undefined {
  const key = itemName.toLowerCase().trim()
  const exact = shelfLife[key]?.[location]
  if (exact !== undefined) return exact
  let best: { len: number; days: number } | undefined
  for (const [name, entry] of Object.entries(shelfLife)) {
    const days = entry[location]
    if (days === undefined) continue
    if (!termMatches(name, key)) continue
    if (!best || name.length > best.len) best = { len: name.length, days }
  }
  return best?.days
}

/**
 * Estimated days until expiry for an UNOPENED item placed in `location`.
 *
 * Order of authority:
 * 1. A refrigerate-only name (label says keep refrigerated) never gets a
 *    sealed-container pantry date.
 * 2. Pantry: the longer of the keyword table and the sealed-container rule,
 *    so a can of tomatoes is not dated like a fresh tomato and olive oil keeps
 *    its table value over a generic "bottle".
 * 3. Fridge: the table always wins; a sealed container with no entry is
 *    assumed opened (14 days). Never 30 or 90 — an opened passata is a week.
 * 4. Freezer: table, else 180 for anything sold frozen, else 90.
 */
export function getShelfLifeDays(itemName: string, location: Location): number {
  const table = lookupTable(itemName, location)
  const container = inferContainer(itemName)

  if (isRefrigerateOnly(itemName)) {
    if (location === 'pantry') return Math.min(table ?? REFRIGERATE_ONLY_IN_PANTRY, REFRIGERATE_ONLY_IN_PANTRY)
    return table ?? (location === 'fridge' ? CONTAINER_FRIDGE_FALLBACK : FALLBACK_DAYS.freezer)
  }

  if (location === 'pantry') {
    let byContainer = container && SEALED.has(container) ? CONTAINER_PANTRY_DAYS[container] : undefined
    if (container === 'can' && HIGH_ACID.test(itemName.toLowerCase())) byContainer = HIGH_ACID_CAN_DAYS
    const best = Math.max(table ?? 0, byContainer ?? 0)
    return best || FALLBACK_DAYS.pantry
  }

  if (location === 'fridge') {
    if (table !== undefined) return table
    if (container && SEALED.has(container)) return CONTAINER_FRIDGE_FALLBACK
    return FALLBACK_DAYS.fridge
  }

  if (table !== undefined) return table
  if (container === 'frozen') return FROZEN_FALLBACK
  return FALLBACK_DAYS.freezer
}

/**
 * Days left once a SEALED item has been opened. Opening resets the clock:
 * a can of beans lasts two years sealed and four days opened. Fridge is
 * assumed for perishables; condiments and oils are forgiving.
 */
const OPENED_DAYS: [RegExp, number][] = [
  [/coconut milk|evaporated milk|condensed milk|broth|stock|wine/, 5],
  [/beans|chickpeas|tuna|sardines|mussels|trout|salmon|anchov|shrimp|corn/, 3],
  [/tomato|marinara|passata|pasta sauce|pizza sauce/, 7],
  [/salsa|pesto|hummus/, 7],
  [/pickle|olives|capers|sauerkraut|kimchi|jam|jelly|preserves|marmalade|nutella/, 90],
  [/peanut butter|almond butter|tahini|sesame paste|芝麻醬|miso|gochujang|doubanjiang|chili crisp|curry paste/, 180],
  [/maple syrup|honey|soy sauce|fish sauce|hot sauce|sriracha|vinegar|worcestershire|mirin/, 365],
  [/olive oil|oil/, 180],
  [/ketchup|mustard|mayonnaise|mayo|dressing/, 60],
  [/curry roux|cereal|crackers|chips|pasta|rice|flour|sugar|oats/, 90],
]
const OPENED_FALLBACK: Record<Location, number> = { fridge: 7, freezer: 90, pantry: 30 }

export function getOpenedShelfLifeDays(itemName: string, location: Location): number {
  const n = itemName.toLowerCase()
  for (const [re, days] of OPENED_DAYS) if (re.test(n)) return days
  const table = lookupTable(itemName, location)
  // For fresh food the table already describes an opened state; never extend past it.
  return Math.min(table ?? OPENED_FALLBACK[location], OPENED_FALLBACK[location])
}
