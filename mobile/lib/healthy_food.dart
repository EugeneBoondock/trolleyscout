import 'api_models.dart';
import 'deal_categories.dart';

/// Healthy staples the marketplace should surface when a shopper asks to eat
/// better on the same money. Matching is deliberately staple-first: whole
/// foods and the protein-per-rand workhorses of South African kitchens, not
/// marketing terms like "lite" or "sugar-free" on processed goods.
const List<String> _healthyKeywords = [
  // Fresh produce staples
  'apple', 'banana', 'orange', 'naartjie', 'pear', 'grape', 'mango', 'paw paw',
  'papaya', 'pineapple', 'guava', 'peach', 'plum', 'melon', 'watermelon',
  'avocado', 'spinach', 'morogo', 'kale', 'cabbage', 'carrot', 'tomato',
  'onion', 'butternut', 'pumpkin', 'sweet potato', 'beetroot', 'broccoli',
  'cauliflower', 'lettuce', 'cucumber', 'green beans', 'peppers', 'mealies',
  'sweetcorn', 'garlic', 'ginger',
  // Affordable protein
  'eggs', 'egg ', 'pilchards', 'sardines', 'tuna', 'hake', 'snoek',
  'chicken livers', 'liver', 'beans', 'sugar beans', 'baked beans', 'lentils',
  'chickpeas', 'split peas', 'soya mince', 'peanut butter', 'peanuts',
  // Wholegrains and dairy
  'oats', 'oatmeal', 'brown rice', 'brown bread', 'whole wheat', 'wholewheat',
  'whole grain', 'wholegrain', 'high fibre', 'bulgur', 'barley', 'sorghum',
  'mabele', 'maltabella', 'milk', 'amasi', 'maas', 'plain yoghurt',
  'low fat yoghurt',
];

/// Anything matching these stays out even when a healthy word also appears —
/// "chocolate-coated oats bar" is not the oats we mean.
const List<String> _unhealthyKeywords = [
  'chocolate', 'sweets', 'candy', 'chips', 'crisps', 'soda', 'cola',
  'energy drink', 'doughnut', 'donut', 'cake', 'biscuit', 'cookie', 'pie ',
  'fried', 'polony', 'viennas', 'russians', 'syrup', 'cordial', 'cream soda',
  'ice cream', 'milkshake', 'sausage roll', 'instant noodle', 'shortbread',
  'cheddars', 'sparkling', 'flavoured milk', 'flavored milk', 'gravy',
  'appletiser', 'grapetiser', 'ice tea', 'ice-tea', 'iced tea', 'concentrate',
  // Not unhealthy — just not food. A food word inside a toiletry or gadget
  // name ("oatmeal cleansing bar", "banana hair mask", "milk storage cups")
  // must never put it on a plate.
  'cleansing', 'soap', 'shampoo', 'hair', 'lotion', 'mist', 'fragrance',
  'scrub', 'mask', 'wipes', 'storage', 'bottle', 'cups', 'diffuser',
  'candle', 'body wash', 'body butter', 'bath',
];

bool isHealthyFoodDeal(
  Deal deal, {
  DealClassification? classification,
}) {
  final resolved = classification ??
      classifyDeal(
        deal.title,
        deal.retailerId,
        DealClassificationContext(
          retailerName: deal.retailerName,
          sourceLabel: deal.sourceLabel,
          sourceUrl: deal.sourceUrl,
        ),
      );
  if (resolved.category != DealCategory.food) return false;
  if (resolved.foodSubcategory == FoodSubcategory.alcohol) return false;

  final text = ' ${deal.title.toLowerCase()} ';
  if (_unhealthyKeywords.any(text.contains)) return false;
  if (_healthyKeywords.any(text.contains)) return true;
  // Whole fresh produce is healthy by definition even when the specific
  // vegetable is not on the keyword list.
  return resolved.foodSubcategory == FoodSubcategory.freshProduce;
}

class HealthyFoodFact {
  const HealthyFoodFact({required this.fact, required this.tip});

  /// The reality being named.
  final String fact;

  /// What the shopper can do about it with the deals on this screen.
  final String tip;
}

/// Short, practical notes shown with the healthy filter. They speak to the
/// real problem — eating well costs more upfront — and point at the cheapest
/// route through it, not at guilt.
const List<HealthyFoodFact> healthyFoodFacts = [
  HealthyFoodFact(
    fact:
        'Healthy eating fails on price, not willpower fresh food costs more '
        'per meal than filling processed staples.',
    tip:
        'That is exactly why this filter exists: it only shows whole foods '
        'that are on promotion right now.',
  ),
  HealthyFoodFact(
    fact:
        'Dried beans, lentils and eggs deliver the cheapest protein per rand '
        'in South African stores far below red meat.',
    tip: 'Swap two meat dinners a week for bean or egg dishes and bank the '
        'difference.',
  ),
  HealthyFoodFact(
    fact:
        'Tinned pilchards and sardines carry the same omega-3s dietitians '
        'praise in expensive fish.',
    tip: 'They keep for months, so stock up whenever a tin drops below its '
        'usual price.',
  ),
  HealthyFoodFact(
    fact:
        'Oats and sorghum porridge cost a fraction of boxed cereal per bowl '
        'and hold you fuller for longer.',
    tip: 'A large bag on special beats any cereal deal on price per '
        'breakfast.',
  ),
  HealthyFoodFact(
    fact:
        'Vegetables in season are at their cheapest and most nutritious at '
        'the same time.',
    tip: 'Butternut, cabbage and carrots in winter; tomatoes and mealies in '
        'summer buy what the specials lean toward.',
  ),
  HealthyFoodFact(
    fact:
        'Frozen vegetables are frozen at peak freshness and often undercut '
        'the fresh shelf with none of the spoilage waste.',
    tip: 'If fresh keeps going off before you finish it, frozen is the '
        'cheaper healthy option, not the lesser one.',
  ),
  HealthyFoodFact(
    fact:
        'Amasi and plain yoghurt give you the probiotics and protein that '
        'flavoured tubs charge extra for without the added sugar.',
    tip: 'Sweeten plain yoghurt with seasonal fruit from the produce '
        'specials instead.',
  ),
];

/// A stable pick per day so the strip feels alive without shuffling on every
/// rebuild.
HealthyFoodFact healthyFactForDay(DateTime day) =>
    healthyFoodFacts[day.difference(DateTime.utc(2026)).inDays.abs() %
        healthyFoodFacts.length];
