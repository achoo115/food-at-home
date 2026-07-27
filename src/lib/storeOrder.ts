// Store-walking order for shopping lists (ported/generalized from Harvest's
// shoppingListOrder.ts). A shopping list is grouped into physical store zones and
// ordered so the shopper moves through the store once. The default order is a
// sensible Whole Foods walk; it's meant to be overridable per user (phase: a
// store_zones editor). Classification is three-tier: exact-name → keyword → fallback.

export type ZoneConfidence = 'exact' | 'keyword' | 'fallback'

export interface ZoneClassification {
  zone: string
  confidence: ZoneConfidence
  matchedTerm?: string
}

// Default Whole Foods-style walk order. Configurable per user later.
export const DEFAULT_STORE_ZONES = [
  'Produce',
  'Bakery',
  'Deli & Prepared',
  'Dairy & Eggs',
  'Meat & Seafood',
  'Frozen',
  'Pantry',
  'Snacks',
  'Beverages',
  'Household',
  'Wine & Beer',
] as const

const FALLBACK_ZONE = 'Pantry'

interface KeywordRule {
  zone: string
  terms: readonly string[]
  excludeTerms?: readonly string[]
}

// Order matters: the FIRST rule with a matching term wins, so more specific /
// override-y zones (Frozen, Beverages) precede the broad Produce/Pantry rules.
const KEYWORD_RULES: readonly KeywordRule[] = [
  { zone: 'Frozen', terms: ['frozen', 'ice cream', 'popsicle', 'gelato', 'frozen pizza'] },
  { zone: 'Beverages', terms: ['sparkling water', 'seltzer', 'soda', 'juice', 'kombucha', 'lemonade', 'coconut water', 'coffee', 'espresso', 'iced tea', 'tea bag'] },
  { zone: 'Wine & Beer', terms: ['wine', 'beer', 'cider', 'ipa', 'lager', 'prosecco', 'champagne', 'rose', 'sake', 'pinot', 'cabernet', 'chardonnay', 'merlot', 'sauvignon', 'noir', 'malbec', 'riesling', 'zinfandel', 'rioja', 'syrah'] },
  { zone: 'Snacks', terms: ['chips', 'tortilla chips', 'pita chips', 'crackers', 'pretzels', 'popcorn', 'trail mix', 'granola bar', 'cookies', 'candy', 'chocolate', 'nuts', 'jerky'] },
  { zone: 'Bakery', terms: ['bread', 'bagel', 'baguette', 'muffin', 'english muffin', 'tortilla', 'pita', 'naan', 'roll', 'croissant', 'sourdough', 'crumpet'] },
  { zone: 'Meat & Seafood', terms: ['chicken', 'beef', 'pork', 'turkey', 'ground', 'steak', 'bacon', 'sausage', 'salmon', 'shrimp', 'fish', 'tilapia', 'cod', 'scallop', 'lamb'] },
  { zone: 'Dairy & Eggs', terms: ['milk', 'egg', 'yogurt', 'cheese', 'butter', 'cream', 'kefir', 'half and half'], excludeTerms: ['coconut milk', 'almond milk', 'oat milk', 'soy milk'] },
  { zone: 'Deli & Prepared', terms: ['hummus', 'guacamole', 'deli', 'prepared salad', 'rotisserie', 'tzatziki', 'salsa'] },
  { zone: 'Produce', terms: ['banana', 'apple', 'berry', 'berries', 'spinach', 'lettuce', 'tomato', 'avocado', 'onion', 'garlic', 'potato', 'carrot', 'pepper', 'cucumber', 'broccoli', 'kale', 'lemon', 'lime', 'orange', 'grape', 'mango', 'cilantro', 'parsley', 'basil', 'mushroom', 'zucchini', 'celery', 'ginger', 'herbs', 'greens'] },
  { zone: 'Household', terms: ['paper towel', 'toilet paper', 'detergent', 'dish soap', 'trash bag', 'foil', 'sponge', 'cleaner', 'napkins'] },
  { zone: 'Pantry', terms: ['pasta', 'rice', 'beans', 'olive oil', 'vinegar', 'sauce', 'flour', 'sugar', 'oats', 'cereal', 'peanut butter', 'nut butter', 'canned', 'broth', 'stock', 'honey', 'syrup', 'coconut milk', 'almond milk', 'oat milk', 'quinoa', 'lentils'] },
]

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

// Word-ish containment: term appears as a substring of the normalized name.
// Kept as substring (not strict word-boundary) so plurals ("bananas") and
// compounds ("cheddar cheese") match; rule ORDER resolves the ambiguous cases.
function contains(normName: string, term: string): boolean {
  return normName.includes(term)
}

export function classifyZone(itemName: string): ZoneClassification {
  const norm = normalize(itemName)
  for (const rule of KEYWORD_RULES) {
    if (rule.excludeTerms?.some((t) => contains(norm, t))) continue
    const matched = rule.terms.find((t) => contains(norm, t))
    if (matched) return { zone: rule.zone, confidence: 'keyword', matchedTerm: matched }
  }
  return { zone: FALLBACK_ZONE, confidence: 'fallback' }
}

export interface ZoneGroup<T> {
  zone: string
  items: T[]
}

/**
 * Group items into store zones, ordered by the store walk order. Zones with no
 * items are omitted. Items whose zone isn't in `order` are placed after the
 * ordered zones (by their default-order position), never dropped.
 */
export function groupByStoreOrder<T>(
  items: readonly T[],
  getName: (item: T) => string,
  order: readonly string[] = DEFAULT_STORE_ZONES,
): ZoneGroup<T>[] {
  const byZone = new Map<string, T[]>()
  for (const item of items) {
    const zone = classifyZone(getName(item)).zone
    if (!byZone.has(zone)) byZone.set(zone, [])
    byZone.get(zone)!.push(item)
  }
  const rank = (zone: string): number => {
    const i = order.indexOf(zone)
    if (i !== -1) return i
    const d = DEFAULT_STORE_ZONES.indexOf(zone as (typeof DEFAULT_STORE_ZONES)[number])
    return order.length + (d === -1 ? DEFAULT_STORE_ZONES.length : d)
  }
  return [...byZone.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([zone, zoneItems]) => ({ zone, items: zoneItems }))
}
