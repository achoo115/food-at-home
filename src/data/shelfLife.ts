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
}

const FALLBACK_DAYS: Record<string, number> = {
  fridge: 7,
  freezer: 90,
  pantry: 180,
}

export function getShelfLifeDays(itemName: string, location: 'fridge' | 'freezer' | 'pantry'): number {
  const key = itemName.toLowerCase().trim()
  if (shelfLife[key]?.[location]) return shelfLife[key][location]
  for (const [name, entry] of Object.entries(shelfLife)) {
    if (key.includes(name) || name.includes(key)) {
      if (entry[location]) return entry[location]
    }
  }
  return FALLBACK_DAYS[location]
}
