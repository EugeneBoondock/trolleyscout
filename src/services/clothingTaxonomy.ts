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
  'kids', 'kid', 'child', 'children', 'childrens', 'boys', 'girls', 'boy',
  'girl', 'toddler', 'infant', 'baby', 'babies', 'junior', 'juniors', 'teen',
  'school', 'schoolwear', 'newborn', 'romper', 'babygrow', 'onesie',
  'sleepsuit', 'bodyvest', 'dungaree', 'dungarees', 'creche', 'nursery',
  'preschool', 'tween',
  // Character licences are children's clothing in all but name, and the
  // titles rarely say so: "Paw Patrol Marshall Striped T-Shirt" reads as an
  // adult tee to a word list.
  'paw patrol', 'peppa', 'bluey', 'cocomelon', 'frozen elsa', 'minions',
  'barbie', 'hot wheels', 'thomas', 'sesame', 'mickey', 'minnie',
  'spongebob', 'scooby', 'transformers', 'my little pony', 'teletubbies',
  'gabbys', 'encanto', 'moana', 'stitch', 'kuromi', 'hello kitty',
  'sonic', 'pokemon', 'bokkie',
]

/// Age and size markings that only ever appear on children's clothing:
/// "2-7", "3-6 months", "Age 5-6", "12-18m", "Size 5-6y".
const KIDS_SIZE_PATTERNS = [
  /\b\d{1,2}\s*-\s*\d{1,2}\s*(y|yr|yrs|year|years|m|mth|mths|month|months)\b/i,
  /\bage\s*\d{1,2}\b/i,
  /\b\d{1,2}\s*(y|yr|yrs|year|years)\s*(old)?\b/i,
  /\b(newborn|0-3|3-6|6-9|6-12|9-12|12-18|18-24)\b/i,
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
  // Kids first, and by size marking as well as by word: a "boys' shirt" is a
  // kids item before it is a men's one, and a shirt sized 5-6y is a child's
  // whether or not the title ever says child.
  if (mentions(words, phrase, KIDS)) return 'kids'
  if (KIDS_SIZE_PATTERNS.some((pattern) => pattern.test(text))) return 'kids'
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
