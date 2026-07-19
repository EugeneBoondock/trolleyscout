// Dart port of src/services/dealCategories.ts. Exact product-type guards handle
// ambiguous words first, strong title signals decide most results, and source
// metadata supplies a capped weak hint for vague titles.

enum DealCategory {
  food,
  healthBeauty,
  tech,
  homeCookware,
  cleaning,
  babyKids,
  clothing,
  pets,
  diyHardware,
  other,
}

enum FoodSubcategory {
  dairyEggs,
  meatPoultry,
  freshProduce,
  bakery,
  pantry,
  frozen,
  snacksSweets,
  beverages,
  alcohol,
  foodOther,
}

class DealClassification {
  const DealClassification(this.category, [this.foodSubcategory]);
  final DealCategory category;
  final FoodSubcategory? foodSubcategory;
}

class CategoryOption {
  const CategoryOption(this.id, this.label, this.icon);
  final DealCategory id;
  final String label;
  final String icon;
}

class FoodSubcategoryOption {
  const FoodSubcategoryOption(this.id, this.label);
  final FoodSubcategory id;
  final String label;
}

const List<CategoryOption> categoryOptions = [
  CategoryOption(DealCategory.food, 'Food & Groceries', '🛒'),
  CategoryOption(DealCategory.healthBeauty, 'Health & Beauty', '💊'),
  CategoryOption(DealCategory.tech, 'Tech & Electronics', '📱'),
  CategoryOption(DealCategory.homeCookware, 'Home & Cookware', '🍳'),
  CategoryOption(DealCategory.cleaning, 'Cleaning & Household', '🧴'),
  CategoryOption(DealCategory.babyKids, 'Baby & Kids', '🍼'),
  CategoryOption(DealCategory.clothing, 'Clothing', '👕'),
  CategoryOption(DealCategory.pets, 'Pets', '🐾'),
  CategoryOption(DealCategory.diyHardware, 'DIY & Hardware', '🔧'),
  CategoryOption(DealCategory.other, 'Other', '🏷️'),
];

const List<FoodSubcategoryOption> foodSubcategoryOptions = [
  FoodSubcategoryOption(FoodSubcategory.dairyEggs, 'Dairy & Eggs'),
  FoodSubcategoryOption(FoodSubcategory.meatPoultry, 'Meat & Poultry'),
  FoodSubcategoryOption(FoodSubcategory.freshProduce, 'Fresh Produce'),
  FoodSubcategoryOption(FoodSubcategory.bakery, 'Bakery'),
  FoodSubcategoryOption(FoodSubcategory.pantry, 'Pantry & Dry Goods'),
  FoodSubcategoryOption(FoodSubcategory.frozen, 'Frozen'),
  FoodSubcategoryOption(FoodSubcategory.snacksSweets, 'Snacks & Sweets'),
  FoodSubcategoryOption(FoodSubcategory.beverages, 'Beverages'),
  FoodSubcategoryOption(FoodSubcategory.alcohol, 'Alcohol'),
  FoodSubcategoryOption(FoodSubcategory.foodOther, 'Other Food'),
];

class _ScoredRule {
  const _ScoredRule(this.category, this.strong, [this.supporting = const []]);
  final DealCategory category;
  final List<String> strong;
  final List<String> supporting;
}

class DealClassificationContext {
  const DealClassificationContext({
    this.retailerName,
    this.sourceLabel,
    this.sourceUrl,
    this.evidenceText,
  });

  final String? retailerName;
  final String? sourceLabel;
  final String? sourceUrl;
  final String? evidenceText;
}

class _CategoryOverride {
  const _CategoryOverride(this.category, this.phrases);
  final DealCategory category;
  final List<String> phrases;
}

const List<_CategoryOverride> _titleOverrides = [
  _CategoryOverride(DealCategory.food, [
    'baby spinach',
    'baby potato',
    'baby potatoes',
    'baby carrot',
    'baby carrots',
    'baby marrow',
  ]),
  _CategoryOverride(DealCategory.babyKids, ['breast pump', 'water gun']),
  _CategoryOverride(DealCategory.healthBeauty,
      ['insulin pump', 'body oil', 'facial oil', 'hair oil', 'body butter']),
  _CategoryOverride(DealCategory.pets, ['chicken feeder']),
  _CategoryOverride(DealCategory.homeCookware, [
    'water bottle',
    'coffee grinder',
    'coffee maker',
    'rice cooker',
    'bread maker',
    'food processor',
    'milk frother',
    'water dispenser',
    'water filter',
    'water purifier',
    'meat grinder',
    'fruit bowl',
    'sugar bowl',
    'bread bin',
    'egg cooker',
    'egg holder',
    'egg chair',
    'bread knife',
    'cheese board',
    'vegetable chopper',
    'rice storage',
  ]),
  _CategoryOverride(DealCategory.diyHardware, [
    'water pump',
    'pressure washer',
    'high pressure',
    'submersible pump',
    'booster pump',
    'pool pump',
    'borehole pump',
    'motor oil',
    'engine oil',
    'hydraulic oil',
    'chain oil',
    'power tool',
    'hand tool',
    'tool kit',
    'tool set',
    'tools',
    'tool',
    'hardware',
    'pump',
    'pumps',
    'water storage',
    'water tank',
    'water hose',
    'water heater',
    'water meter',
    'water tap',
    'water sprayer',
    'water pressure',
    'water fitting',
    'watering can',
  ]),
];

