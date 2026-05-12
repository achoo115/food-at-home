const QUALIFIERS = [
  'diced', 'sliced', 'chopped', 'minced', 'fresh', 'frozen', 'canned',
  'boneless', 'skinless', 'organic', 'raw', 'cooked', 'dried', 'whole',
  'large', 'small', 'medium', 'thin', 'thick', 'shredded', 'grated',
  'crushed', 'ground', 'smoked', 'roasted', 'toasted',
]

const SYNONYMS: Record<string, string[]> = {
  chicken: ['poultry', 'chicken breast', 'chicken thigh', 'chicken leg', 'chicken wing'],
  'ground beef': ['hamburger', 'beef mince', 'minced beef'],
  tomatoes: ['tomato', 'roma tomato', 'cherry tomato', 'grape tomato'],
  peppers: ['pepper', 'bell pepper', 'sweet pepper'],
  onions: ['onion', 'yellow onion', 'white onion', 'red onion'],
  garlic: ['garlic clove', 'garlic cloves'],
  potatoes: ['potato', 'russet potato', 'yukon gold'],
  cheese: ['cheddar', 'mozzarella', 'parmesan', 'swiss', 'jack'],
  rice: ['white rice', 'brown rice', 'jasmine rice', 'basmati rice'],
  pasta: ['spaghetti', 'penne', 'fettuccine', 'macaroni', 'linguine', 'rigatoni'],
}

const ALIAS_TO_CANONICAL: Record<string, string> = {}
for (const [canonical, aliases] of Object.entries(SYNONYMS)) {
  for (const alias of aliases) {
    ALIAS_TO_CANONICAL[alias] = canonical
  }
}

export function normalizeIngredient(name: string): string {
  let normalized = name.toLowerCase().trim()
  for (const q of QUALIFIERS) {
    normalized = normalized.replace(new RegExp(`\\b${q}\\b`, 'g'), '')
  }
  normalized = normalized.replace(/\s+/g, ' ').trim()
  if (ALIAS_TO_CANONICAL[normalized]) return ALIAS_TO_CANONICAL[normalized]
  return normalized
}

export function ingredientsMatch(inventoryName: string, recipeName: string): boolean {
  const a = normalizeIngredient(inventoryName)
  const b = normalizeIngredient(recipeName)
  return a === b || a.includes(b) || b.includes(a)
}

export function matchInventoryToRecipe(
  inventoryNames: string[],
  recipeIngredients: string[]
): { matched: string[]; missing: string[] } {
  const matched: string[] = []
  const missing: string[] = []
  for (const ri of recipeIngredients) {
    const found = inventoryNames.some((inv) => ingredientsMatch(inv, ri))
    if (found) matched.push(ri)
    else missing.push(ri)
  }
  return { matched, missing }
}
