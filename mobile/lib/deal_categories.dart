// Dart port of src/services/dealCategories.ts — a pure keyword classifier that
// sorts deal titles into shopper-facing categories so Find deals can offer
// "show me only dairy" style filters. Kept in lockstep with the web classifier.

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

class _Rule {
  const _Rule(this.category, this.patterns);
  final DealCategory category;
  final List<String> patterns;
}

// Checked in order; first hit wins. Less-ambiguous categories first.
const List<_Rule> _categoryRules = [
  _Rule(DealCategory.babyKids, [
    'baby', 'infant', 'nappy', 'nappies', 'diaper', 'toddler', 'kids', "kid's",
    'pj masks', 'gekko', 'toy', 'toys', 'play set', 'dummies', 'pacifier', 'purity',
  ]),
  _Rule(DealCategory.pets, [
    'dog food', 'cat food', 'pet', 'puppy', 'kitten', 'bob martin', 'whiskas', 'pedigree',
  ]),
  _Rule(DealCategory.tech, [
    'samsung', 'hisense', 'ledtv', 'led tv', 'smart tv', 'television', 'laptop', 'tablet',
    'smartphone', 'iphone', 'galaxy', 'fridge', 'freezer', 'microwave', 'air fryer', 'airfryer',
    'toaster', 'kettle', 'treadmill', 'inverter', 'charger', 'usb', 'adapter', 'vacuum',
    'hair dryer', 'clipper', 'headphone', 'earbud', 'speaker', 'router', 'console', 'playstation',
    'xbox', 'monitor', 'printer', 'camera', 'power bank', 'powerbank',
  ]),
  _Rule(DealCategory.clothing, [
    'jean', 'jeans', 'denim', 't-shirt', 'tshirt', 'shirt', 'trouser', 'jacket', 'hoodie',
    'sneaker', 'shoe', 'shoes', 'boot', 'sock', 'socks', 'dress', 'skirt', 'jersey', 'takkies',
  ]),
  _Rule(DealCategory.diyHardware, [
    'drill', 'grinder', 'welder', 'electrode', 'cordless', 'toolbox', 'screwdriver', 'spanner',
    'paint', 'cement', 'timber', 'ladder', 'hose pipe', 'generator', 'battery', 'batteries',
    'door chime', 'padlock', 'globe', 'downlight', 'extension cord', 'wheelbarrow',
  ]),
  _Rule(DealCategory.cleaning, [
    'detergent', 'washing powder', 'dishwash', 'omo', 'sunlight liquid', 'handy andy', 'mr sheen',
    'domestos', 'bleach', 'toilet paper', 'toilet roll', 'paper towel', 'fabric softener',
    'stain remover', 'air freshener', 'furniture polish', 'floor cleaner', 'surface cleaner',
    'refuse bag', 'dishwashing',
  ]),
  _Rule(DealCategory.healthBeauty, [
    'shampoo', 'conditioner', 'body wash', 'body lotion', 'body oil', 'hand sanitiser', 'sanitiser',
    'toothbrush', 'toothpaste', 'deodorant', 'roll-on', 'roll on', 'perfume', 'fragrance', 'cologne',
    'eau de', 'moisturiser', 'moisturizer', 'serum', 'sunscreen', 'spf', 'vitamin', 'supplement',
    'capsule', 'tablet', 'tabs', 'ashwagandha', 'magnesium', 'moringa', 'collagen', 'probiotic',
    'plaster', 'bandage', 'cantu', 'dark & lovely', 'eucerin', 'nivea', 'dove ', 'makeup', 'make-up',
    'lipstick', 'mascara', 'hair butter', 'hair freshener', 'cleansing', 'face cream', 'night cream',
    'day cream', 'anti-ageing', 'cotton wool', 'razor', 'shaving',
  ]),
  _Rule(DealCategory.homeCookware, [
    'towel', 'bathmat', 'bath mat', 'planter', 'mug', 'french press', 'dinner plate', 'plate set',
    'cookie cutter', 'candle', 'bottle', 'flask', 'pot ', 'pan ', 'frying pan', 'saucepan',
    'cutlery', 'crockery', 'glassware', 'tumbler', 'duvet', 'pillow', 'blanket', 'sheet set',
    'curtain', 'storage box', 'bucket', 'basket', 'espresso maker', 'coffee maker', 'moka',
    'chopping board', 'knife set', 'utensil', 'bakeware', 'bin ',
  ]),
  _Rule(DealCategory.food, [
    'milk', 'juice', 'rice', 'beans', 'egg', 'eggs', 'sugar', 'flour', 'macaroni', 'pasta',
    'noodle', 'chicken', 'beef', 'lamb', 'pork', 'fillet', 'chops', 'samoosa', 'muffin', 'roll',
    'bread', 'biscuit', 'snack', 'niknaks', 'chips', 'chocolate', 'choc ', 'sweets', 'cereal',
    'coffee', 'tea ', 'rooibos', 'water', 'soft drink', 'cooldrink', 'cola', 'appletiser', 'cheese',
    'yoghurt', 'butter', 'margarine', 'oil', 'sauce', 'soup', 'jam', 'honey', 'peanut butter',
    'coffee creamer', 'maize', 'mielie', 'samp', 'tastic', 'koo', 'wine', 'beer', 'cider',
    'whisky', 'vodka', 'gin ', 'brandy', 'frozen', 'ice cream', 'crisps', 'nuts', 'fruit',
    'vegetable', 'banana', 'apple', 'potato', 'onion', 'tomato',
  ]),
];