const List<_ScoredRule> _categoryRules = [
  _ScoredRule(DealCategory.babyKids, [
    'baby',
    'infant',
    'nappy',
    'nappies',
    'diaper',
    'toddler',
    'kids',
    "kid's",
    'toy',
    'toys',
    'play set',
    'dummies',
    'pacifier',
    'baby food',
    'baby formula',
  ], [
    'pj masks',
    'gekko',
    'purity',
  ]),
  _ScoredRule(DealCategory.pets, [
    'dog food',
    'cat food',
    'pet food',
    'bird seed',
    'puppy',
    'kitten',
    'dog treat',
    'cat litter',
    'pet',
  ], [
    'bob martin',
    'whiskas',
    'pedigree',
  ]),
  _ScoredRule(DealCategory.tech, [
    'ledtv',
    'led tv',
    'smart tv',
    'television',
    'laptop',
    'macbook',
    'tablet',
    'smartwatch',
    'apple watch',
    'smartphone',
    'iphone',
    'galaxy',
    'fridge',
    'freezer',
    'microwave',
    'air fryer',
    'airfryer',
    'washing machine',
    'dishwasher',
    'toaster',
    'kettle',
    'treadmill',
    'inverter',
    'charger',
    'usb',
    'adapter',
    'vacuum',
    'hair dryer',
    'clipper',
    'headphone',
    'earbud',
    'speaker',
    'router',
    'console',
    'playstation',
    'xbox',
    'monitor',
    'printer',
    'camera',
    'power bank',
    'powerbank',
  ], [
    'samsung',
    'hisense',
    'lg',
    'sony',
    'defy',
  ]),
  _ScoredRule(DealCategory.clothing, [
    'jean',
    'jeans',
    'denim',
    't-shirt',
    'tshirt',
    'shirt',
    'trouser',
    'jacket',
    'hoodie',
    'sneaker',
    'shoe',
    'shoes',
    'boot',
    'sock',
    'socks',
    'dress',
    'skirt',
    'jersey',
    'takkies',
  ]),
  _ScoredRule(DealCategory.diyHardware, [
    'drill',
    'grinder',
    'welder',
    'electrode',
    'cordless',
    'toolbox',
    'screwdriver',
    'spanner',
    'paint',
    'cement',
    'timber',
    'ladder',
    'hose pipe',
    'generator',
    'battery',
    'batteries',
    'door chime',
    'padlock',
    'globe',
    'downlight',
    'extension cord',
    'wheelbarrow',
    'chainsaw',
    'hammer',
    'wrench',
    'socket set',
    'compressor',
    'plumbing',
    'irrigation',
    'bolts',
    'screws',
  ]),
  _ScoredRule(DealCategory.cleaning, [
    'detergent',
    'washing powder',
    'dishwash',
    'omo',
    'sunlight liquid',
    'handy andy',
    'mr sheen',
    'domestos',
    'bleach',
    'toilet paper',
    'toilet roll',
    'paper towel',
    'fabric softener',
    'stain remover',
    'air freshener',
    'furniture polish',
    'floor cleaner',
    'surface cleaner',
    'refuse bag',
    'dishwashing',
  ]),
  _ScoredRule(DealCategory.healthBeauty, [
    'shampoo',
    'conditioner',
    'body wash',
    'body lotion',
    'body oil',
    'hand sanitiser',
    'sanitiser',
    'toothbrush',
    'toothpaste',
    'deodorant',
    'roll-on',
    'roll on',
    'perfume',
    'fragrance',
    'cologne',
    'eau de',
    'moisturiser',
    'moisturizer',
    'serum',
    'sunscreen',
    'spf',
    'vitamin',
    'supplement',
    'capsule',
    'tablet',
    'tabs',
    'ashwagandha',
    'magnesium',
    'moringa',
    'collagen',
    'probiotic',
    'plaster',
    'bandage',
    'makeup',
    'make-up',
    'lipstick',
    'mascara',
    'hair butter',
    'hair freshener',
    'cleansing',
    'face cream',
    'night cream',
    'day cream',
    'anti-ageing',
    'cotton wool',
    'razor',
    'shaving',
  ], [
    'cantu',
    'dark lovely',
    'eucerin',
    'nivea',
  ]),
  _ScoredRule(DealCategory.homeCookware, [
    'towel',
    'bathmat',
    'bath mat',
    'planter',
    'mug',
    'french press',
    'dinner plate',
    'plate set',
    'cookie cutter',
    'candle',
    'flask',
    'pot',
    'pan',
    'frying pan',
    'saucepan',
    'cutlery',
    'crockery',
    'glassware',
    'tumbler',
    'duvet',
    'pillow',
    'blanket',
    'sheet set',
    'curtain',
    'storage box',
    'bucket',
    'basket',
    'espresso maker',
    'coffee maker',
    'moka',
    'chopping board',
    'knife set',
    'utensil',
    'bakeware',
    'bin',
  ], [
    'bottle',
  ]),
  _ScoredRule(DealCategory.food, [
    'bottled water',
    'still water',
    'sparkling water',
    'drinking water',
    'milk',
    'juice',
    'rice',
    'beans',
    'egg',
    'eggs',
    'sugar',
    'flour',
    'macaroni',
    'pasta',
    'noodle',
    'chicken',
    'beef',
    'lamb',
    'pork',
    'fillet',
    'chops',
    'samoosa',
    'muffin',
    'bread',
    'biscuit',
    'snack',
    'niknaks',
    'chips',
    'chocolate',
    'sweets',
    'cereal',
    'coffee',
    'tea',
    'rooibos',
    'water',
    'soft drink',
    'cooldrink',
    'cola',
    'appletiser',
    'cheese',
    'yoghurt',
    'butter',
    'margarine',
    'cooking oil',
    'sunflower oil',
    'canola oil',
    'olive oil',
    'sauce',
    'soup',
    'jam',
    'honey',
    'peanut butter',
    'coffee creamer',
    'maize',
    'mielie',
    'samp',
    'tastic',
    'koo',
    'wine',
    'beer',
    'cider',
    'whisky',
    'vodka',
    'gin',
    'brandy',
    'frozen',
    'ice cream',
    'crisps',
    'nuts',
    'fruit',
    'vegetable',
    'banana',
    'apple',
    'potato',
    'onion',
    'tomato',
  ], [
    'roll',
    'rolls',
    'cake',
    'bun',
    'wrap',
  ]),
];

