// Pure keyword classifier that sorts deal titles into shopper-facing
// categories, so Find deals can offer "show me only dairy" style filters.
// Built from real live titles across Clicks, Game, Woolworths, Makro,
// Dis-Chem, Builders, PnP, Yuppiechef, Takealot, and Amazon ZA.
//
// Ordering matters: the less ambiguous categories are tested first so a
// "Baby Dove Body Wash" lands in Baby, not Health, and "Full Cream Milk"
// lands in Dairy, not Beauty (both contain "cream").

export type DealCategory =
  | 'food'
  | 'health-beauty'
  | 'tech'
  | 'home-cookware'
  | 'cleaning'
  | 'baby-kids'
  | 'clothing'
  | 'pets'
  | 'diy-hardware'
  | 'other'

export type FoodSubcategory =
  | 'dairy-eggs'
  | 'meat-poultry'
  | 'fresh-produce'
  | 'bakery'
  | 'pantry'
  | 'frozen'
  | 'snacks-sweets'
  | 'beverages'
  | 'alcohol'
  | 'food-other'

export interface DealClassification {
  category: DealCategory
  foodSubcategory?: FoodSubcategory
}

export interface CategoryOption {
  id: DealCategory
  label: string
  icon: string
}

export interface FoodSubcategoryOption {
  id: FoodSubcategory
  label: string
}

// Display metadata (icon is an emoji so both web and Flutter can render it
// without a shared asset pipeline).
export const CATEGORY_OPTIONS: CategoryOption[] = [
  { icon: '🛒', id: 'food', label: 'Food & Groceries' },
  { icon: '💊', id: 'health-beauty', label: 'Health & Beauty' },
  { icon: '📱', id: 'tech', label: 'Tech & Electronics' },
  { icon: '🍳', id: 'home-cookware', label: 'Home & Cookware' },
  { icon: '🧴', id: 'cleaning', label: 'Cleaning & Household' },
  { icon: '🍼', id: 'baby-kids', label: 'Baby & Kids' },
  { icon: '👕', id: 'clothing', label: 'Clothing' },
  { icon: '🐾', id: 'pets', label: 'Pets' },
  { icon: '🔧', id: 'diy-hardware', label: 'DIY & Hardware' },
  { icon: '🏷️', id: 'other', label: 'Other' },
]

export const FOOD_SUBCATEGORY_OPTIONS: FoodSubcategoryOption[] = [
  { id: 'dairy-eggs', label: 'Dairy & Eggs' },
  { id: 'meat-poultry', label: 'Meat & Poultry' },
  { id: 'fresh-produce', label: 'Fresh Produce' },
  { id: 'bakery', label: 'Bakery' },
  { id: 'pantry', label: 'Pantry & Dry Goods' },
  { id: 'frozen', label: 'Frozen' },
  { id: 'snacks-sweets', label: 'Snacks & Sweets' },
  { id: 'beverages', label: 'Beverages' },
  { id: 'alcohol', label: 'Alcohol' },
  { id: 'food-other', label: 'Other Food' },
]

// Whole-word-ish matching: a pattern matches if it appears bounded by a
// non-letter on each side, so "tea" does not fire inside "steamer".
interface Rule {
  category: DealCategory
  patterns: string[]
}

