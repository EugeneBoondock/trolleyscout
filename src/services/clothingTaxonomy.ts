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
  'gabbys', 'encanto', 'moana', 'lilo', 'kuromi', 'hello kitty',
  'sonic', 'pokemon', 'bokkie',
  // "Youth" is a size class on sports kit, not a style.
  'youth',
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
    // How shoes are actually titled on the shelf: a "Clog", a "Court", a
    // "Slingback". Untyped, these fell through to whatever the shop was
    // assumed to sell.
    'clog', 'clogs', 'pump', 'court', 'courts', 'slingback', 'slingbacks',
    'sling back', 'mary jane', 'trainer', 'bootie', 'booties', 'wedge',
    'wedges', 'flats', 'espadrille', 'espadrilles', 'mule', 'mules',
    'brogue', 'brogues', 'stiletto', 'stilettos', 'plimsoll',
  ]],
  ['dresses', ['dress', 'dresses', 'gown', 'jumpsuit', 'romper', 'frock']],
  ['outerwear', [
    'jacket', 'jackets', 'coat', 'coats', 'blazer', 'hoodie', 'hoodies',
    'sweater', 'jersey', 'cardigan', 'pullover', 'fleece', 'parka',
    'windbreaker', 'puffer', 'gilet', 'sweatshirt',
    'shacket', 'waistcoat', 'knitwear', 'tracktop', 'tracktops', 'anorak',
    'bodywarmer', 'poncho',
  ]],
  ['underwear', [
    'underwear', 'briefs', 'boxers', 'bra', 'bras', 'bralette', 'panties',
    'thong', 'vest', 'socks', 'sock', 'stockings', 'tights', 'pyjama',
    'pyjamas', 'sleepwear', 'nightie', 'lingerie', 'shapewear',
    'panty', 'g string', 'gstring', 'brazilian', 'balconette', 'bodyshorts',
    'sleepshirt', 'sleepshirts', 'sleep set', 'sleep pant', 'nightdress',
    'boyleg', 'bodysuit',
  ]],
  ['bottoms', [
    'jean', 'jeans', 'trouser', 'trousers', 'pants', 'chino', 'chinos',
    'shorts', 'skirt', 'skirts', 'leggings', 'joggers', 'cargo',
    'pant', 'jegging', 'jeggings', 'trackpant', 'trackpants', 'sweatpant',
    // "short" is left out on purpose: a short-sleeve shirt is not a bottom.
    'sweatpants', 'jogger', 'capri', 'culotte', 'culottes', 'denim',
  ]],
  // Deliberately no bare 'bag', 'ring', 'cap', 'tie' or 'shopper'. Those were
  // safe while this only read clothing catalogues, and wrong the moment
  // grocery deals were harvested onto the same rail: "3 lb Bag Yellow Onions"
  // became an accessory, and so did onion rings, bottle caps and cable ties.
  // Every entry here has to be a word that is only ever worn.
  ['accessories', [
    'beanie', 'scarf', 'belt', 'belts', 'glove', 'gloves', 'handbag',
    'handbags', 'backpack', 'backpacks', 'wallet', 'wallets', 'sunglasses',
    'jewellery', 'jewelry', 'necklace', 'earrings', 'earring', 'bracelet',
    'anklet', 'satchel', 'slingbag', 'sling bag', 'shoulder bag', 'tote bag',
    'clutch bag', 'baseball cap', 'peak cap', 'bucket hat', 'sun hat',
    'beanies', 'headband', 'bow tie', 'neck tie', 'necktie', 'cardholder',
    'wristwatch', 'hairband',
    // These are safe: no grocery title calls anything a tote, a shopper, a
    // purse or a hat. It is specifically 'bag', 'cap', 'ring' and 'tie' that
    // collide, via bags of onions, bottle caps, onion rings and cable ties.
    'tote', 'totes', 'shopper', 'purse', 'purses', 'hat', 'hats', 'watch',
    'watches',
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
  // General retailers shelve phones and lunchboxes next to the clothing, and
  // an assumed shop type carries them onto the rail with everything else.
  // "laptop" and "tablet" are left out: a shopper bag with a laptop pocket is
  // still a bag.
  'smartphone', 'cellphone handset', 'earbuds',
  'earphones', 'headphones', 'speaker', 'charger', 'powerbank', 'battery',
  'gift card', 'giftcard', 'voucher', 'airtime',
  'flask', 'lunch', 'lunchbox', 'water bottle', 'thermos', 'cutlery',
  'shampoo', 'conditioner', 'perfume', 'deodorant', 'lotion', 'moisturiser',
  'nail polish', 'lipstick', 'mascara', 'hair wax', 'razor', 'toothpaste',
  'nappy', 'nappies', 'wipes',
  // Food. The fitting room now also reads the ordinary deal feed, which is
  // mostly groceries — a rail that offers a shopper onions to try on is
  // worse than a rail with fewer clothes on it.
  'onion', 'onions', 'potato', 'potatoes', 'tomato', 'tomatoes', 'apple',
  'apples', 'banana', 'bananas', 'orange juice', 'milk', 'cheese', 'yoghurt',
  'yogurt', 'bread', 'rice', 'pasta', 'cereal', 'coffee', 'tea bags', 'sugar',
  'flour', 'maize', 'mealie', 'chicken', 'beef', 'mince', 'steak', 'fish',
  'polony', 'viennas', 'boerewors', 'biltong', 'chips', 'crisps', 'biscuits',
  'chocolate', 'sweets', 'juice', 'cooldrink', 'soda', 'beer', 'wine',
  'cider', 'whisky', 'vodka', 'eggs', 'butter', 'margarine', 'oil', 'mayo',
  'sauce', 'soup', 'beans', 'peanut', 'jam', 'honey', 'frozen', 'produce',
  // Appliances and household chemicals, which arrive in the deal feed by the
  // hundred and borrow clothing words: a microwave is a "counter top", a
  // water bottle and a hand wash both have a "pump".
  'microwave', 'oven', 'stove', 'hob', 'fridge', 'freezer', 'dishwasher',
  'washing machine', 'tumble dryer', 'kettle', 'toaster', 'air fryer',
  'blender', 'vacuum', 'heater', 'television', 'monitor', 'printer',
  'hand wash', 'handwash', 'dishwashing', 'antiseptic', 'disinfectant',
  'sanitiser', 'sanitizer', 'bleach', 'detergent', 'fabric softener',
  'cleaner', 'polish', 'air freshener', 'insecticide', 'toilet',
  // "pencil" only as a pencil case: a pencil skirt is a skirt.
  'stationery', 'pencil case', 'crayon', 'sharpener',
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

/**
 * Garment words that are also ordinary English.
 *
 * Each of these is a real clothing word and a common word in a title that has
 * nothing to do with clothes: a "Counter Top Microwave" is a top, a "Pump
 * Water 750ml" and a "Hand Wash Pump" are both pumps, a "Laptop Sleeve" is a
 * sleeve. In a clothing catalogue that ambiguity never bites, because
 * everything on the page is clothing. In the deal feed — which is mostly
 * groceries and appliances — it is the whole problem.
 *
 * So they still classify normally when reading a clothing shop, and count for
 * nothing when reading the deal feed. See the `strict` option below.
 */
const AMBIGUOUS = new Set([
  'top', 'tops', 'pump', 'pumps', 'slide', 'slides', 'court', 'courts',
  'vest', 'wrap', 'crop', 'flats', 'mule', 'mules', 'wedge', 'wedges',
  'clog', 'clogs', 'trainer', 'trainers', 'shopper', 'tote', 'totes',
  'watch', 'watches', 'purse', 'purses', 'hat', 'hats', 'cargo', 'pant',
  'suit', 'brief', 'briefs', 'tank', 'polo', 'sling back', 'slingback',
])

/**
 * What part of the body a title describes, or 'any' when it does not say.
 *
 * `strict` is for sources that are not clothing shops. It refuses to classify
 * on an ambiguous word alone, which costs a few real garments in the deal
 * feed and keeps microwaves, bottled water and hand wash out of a fitting
 * room — a rail with fewer clothes beats a rail offering to dress someone in
 * a Dettol pump.
 */
export function garmentTypeFor(
  text: string,
  options: { strict?: boolean } = {},
): GarmentType {
  const words = tokens(text)
  const phrase = ` ${[...words].join(' ')} `
  for (const [type, candidates] of TYPES) {
    const usable = options.strict
      ? candidates.filter((word) => !AMBIGUOUS.has(word))
      : candidates
    if (usable.length > 0 && mentions(words, phrase, usable)) return type
  }
  return 'any'
}

export function canTryOn(type: GarmentType): boolean {
  return TRY_ONABLE.includes(type)
}