class _FoodRule {
  const _FoodRule(this.subcategory, this.patterns);
  final FoodSubcategory subcategory;
  final List<String> patterns;
}

const List<_FoodRule> _foodRules = [
  _FoodRule(FoodSubcategory.alcohol, [
    'wine', 'beer', 'cider', 'whisky', 'whiskey', 'vodka', 'gin ', 'brandy', 'rum ', 'liqueur', 'savanna', 'castle', 'heineken',
  ]),
  _FoodRule(FoodSubcategory.beverages, [
    'juice', 'water', 'soft drink', 'cooldrink', 'cola', 'appletiser', 'coffee', 'tea ', 'rooibos', 'energy drink', 'squash', 'cordial', 'iced tea', 'lemonade',
  ]),
  _FoodRule(FoodSubcategory.snacksSweets, [
    'snack', 'niknaks', 'chips', 'crisps', 'chocolate', 'choc ', 'sweets', 'biscuit', 'cookie', 'nuts', 'popcorn', 'candy', 'gum ',
  ]),
  _FoodRule(FoodSubcategory.dairyEggs, [
    'milk', 'egg', 'eggs', 'cheese', 'yoghurt', 'yogurt', 'butter', 'margarine', 'cream ', 'custard', 'amasi', 'maas',
  ]),
  _FoodRule(FoodSubcategory.meatPoultry, [
    'chicken', 'beef', 'lamb', 'pork', 'fillet', 'chops', 'mince', 'sausage', 'boerewors', 'wors', 'bacon', 'polony', 'viennas', 'samoosa', 'ribs', 'steak',
  ]),
  _FoodRule(FoodSubcategory.bakery, [
    'bread', 'roll', 'muffin', 'bun ', 'baguette', 'croissant', 'pancake', 'wrap', 'pita', 'cake', 'scone',
  ]),
  _FoodRule(FoodSubcategory.freshProduce, [
    'banana', 'apple', 'potato', 'onion', 'tomato', 'lettuce', 'spinach', 'carrot', 'fruit', 'vegetable', 'avocado', 'salad', 'cucumber', 'pepper',
  ]),
  _FoodRule(FoodSubcategory.frozen, [
    'frozen', 'ice cream', 'ice-cream', 'oven chips', 'frozen veg',
  ]),
  _FoodRule(FoodSubcategory.pantry, [
    'rice', 'beans', 'sugar', 'flour', 'macaroni', 'pasta', 'noodle', 'cereal', 'oil', 'sauce', 'soup', 'jam', 'honey', 'peanut butter', 'maize', 'mielie', 'samp', 'tastic', 'koo', 'spice', 'salt', 'stock', 'tinned', 'canned', 'mayonnaise',
  ]),
];

DealClassification classifyDeal(String title, [String? retailerId]) {
  final text =
      ' ${title.toLowerCase().replaceAll(RegExp(r"[^a-z0-9&'-]+"), ' ').replaceAll(RegExp(r'\s+'), ' ')} ';

  for (final rule in _categoryRules) {
    if (_matchesAny(text, rule.patterns)) {
      return rule.category == DealCategory.food
          ? DealClassification(DealCategory.food, _classifyFood(text))
          : DealClassification(rule.category);
    }
  }

  final fallback = _retailerFallback(retailerId);
  return fallback == DealCategory.food
      ? DealClassification(DealCategory.food, _classifyFood(text))
      : DealClassification(fallback);
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
    case 'food-lovers':
    case 'pick-n-pay':
    case 'woolworths':
    case 'checkers':
    case 'shoprite':
    case 'spar':
    case 'boxer':
      return DealCategory.food;
    default:
      return DealCategory.other;
  }
}

bool _matchesAny(String paddedText, List<String> patterns) {
  for (final pattern in patterns) {
    if (pattern.endsWith(' ')) {
      if (paddedText.contains(' $pattern')) return true;
    } else if (paddedText.contains(' $pattern ') || paddedText.contains(' $pattern')) {
      return true;
    }
  }
  return false;
}