const List<_CategoryOverride> _metadataHints = [
  _CategoryOverride(DealCategory.babyKids, ['baby', 'kids', 'nursery']),
  _CategoryOverride(DealCategory.pets, ['pets', 'pet supplies', 'pet care']),
  _CategoryOverride(
      DealCategory.tech, ['electronics', 'appliances', 'technology']),
  _CategoryOverride(
      DealCategory.clothing, ['clothing', 'fashion', 'apparel', 'footwear']),
  _CategoryOverride(DealCategory.diyHardware,
      ['diy', 'hardware', 'power tools', 'tools', 'builders']),
  _CategoryOverride(
      DealCategory.cleaning, ['cleaning', 'laundry', 'household cleaning']),
  _CategoryOverride(DealCategory.healthBeauty,
      ['health', 'beauty', 'personal care', 'pharmacy']),
  _CategoryOverride(DealCategory.homeCookware,
      ['homeware', 'cookware', 'kitchenware', 'kitchen']),
  _CategoryOverride(DealCategory.food,
      ['food', 'grocery', 'groceries', 'pantry', 'fresh produce']),
];

class _FoodRule {
  const _FoodRule(this.subcategory, this.patterns);
  final FoodSubcategory subcategory;
  final List<String> patterns;
}

const List<_FoodRule> _foodRules = [
  _FoodRule(FoodSubcategory.alcohol, [
    'wine',
    'beer',
    'cider',
    'whisky',
    'whiskey',
    'vodka',
    'gin ',
    'brandy',
    'rum ',
    'liqueur',
    'savanna',
    'castle',
    'heineken',
  ]),
  _FoodRule(FoodSubcategory.beverages, [
    'juice',
    'water',
    'soft drink',
    'cooldrink',
    'cola',
    'appletiser',
    'coffee',
    'tea ',
    'rooibos',
    'energy drink',
    'squash',
    'cordial',
    'iced tea',
    'lemonade',
  ]),
  _FoodRule(FoodSubcategory.snacksSweets, [
    'snack',
    'niknaks',
    'chips',
    'crisps',
    'chocolate',
    'choc ',
    'sweets',
    'biscuit',
    'cookie',
    'nuts',
    'popcorn',
    'candy',
    'gum ',
  ]),
  _FoodRule(FoodSubcategory.dairyEggs, [
    'milk',
    'egg',
    'eggs',
    'cheese',
    'yoghurt',
    'yogurt',
    'butter',
    'margarine',
    'cream ',
    'custard',
    'amasi',
    'maas',
  ]),
  _FoodRule(FoodSubcategory.meatPoultry, [
    'chicken',
    'beef',
    'lamb',
    'pork',
    'fillet',
    'chops',
    'mince',
    'sausage',
    'boerewors',
    'wors',
    'bacon',
    'polony',
    'viennas',
    'samoosa',
    'ribs',
    'steak',
  ]),
  _FoodRule(FoodSubcategory.bakery, [
    'bread',
    'roll',
    'rolls',
    'muffin',
    'bun ',
    'baguette',
    'croissant',
    'pancake',
    'wrap',
    'pita',
    'cake',
    'scone',
  ]),
  _FoodRule(FoodSubcategory.freshProduce, [
    'banana',
    'apple',
    'potato',
    'onion',
    'tomato',
    'lettuce',
    'spinach',
    'carrot',
    'fruit',
    'vegetable',
    'avocado',
    'salad',
    'cucumber',
    'pepper',
  ]),
  _FoodRule(FoodSubcategory.frozen, [
    'frozen',
    'ice cream',
    'ice-cream',
    'oven chips',
    'frozen veg',
  ]),
  _FoodRule(FoodSubcategory.pantry, [
    'rice',
    'beans',
    'sugar',
    'flour',
    'macaroni',
    'pasta',
    'noodle',
    'cereal',
    'oil',
    'sauce',
    'soup',
    'jam',
    'honey',
    'peanut butter',
    'maize',
    'mielie',
    'samp',
    'tastic',
    'koo',
    'spice',
    'salt',
    'stock',
    'tinned',
    'canned',
    'mayonnaise',
  ]),
];

