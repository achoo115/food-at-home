/**
 * Container inference from an item name. The pantry shelf-life rule keys on
 * this: a sealed can/jar/bottle/carton/box keeps for a year or more, while the
 * keyword table (built for fresh food) would date "Peeled Tomatoes" like a
 * fresh tomato. Word boundaries only — "tin" must not match "tinned" by
 * accident of substring, and "can" must not match "cannellini" (both are cans
 * anyway, but by their own rule).
 */
export type Container = 'can' | 'jar' | 'bottle' | 'carton' | 'box' | 'bag' | 'fresh' | 'frozen' | 'other'

export const CONTAINERS: Container[] = ['can', 'jar', 'bottle', 'carton', 'box', 'bag', 'fresh', 'frozen', 'other']

/** Sealed, shelf-stable packaging. Only these may extend a pantry date. */
export const SEALED: ReadonlySet<Container> = new Set<Container>(['can', 'jar', 'bottle', 'carton', 'box'])

/** Word-bounded alternation (CJK-aware on the left). Exported so other rule tables use the same boundary. */
export const wordRe = (words: string) => new RegExp(`(^|[^a-z0-9\\u4e00-\\u9fff])(${words})(?=$|[^a-z0-9])`, 'i')

// Explicit packaging words win over product classes.
const EXPLICIT: [Container, RegExp][] = [
  ['frozen', wordRe('frozen')],
  ['can', wordRe('can|cans|canned|tin|tins|tinned')],
  ['jar', wordRe('jar|jars|jarred')],
  ['bottle', wordRe('bottle|bottles|bottled|jug|squeeze bottle')],
  ['carton', wordRe('carton|cartons|tetra ?pak|aseptic')],
  ['box', wordRe('box|boxes|boxed')],
  ['bag', wordRe('bag|bags|pouch|sack')],
  ['fresh', wordRe('fresh')],
]

// Product classes that are overwhelmingly sold in one sealed container.
const BY_CLASS: [Container, RegExp][] = [
  ['can', wordRe('coconut milk|evaporated milk|condensed milk|kidney beans|black beans|pinto beans|cannellini|great northern|navy beans|chickpeas|garbanzo|refried beans|baked beans|tuna|sardines|anchovies|mussels|smoked oysters|crushed tomatoes|diced tomatoes|peeled tomatoes|whole tomatoes|san marzano|tomato paste|pumpkin puree|corn kernels')],
  ['jar', wordRe('marinara|pasta sauce|tomato sauce|pizza sauce|salsa|pickles|pickled|olives|capers|peanut butter|almond butter|tahini|sesame paste|芝麻醬|jam|jelly|preserves|marmalade|pesto|curry paste|sauerkraut|kimchi|honey|nutella|miso|gochujang|doubanjiang|chili crisp')],
  ['bottle', wordRe('olive oil|oil|vinegar|wine|maple syrup|syrup|soy sauce|fish sauce|hot sauce|sriracha|ketchup|dressing|worcestershire|passata|mirin|sake')],
  ['carton', wordRe('broth|stock|oat milk|almond milk|soy milk')],
  ['box', wordRe('curry roux|roux|pasta|spaghetti|cereal|crackers|cake mix|mac and cheese|tofu')],
  ['bag', wordRe('rice|flour|sugar|chips|lentils|oats|quinoa|tortillas')],
]

export function inferContainer(name: string): Container | null {
  const n = name.toLowerCase()
  for (const [c, re] of EXPLICIT) if (re.test(n)) return c
  for (const [c, re] of BY_CLASS) if (re.test(n)) return c
  return null
}

/**
 * Names whose label says "keep refrigerated". A sealed-container pantry date
 * must never apply to these; the owner's Ning Chi sesame paste jar is the
 * motivating case. Kept narrow: tahini and gochujang are shelf-stable until
 * opened and are NOT here.
 */
export const REFRIGERATE_ONLY = wordRe(
  'kimchi|miso|hummus|fresh salsa|refrigerated|keep refrigerated|keep in refrigerator|sesame paste|芝麻醬|labneh|cream cheese|tempeh|natto|fresh pasta|tofu|yogurt|yoghurt|milk|cream|butter|eggs?|deli|cold.?pressed',
)

export function isRefrigerateOnly(name: string): boolean {
  const n = name.toLowerCase()
  // Shelf-stable exceptions to the broad words above.
  if (wordRe('coconut milk|evaporated milk|condensed milk|oat milk|almond milk|soy milk|century eggs?|egg noodles|peanut butter|almond butter|cocoa butter|shelf.?stable|uht').test(n)) return false
  return REFRIGERATE_ONLY.test(n)
}

/** High-acid canned goods: 12–18 months best quality, not the low-acid 2 years. */
export const HIGH_ACID = wordRe('tomato|tomatoes|san marzano|marinara|passata|pineapple|citrus|grapefruit|mandarin|sauerkraut|fruit|peaches|pears|cranberry')