// Checked in order; first hit wins.
const CATEGORY_RULES: Rule[] = [
  {
    category: 'baby-kids',
    patterns: [
      'baby', 'infant', 'nappy', 'nappies', 'diaper', 'toddler', 'kids', "kid's",
      'pj masks', 'gekko', 'toy', 'toys', 'play set', 'dummies', 'pacifier', 'purity',
    ],
  },
  {
    category: 'pets',
    patterns: ['dog food', 'cat food', 'pet', 'puppy', 'kitten', 'bob martin', 'whiskas', 'pedigree'],
  },
  {
    category: 'tech',
    patterns: [
      'samsung', 'hisense', 'ledtv', 'led tv', 'smart tv', 'television', 'laptop', 'tablet',
      'smartphone', 'iphone', 'galaxy', 'fridge', 'freezer', 'microwave', 'air fryer', 'airfryer',
      'toaster', 'kettle', 'treadmill', 'inverter', 'charger', 'usb', 'adapter', 'vacuum',
      'hair dryer', 'clipper', 'headphone', 'earbud', 'speaker', 'router', 'console', 'playstation',
      'xbox', 'monitor', 'printer', 'camera', 'power bank', 'powerbank',
    ],
  },
  {
    category: 'clothing',
    patterns: [
      'jean', 'jeans', 'denim', 't-shirt', 'tshirt', 'shirt', 'trouser', 'jacket', 'hoodie',
      'sneaker', 'shoe', 'shoes', 'boot', 'sock', 'socks', 'dress', 'skirt', 'jersey', 'takkies',
    ],
  },
  {
    category: 'diy-hardware',
    patterns: [
      'drill', 'grinder', 'welder', 'electrode', 'cordless', 'toolbox', 'screwdriver', 'spanner',
      'paint', 'cement', 'timber', 'ladder', 'hose pipe', 'generator', 'battery', 'batteries',
      'door chime', 'padlock', 'globe', 'downlight', 'extension cord', 'wheelbarrow',
    ],
  },
  {
    category: 'cleaning',
    patterns: [
      'detergent', 'washing powder', 'dishwash', 'omo', 'sunlight liquid', 'handy andy', 'mr sheen',
      'domestos', 'bleach', 'toilet paper', 'toilet roll', 'paper towel', 'fabric softener',
      'stain remover', 'air freshener', 'furniture polish', 'floor cleaner', 'surface cleaner',
      'refuse bag', 'dishwashing',
    ],
  },
  {
    category: 'health-beauty',
    patterns: [
      'shampoo', 'conditioner', 'body wash', 'body lotion', 'body oil', 'hand sanitiser', 'sanitiser',
      'toothbrush', 'toothpaste', 'deodorant', 'roll-on', 'roll on', 'perfume', 'fragrance', 'cologne',
      'eau de', 'moisturiser', 'moisturizer', 'serum', 'sunscreen', 'spf', 'vitamin', 'supplement',
      'capsule', 'tablet', 'tabs', 'ashwagandha', 'magnesium', 'moringa', 'collagen', 'probiotic',
      'plaster', 'bandage', 'cantu', 'dark & lovely', 'eucerin', 'nivea', 'dove ', 'makeup', 'make-up',
      'lipstick', 'mascara', 'hair butter', 'hair freshener', 'cleansing', 'face cream', 'night cream',
      'day cream', 'anti-ageing', 'cotton wool', 'razor', 'shaving',
    ],
  },
  {
    category: 'home-cookware',
    patterns: [
      'towel', 'bathmat', 'bath mat', 'planter', 'mug', 'french press', 'dinner plate', 'plate set',
      'cookie cutter', 'candle', 'bottle', 'flask', 'pot ', 'pan ', 'frying pan', 'saucepan',
      'cutlery', 'crockery', 'glassware', 'tumbler', 'duvet', 'pillow', 'blanket', 'sheet set',
      'curtain', 'storage box', 'bucket', 'basket', 'espresso maker', 'coffee maker', 'moka',
      'chopping board', 'knife set', 'utensil', 'bakeware', 'bin ',
    ],
  },
  {
    // Grocery catch-all, tested near-last so grocery words like "milk"/"rice"
    // still win over nothing, but do not steal beauty/tech items above.
    category: 'food',
    patterns: [
      'milk', 'juice', 'rice', 'beans', 'egg', 'eggs', 'sugar', 'flour', 'macaroni', 'pasta',
      'noodle', 'chicken', 'beef', 'lamb', 'pork', 'fillet', 'chops', 'samoosa', 'muffin', 'roll',
      'bread', 'biscuit', 'snack', 'niknaks', 'chips', 'chocolate', 'choc ', 'sweets', 'cereal',
      'coffee', 'tea ', 'rooibos', 'water', 'soft drink', 'cooldrink', 'cola', 'appletiser', 'cheese',
      'yoghurt', 'butter', 'margarine', 'oil', 'sauce', 'soup', 'jam', 'honey', 'peanut butter',
      'coffee creamer', 'maize', 'mielie', 'samp', 'tastic', 'koo', 'wine', 'beer', 'cider',
      'whisky', 'vodka', 'gin ', 'brandy', 'frozen', 'ice cream', 'crisps', 'nuts', 'fruit',
      'vegetable', 'banana', 'apple', 'potato', 'onion', 'tomato',
    ],
  },
]

