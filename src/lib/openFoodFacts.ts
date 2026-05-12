interface ProductResult {
  name: string
  category: string
  quantity?: string
}

export async function lookupBarcode(barcode: string): Promise<ProductResult | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=product_name,categories_tags,quantity`)
  if (!res.ok) return null

  const data = await res.json()
  if (data.status !== 1 || !data.product) return null

  const p = data.product
  const categoryTag = p.categories_tags?.[0] || ''

  let category = 'other'
  if (categoryTag.includes('meat') || categoryTag.includes('fish') || categoryTag.includes('poultry')) category = 'protein'
  else if (categoryTag.includes('dairy') || categoryTag.includes('milk') || categoryTag.includes('cheese')) category = 'dairy'
  else if (categoryTag.includes('fruit') || categoryTag.includes('vegetable')) category = 'produce'
  else if (categoryTag.includes('cereal') || categoryTag.includes('bread') || categoryTag.includes('pasta')) category = 'grain'
  else if (categoryTag.includes('sauce') || categoryTag.includes('condiment')) category = 'condiment'
  else if (categoryTag.includes('beverage') || categoryTag.includes('drink') || categoryTag.includes('juice')) category = 'beverage'
  else if (categoryTag.includes('snack') || categoryTag.includes('chip') || categoryTag.includes('candy')) category = 'snack'

  return {
    name: p.product_name || barcode,
    category,
    quantity: p.quantity || undefined,
  }
}
