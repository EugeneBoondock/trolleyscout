// Server-side twin of mobile/lib/clothing_filters.dart. The scout tags every
// garment once at write time so the app can filter in the database instead of
// re-deriving the same answer on every phone.

export type ClothingAudience = 'any' | 'women' | 'men' | 'kids'
export type GarmentType =
  | 'any'
  | 'tops'
  | 'bottoms'
  | 'dresses'
  | 'outerwear'
  | 'footwear'
  | 'underwear'
  | 'accessories'

const KIDS = [
  'kids', 'kid', 'child', 'children', 'boys', 'girls', 'boy', 'girl',
  'toddler', 'infant', 'baby', 'babies', 'junior', 'teen', 'school',
  'newborn', 'romper', 'babygrow', 'onesie',
]
const WOMEN = [
  'women', 'woman', 'womens', 'ladies', 'lady', 'female', 'dress', 'skirt',
  'blouse', 'bra', 'bralette', 'leggings', 'jumpsuit', 'camisole',
  'maternity', 'heels', 'handbag',
]
const MEN = [
  'men', 'man', 'mens', 'male', 'boxers', 'tie', 'necktie', 'suit', 'blazer',
  'golfer',
]

const TYPES: Array<[GarmentType, string[]]> = [
  ['footwear', [
    'shoe', 'shoes', 'sneaker', 'sneakers', 'takkies', 'boot', 'boots',
    'sandal', 'sandals', 'slipper', 'slippers', 'heels', 'loafer', 'loafers',
    'pumps', 'trainers', 'flip flop', 'flops', 'moccasin', 'slide', 'slides',
    // Sneaker cuts, listed before tops so a "High Top" is never mistaken for
    // a shirt and offered as a torso try-on.
    'high top', 'low top', 'mid top', 'hightop', 'lowtop',
  ]],
  ['dresses', ['dress', 'dresses', 'gown', 'jumpsuit', 'romper', 'frock']],
  ['outerwear', [
    'jacket', 'jackets', 'coat', 'coats', 'blazer', 'hoodie', 'hoodies',
    'sweater', 'jersey', 'cardigan', 'pullover', 'fleece', 'parka',
    'windbreaker', 'puffer', 'gilet', 'sweatshirt',
  ]],
  ['underwear', [
    'underwear', 'briefs', 'boxers', 'bra', 'bras', 'bralette', 'panties',
    'thong', 'vest', 'socks', 'sock', 'stockings', 'tights', 'pyjama',
    'pyjamas', 'sleepwear', 'nightie', 'lingerie', 'shapewear',
  ]],
  ['bottoms', [
    'jean', 'jeans', 'trouser', 'trousers', 'pants', 'chino', 'chinos',
    'shorts', 'skirt', 'skirts', 'leggings', 'joggers', 'cargo',
  ]],
  ['accessories', [
    'cap', 'caps', 'hat', 'hats', 'beanie', 'scarf', 'belt', 'belts', 'glove',
    'gloves', 'bag', 'bags', 'handbag', 'backpack', 'wallet', 'sunglasses',
    'watch', 'jewellery', 'necklace', 'earrings', 'bracelet', 'tie',
    'headband',
  ]],
  ['tops', [
    'shirt', 'shirts', 'tshirt', 'tee', 'tees', 'top', 'tops', 'blouse',
    'polo', 'tank', 'camisole', 'golfer', 'crop',
  ]],
]

/// Homeware and hardware that borrow clothing words. Bedding is the usual
/// intruder, and paint is sold by the coat.
const NOT_APPAREL = [
  'mirror', 'duvet', 'duvets', 'blanket', 'blankets', 'sheet', 'sheets',
  'pillow', 'pillows', 'pillowcase', 'cushion', 'cushions', 'towel', 'towels',
  'curtain', 'curtains', 'rug', 'rugs', 'mat', 'mats', 'doormat', 'throw',
  'bedding', 'comforter', 'quilt', 'linen', 'valance', 'mattress',
  'protector', 'hanger', 'hangers', 'rail', 'rails', 'basket', 'laundry',
  'iron', 'steamer', 'mannequin', 'wardrobe', 'paint', 'ceiling', 'ceilings',
  'wall', 'walls', 'primer', 'varnish', 'enamel', 'undercoat', 'litre',
  'sealer', 'plaster', 'candle', 'mug', 'plate', 'bowl',
]

/// Garment shapes a try-on model can actually dress a body in.
const TRY_ONABLE: GarmentType[] = ['tops', 'bottoms', 'dresses', 'outerwear']

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter(Boolean),
  )
}

function mentions(words: Set<string>, phrase: string, candidates: string[]): boolean {
  return candidates.some((candidate) => (
    candidate.includes(' ')
      ? phrase.includes(` ${candidate} `)
      : words.has(candidate) || words.has(`${candidate}s`)
  ))
}

/// Homeware, bedding, paint — things that live near clothes or borrow their
/// words, and must never reach a fitting room whatever else the title says.
export function isNonApparel(text: string): boolean {
  const words = tokens(text)
  const phrase = ` ${[...words].join(' ')} `
  return mentions(words, phrase, NOT_APPAREL)
}

export function isApparel(text: string): boolean {
  if (isNonApparel(text)) return false
  return garmentTypeFor(text) !== 'any'
}

export function audienceFor(text: string): ClothingAudience {
  const words = tokens(text)
  const phrase = ` ${[...words].join(' ')} `
  // Kids first: a "boys' shirt" is a kids item before it is a men's one.
  if (mentions(words, phrase, KIDS)) return 'kids'
  if (mentions(words, phrase, WOMEN)) return 'women'
  if (mentions(words, phrase, MEN)) return 'men'
  return 'any'
}

export function garmentTypeFor(text: string): GarmentType {
  const words = tokens(text)
  const phrase = ` ${[...words].join(' ')} `
  for (const [type, candidates] of TYPES) {
    if (mentions(words, phrase, candidates)) return type
  }
  return 'any'
}

export function canTryOn(type: GarmentType): boolean {
  return TRY_ONABLE.includes(type)
}