const FOOD_SUBCATEGORY_RULES: Array<{ subcategory: FoodSubcategory; patterns: string[] }> = [
  {
    subcategory: 'alcohol',
    patterns: ['wine', 'beer', 'cider', 'whisky', 'whiskey', 'vodka', 'gin ', 'brandy', 'rum ', 'liqueur', 'savanna', 'castle', 'heineken'],
  },
  {
    subcategory: 'beverages',
    patterns: ['juice', 'water', 'soft drink', 'cooldrink', 'cola', 'appletiser', 'coffee', 'tea ', 'rooibos', 'energy drink', 'squash', 'cordial', 'iced tea', 'lemonade'],
  },
  {
    // Before dairy: "Cheese Flavoured Snack" is a snack, not cheese.
    subcategory: 'snacks-sweets',
    patterns: ['snack', 'niknaks', 'chips', 'crisps', 'chocolate', 'choc ', 'sweets', 'biscuit', 'cookie', 'nuts', 'popcorn', 'candy', 'gum '],
  },
  {
    subcategory: 'dairy-eggs',
    patterns: ['milk', 'egg', 'eggs', 'cheese', 'yoghurt', 'yogurt', 'butter', 'margarine', 'cream ', 'custard', 'amasi', 'maas'],
  },
  {
    subcategory: 'meat-poultry',
    patterns: ['chicken', 'beef', 'lamb', 'pork', 'fillet', 'chops', 'mince', 'sausage', 'boerewors', 'wors', 'bacon', 'polony', 'viennas', 'samoosa', 'ribs', 'steak'],
  },
  {
    subcategory: 'bakery',
    patterns: ['bread', 'roll', 'muffin', 'bun ', 'baguette', 'croissant', 'pancake', 'wrap', 'pita', 'cake', 'scone'],
  },
  {
    subcategory: 'fresh-produce',
    patterns: ['banana', 'apple', 'potato', 'onion', 'tomato', 'lettuce', 'spinach', 'carrot', 'fruit', 'vegetable', 'avocado', 'salad', 'cucumber', 'pepper'],
  },
  {
    subcategory: 'frozen',
    patterns: ['frozen', 'ice cream', 'ice-cream', 'oven chips', 'frozen veg'],
  },
  {
    subcategory: 'pantry',
    patterns: ['rice', 'beans', 'sugar', 'flour', 'macaroni', 'pasta', 'noodle', 'cereal', 'oil', 'sauce', 'soup', 'jam', 'honey', 'peanut butter', 'maize', 'mielie', 'samp', 'tastic', 'koo', 'spice', 'salt', 'stock', 'tinned', 'canned', 'mayonnaise'],
  },
]

export function classifyDeal(title: string, retailerId?: string): DealClassification {
  const text = ` ${title.toLowerCase().replace(/[^a-z0-9&'-]+/g, ' ').replace(/\s+/g, ' ')} `

  for (const rule of CATEGORY_RULES) {
    if (matchesAny(text, rule.patterns)) {
      return rule.category === 'food'
        ? { category: 'food', foodSubcategory: classifyFood(text) }
        : { category: rule.category }
    }
  }

  // Nothing matched: lean on the retailer's dominant range.
  const fallback = retailerFallback(retailerId)
  return fallback === 'food' ? { category: 'food', foodSubcategory: classifyFood(text) } : { category: fallback }
}

function classifyFood(text: string): FoodSubcategory {
  for (const rule of FOOD_SUBCATEGORY_RULES) {
    if (matchesAny(text, rule.patterns)) {
      return rule.subcategory
    }
  }

  return 'food-other'
}

function retailerFallback(retailerId: string | undefined): DealCategory {
  switch (retailerId) {
    case 'dis-chem':
    case 'clicks':
      return 'health-beauty'
    case 'builders':
      return 'diy-hardware'
    case 'yuppiechef':
      return 'home-cookware'
    case 'amazon-za':
    case 'takealot':
      return 'tech'
    case 'food-lovers':
    case 'pick-n-pay':
    case 'woolworths':
    case 'checkers':
    case 'shoprite':
    case 'spar':
    case 'boxer':
      return 'food'
    default:
      return 'other'
  }
}

function matchesAny(paddedText: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    // Patterns ending in a space are already word-bounded by the author.
    if (pattern.endsWith(' ')) {
      return paddedText.includes(` ${pattern}`)
    }

    return paddedText.includes(` ${pattern} `) || paddedText.includes(` ${pattern}`)
  })
}
