// Deterministic phrase-scoring classifier for Find Deals. Exact product-type
// guards handle ambiguous words first, strong title signals decide most
// results, and source metadata supplies a capped weak hint for vague titles.

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

export interface DealClassificationContext {
  retailerName?: string
  sourceLabel?: string
  sourceUrl?: string
  evidenceText?: string
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

interface ScoredRule {
  category: DealCategory
  strong: string[]
  supporting?: string[]
}

interface CategoryOverride {
  category: DealCategory
  phrases: string[]
}

// These phrases name a product type rather than something edible. They are
// checked before scoring so a supermarket retailer cannot turn a pump or tool
// into a grocery item merely because its title also contains "water" or "oil".
const TITLE_OVERRIDES: CategoryOverride[] = [
  {
    category: 'food',
    phrases: ['baby spinach', 'baby potato', 'baby potatoes', 'baby carrot', 'baby carrots', 'baby marrow'],
  },
  {
    category: 'baby-kids',
    phrases: ['breast pump', 'water gun'],
  },
  {
    category: 'health-beauty',
    phrases: ['insulin pump', 'body oil', 'facial oil', 'hair oil', 'body butter'],
  },
  {
    category: 'pets',
    phrases: ['chicken feeder'],
  },
  {
    category: 'home-cookware',
    phrases: [
      'water bottle', 'coffee grinder', 'coffee maker', 'rice cooker', 'bread maker',
      'food processor', 'milk frother', 'water dispenser', 'water filter', 'water purifier',
      'meat grinder', 'fruit bowl', 'sugar bowl', 'bread bin', 'egg cooker', 'egg holder',
      'egg chair', 'bread knife', 'cheese board', 'vegetable chopper', 'rice storage',
    ],
  },
  {
    category: 'diy-hardware',
    phrases: [
      'water pump', 'pressure washer', 'high pressure', 'submersible pump', 'booster pump',
      'pool pump', 'borehole pump', 'motor oil', 'engine oil', 'hydraulic oil', 'chain oil',
      'power tool', 'hand tool', 'tool kit', 'tool set', 'tools', 'tool', 'hardware', 'pump',
      'pumps', 'water storage', 'water tank', 'water hose', 'water heater', 'water meter',
      'water tap', 'water sprayer', 'water pressure', 'water fitting', 'watering can',
    ],
  },
]

// Each exact word or phrase contributes to a category score. Strong product
// names carry more weight than supporting brand or usage words. This lets a
// title such as "bottled water" beat a weak cookware hint, while an explicit
// "water bottle" remains a household item through the override above.
const CATEGORY_RULES: ScoredRule[] = [
  {
    category: 'baby-kids',
    strong: [
      'baby', 'infant', 'nappy', 'nappies', 'diaper', 'toddler', 'kids', "kid's",
      'toy', 'toys', 'play set', 'dummies', 'pacifier', 'baby food', 'baby formula',
    ],
    supporting: ['pj masks', 'gekko', 'purity'],
  },
  {
    category: 'pets',
    strong: [
      'dog food', 'cat food', 'pet food', 'bird seed', 'puppy', 'kitten', 'dog treat',
      'cat litter', 'pet',
    ],
    supporting: ['bob martin', 'whiskas', 'pedigree'],
  },
  {
    category: 'tech',
    strong: [
      'ledtv', 'led tv', 'smart tv', 'television', 'laptop', 'macbook', 'tablet', 'smartwatch',
      'apple watch', 'smartphone', 'iphone', 'galaxy', 'fridge', 'freezer', 'microwave',
      'air fryer', 'airfryer', 'washing machine', 'dishwasher',
      'toaster', 'kettle', 'treadmill', 'inverter', 'charger', 'usb', 'adapter', 'vacuum',
      'hair dryer', 'clipper', 'headphone', 'earbud', 'speaker', 'router', 'console', 'playstation',
      'xbox', 'monitor', 'printer', 'camera', 'power bank', 'powerbank',
    ],
    supporting: ['samsung', 'hisense', 'lg', 'sony', 'defy'],
  },
  {
    category: 'clothing',
    strong: [
      'jean', 'jeans', 'denim', 't-shirt', 'tshirt', 'shirt', 'trouser', 'jacket', 'hoodie',
      'sneaker', 'shoe', 'shoes', 'boot', 'sock', 'socks', 'dress', 'skirt', 'jersey', 'takkies',
    ],
  },
  {
    category: 'diy-hardware',
    strong: [
      'drill', 'grinder', 'welder', 'electrode', 'cordless', 'toolbox', 'screwdriver', 'spanner',
      'paint', 'cement', 'timber', 'ladder', 'hose pipe', 'generator', 'battery', 'batteries',
      'door chime', 'padlock', 'globe', 'downlight', 'extension cord', 'wheelbarrow', 'chainsaw',
      'hammer', 'wrench', 'socket set', 'compressor', 'plumbing', 'irrigation', 'bolts', 'screws',
    ],
  },
  {
    category: 'cleaning',
    strong: [
      'detergent', 'washing powder', 'dishwash', 'omo', 'sunlight liquid', 'handy andy', 'mr sheen',
      'domestos', 'bleach', 'toilet paper', 'toilet roll', 'paper towel', 'fabric softener',
      'stain remover', 'air freshener', 'furniture polish', 'floor cleaner', 'surface cleaner',
      'refuse bag', 'dishwashing',
    ],
  },
  {
    category: 'health-beauty',
    strong: [
      'shampoo', 'conditioner', 'body wash', 'body lotion', 'body oil', 'hand sanitiser', 'sanitiser',
      'toothbrush', 'toothpaste', 'deodorant', 'roll-on', 'roll on', 'perfume', 'fragrance', 'cologne',
      'eau de', 'moisturiser', 'moisturizer', 'serum', 'sunscreen', 'spf', 'vitamin', 'supplement',
      'capsule', 'tablet', 'tabs', 'ashwagandha', 'magnesium', 'moringa', 'collagen', 'probiotic',
      'plaster', 'bandage', 'makeup', 'make-up',
      'lipstick', 'mascara', 'hair butter', 'hair freshener', 'cleansing', 'face cream', 'night cream',
      'day cream', 'anti-ageing', 'cotton wool', 'razor', 'shaving',
    ],
    supporting: ['cantu', 'dark lovely', 'eucerin', 'nivea'],
  },
  {
    category: 'home-cookware',
    strong: [
      'towel', 'bathmat', 'bath mat', 'planter', 'mug', 'french press', 'dinner plate', 'plate set',
      'cookie cutter', 'candle', 'flask', 'pot', 'pan', 'frying pan', 'saucepan',
      'cutlery', 'crockery', 'glassware', 'tumbler', 'duvet', 'pillow', 'blanket', 'sheet set',
      'curtain', 'storage box', 'bucket', 'basket', 'espresso maker', 'coffee maker', 'moka',
      'chopping board', 'knife set', 'utensil', 'bakeware', 'bin',
    ],
    supporting: ['bottle'],
  },
  {
    category: 'food',
    strong: [
      'bottled water', 'still water', 'sparkling water', 'drinking water',
      'milk', 'juice', 'rice', 'beans', 'egg', 'eggs', 'sugar', 'flour', 'macaroni', 'pasta',
      'noodle', 'chicken', 'beef', 'lamb', 'pork', 'fillet', 'chops', 'samoosa', 'muffin',
      'bread', 'biscuit', 'snack', 'niknaks', 'chips', 'chocolate', 'sweets', 'cereal',
      'coffee', 'tea', 'rooibos', 'water', 'soft drink', 'cooldrink', 'cola', 'appletiser', 'cheese',
      'yoghurt', 'butter', 'margarine', 'cooking oil', 'sunflower oil', 'canola oil', 'olive oil',
      'sauce', 'soup', 'jam', 'honey', 'peanut butter',
      'coffee creamer', 'maize', 'mielie', 'samp', 'tastic', 'koo', 'wine', 'beer', 'cider',
      'whisky', 'vodka', 'gin', 'brandy', 'frozen', 'ice cream', 'crisps', 'nuts', 'fruit',
      'vegetable', 'banana', 'apple', 'potato', 'onion', 'tomato',
    ],
    supporting: ['roll', 'rolls', 'cake', 'bun', 'wrap'],
  },
]

const METADATA_HINTS: Array<{ category: DealCategory; phrases: string[] }> = [
  { category: 'baby-kids', phrases: ['baby', 'kids', 'nursery'] },
  { category: 'pets', phrases: ['pets', 'pet supplies', 'pet care'] },
  { category: 'tech', phrases: ['electronics', 'appliances', 'technology'] },
  { category: 'clothing', phrases: ['clothing', 'fashion', 'apparel', 'footwear'] },
  { category: 'diy-hardware', phrases: ['diy', 'hardware', 'power tools', 'tools', 'builders'] },
  { category: 'cleaning', phrases: ['cleaning', 'laundry', 'household cleaning'] },
  { category: 'health-beauty', phrases: ['health', 'beauty', 'personal care', 'pharmacy'] },
  { category: 'home-cookware', phrases: ['homeware', 'cookware', 'kitchenware', 'kitchen'] },
  { category: 'food', phrases: ['food', 'grocery', 'groceries', 'pantry', 'fresh produce'] },
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
    patterns: ['bread', 'roll', 'rolls', 'muffin', 'bun ', 'baguette', 'croissant', 'pancake', 'wrap', 'pita', 'cake', 'scone'],
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

export function classifyDeal(
  title: string,
  retailerId?: string,
  context: DealClassificationContext = {},
): DealClassification {
  const text = normalize(title)
  const metadataText = normalize(
    [context.retailerName, context.sourceLabel, context.sourceUrl, context.evidenceText]
      .filter(Boolean)
      .join(' '),
  )

  for (const override of TITLE_OVERRIDES) {
    if (matchesAny(text, override.phrases)) {
      return buildClassification(override.category, text)
    }
  }

  const scores = new Map<DealCategory, number>()

  for (const rule of CATEGORY_RULES) {
    const metadataPhrases = METADATA_HINTS.find((hint) => hint.category === rule.category)?.phrases ?? []
    const metadataScore = Math.min(scoreMatches(metadataText, metadataPhrases, 1), 2)
    const score =
      scoreMatches(text, rule.strong, 5) +
      scoreMatches(text, rule.supporting ?? [], 2) +
      metadataScore
    scores.set(rule.category, score)
  }

  const best = CATEGORY_RULES.reduce(
    (winner, rule) => {
      const score = scores.get(rule.category) ?? 0
      return score > winner.score ? { category: rule.category, score } : winner
    },
    { category: 'other' as DealCategory, score: 0 },
  )

  if (best.score > 0) {
    return buildClassification(best.category, text)
  }

  const fallback = retailerFallback(retailerId)
  return buildClassification(fallback, text)
}

function buildClassification(category: DealCategory, titleText: string): DealClassification {
  return category === 'food'
    ? { category: 'food', foodSubcategory: classifyFood(titleText) }
    : { category }
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
    default:
      return 'other'
  }
}

function matchesAny(paddedText: string, patterns: string[]): boolean {
  return patterns.some((pattern) => paddedText.includes(normalize(pattern)))
}

function scoreMatches(paddedText: string, patterns: string[], weight: number): number {
  return patterns.reduce(
    (score, pattern) => score + (paddedText.includes(normalize(pattern)) ? weight : 0),
    0,
  )
}

function normalize(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized ? ` ${normalized} ` : ' '
}
