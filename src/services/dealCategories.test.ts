import { describe, expect, it } from 'vitest'
import { classifyDeal } from './dealCategories'

describe('classifyDeal', () => {
  it('routes real grocery titles to food with the right subcategory', () => {
    expect(classifyDeal('PnP UHT Full Cream Milk 6 x 1L', 'pick-n-pay')).toEqual({
      category: 'food',
      foodSubcategory: 'dairy-eggs',
    })
    expect(classifyDeal('Tastic Rice 2kg', 'pick-n-pay')).toEqual({
      category: 'food',
      foodSubcategory: 'pantry',
    })
    expect(classifyDeal('PnP Pork Pack', 'pick-n-pay')).toEqual({
      category: 'food',
      foodSubcategory: 'meat-poultry',
    })
    expect(classifyDeal('PnP Hotdog Rolls 6 Pack', 'pick-n-pay')).toEqual({
      category: 'food',
      foodSubcategory: 'bakery',
    })
    expect(classifyDeal('Simba NikNaks Cheese Flavoured Maize Snack 135g', 'pick-n-pay')).toEqual({
      category: 'food',
      foodSubcategory: 'snacks-sweets',
    })
    expect(classifyDeal('100 % Apple Fruit Juice 1 L', 'woolworths')).toEqual({
      category: 'food',
      foodSubcategory: 'beverages',
    })
  })

  it('keeps beauty and baby items out of food even when they share words', () => {
    // "Full Cream" appears in both milk and body cream; ordering wins.
    expect(classifyDeal('Baby Dove Body Wash 200ml', 'dis-chem').category).toBe('baby-kids')
    expect(classifyDeal('Cantu Protective Styles Braiding & Twisting Gel 227g', 'clicks').category).toBe(
      'health-beauty',
    )
    expect(classifyDeal('Eucerin Hyaluron-Filler + Elasticity Night Cream 50ml', 'amazon-za').category).toBe(
      'health-beauty',
    )
    expect(classifyDeal('Ashwagandha Capsules', 'takealot').category).toBe('health-beauty')
  })

  it('routes appliances and electronics to tech', () => {
    expect(classifyDeal('Russell Hobbs RHAFG58 Air Fryer and Griller', 'amazon-za').category).toBe('tech')
    expect(classifyDeal('Samsung 564 L Frost Free Double Door Fridge', 'makro').category).toBe('tech')
    expect(classifyDeal('25W USB-C Fast Charging Adapter', 'takealot').category).toBe('tech')
  })

  it('routes cleaning, clothing, hardware, and cookware', () => {
    expect(classifyDeal('Omo Auto Semi Concentrate Liquid Detergent', 'makro').category).toBe('cleaning')
    expect(classifyDeal('La Fleur 2ply 350 Sheet Toilet Paper 18 Rolls', 'takealot').category).toBe('cleaning')
    expect(classifyDeal('Beck 100 Percent Cotton Denim Work Jean Blue Size 32', 'builders').category).toBe(
      'clothing',
    )
    expect(classifyDeal('Androware Electrodes 2.5 mm 2.5 kg', 'builders').category).toBe('diy-hardware')
    expect(classifyDeal('Yuppiechef Fiesta Stoneware Dinner Plates, Set of 4', 'yuppiechef').category).toBe(
      'home-cookware',
    )
  })

  it('falls back to the retailer range when no keyword matches', () => {
    expect(classifyDeal('Zzxq Mystery Item', 'dis-chem').category).toBe('health-beauty')
    expect(classifyDeal('Zzxq Mystery Item', 'builders').category).toBe('diy-hardware')
    expect(classifyDeal('Zzxq Mystery Item', 'unknown-store').category).toBe('other')
  })
})