DealClassification classifyDeal(String title,
    [String? retailerId,
    DealClassificationContext context = const DealClassificationContext()]) {
  final text = _normalize(title);
  final metadataText = _normalize([
    context.retailerName,
    context.sourceLabel,
    context.sourceUrl,
    context.evidenceText,
  ].whereType<String>().join(' '));

  for (final override in _titleOverrides) {
    if (_matchesAny(text, override.phrases)) {
      return _buildClassification(override.category, text);
    }
  }

  var bestCategory = DealCategory.other;
  var bestScore = 0;

  for (final rule in _categoryRules) {
    final metadataPhrases = _metadataHints
        .where((hint) => hint.category == rule.category)
        .map((hint) => hint.phrases)
        .firstOrNull;
    final metadataScore =
        _scoreMatches(metadataText, metadataPhrases ?? const [], 1).clamp(0, 2);
    final score = _scoreMatches(text, rule.strong, 5) +
        _scoreMatches(text, rule.supporting, 2) +
        metadataScore;
    if (score > bestScore) {
      bestCategory = rule.category;
      bestScore = score;
    }
  }

  if (bestScore > 0) return _buildClassification(bestCategory, text);

  final fallback = _retailerFallback(retailerId);
  return _buildClassification(fallback, text);
}

DealClassification _buildClassification(
    DealCategory category, String titleText) {
  return category == DealCategory.food
      ? DealClassification(DealCategory.food, _classifyFood(titleText))
      : DealClassification(category);
}

FoodSubcategory _classifyFood(String text) {
  for (final rule in _foodRules) {
    if (_matchesAny(text, rule.patterns)) {
      return rule.subcategory;
    }
  }
  return FoodSubcategory.foodOther;
}

DealCategory _retailerFallback(String? retailerId) {
  switch (retailerId) {
    case 'dis-chem':
    case 'clicks':
      return DealCategory.healthBeauty;
    case 'builders':
      return DealCategory.diyHardware;
    case 'yuppiechef':
      return DealCategory.homeCookware;
    case 'amazon-za':
    case 'takealot':
      return DealCategory.tech;
    default:
      return DealCategory.other;
  }
}

bool _matchesAny(String paddedText, List<String> patterns) {
  for (final pattern in patterns) {
    if (paddedText.contains(_normalize(pattern))) return true;
  }
  return false;
}

int _scoreMatches(String paddedText, List<String> patterns, int weight) {
  var score = 0;
  for (final pattern in patterns) {
    if (paddedText.contains(_normalize(pattern))) score += weight;
  }
  return score;
}

String _normalize(String value) {
  final normalized = value
      .toLowerCase()
      .replaceAll(RegExp("[’']"), '')
      .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  return normalized.isEmpty ? ' ' : ' $normalized ';
}
