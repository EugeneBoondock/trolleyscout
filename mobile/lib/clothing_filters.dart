import 'api_models.dart';
import 'deal_categories.dart';

/// Who a garment is for. Inferred from the words retailers actually use in
/// South African listings; anything unstated stays [ClothingAudience.any] so
/// it is never hidden from a shopper browsing everything.
enum ClothingAudience { any, women, men, kids }

enum GarmentType {
  any,
  tops,
  bottoms,
  dresses,
  outerwear,
  footwear,
  underwear,
  accessories,
}

class GarmentTypeOption {
  const GarmentTypeOption(this.id, this.label, this.icon);
  final GarmentType id;
  final String label;
  final String icon;
}

/// The categories a shopper can browse.
///
/// Underwear is deliberately absent. The fitting room puts a chosen garment on
/// a photograph of a real person, and a browsable underwear aisle turns that
/// into a tool for undressing someone who never agreed to it. The garment type
/// still exists so the scout can recognise and shelve such items away from the
/// try-on rail — it simply is not something this app offers to put on anybody.
const List<GarmentTypeOption> garmentTypeOptions = [
  GarmentTypeOption(GarmentType.tops, 'Tops', '👕'),
  GarmentTypeOption(GarmentType.bottoms, 'Bottoms', '👖'),
  GarmentTypeOption(GarmentType.dresses, 'Dresses', '👗'),
  GarmentTypeOption(GarmentType.outerwear, 'Jackets', '🧥'),
  GarmentTypeOption(GarmentType.footwear, 'Shoes', '👟'),
  GarmentTypeOption(GarmentType.accessories, 'Accessories', '🧢'),
];

class ClothingAudienceOption {
  const ClothingAudienceOption(this.id, this.label);
  final ClothingAudience id;
  final String label;
}

const List<ClothingAudienceOption> clothingAudienceOptions = [
  ClothingAudienceOption(ClothingAudience.women, 'Women'),
  ClothingAudienceOption(ClothingAudience.men, 'Men'),
  ClothingAudienceOption(ClothingAudience.kids, 'Kids'),
];

const _kidsWords = [
  'kids', 'kid', 'child', 'children', 'boys', 'girls', 'boy', 'girl',
  'toddler', 'infant', 'baby', 'babies', 'junior', 'teen', 'school',
  'newborn', 'romper', 'babygrow', 'onesie',
];
const _womenWords = [
  'women', 'woman', 'ladies', 'lady', 'female', 'dress', 'skirt', 'blouse',
  'bra ', 'bralette', 'leggings', 'jumpsuit', 'camisole', 'maternity',
  'heels', 'handbag',
];
const _menWords = [
  'men', 'man', 'mens', 'male', 'boxers', 'boxer shorts', 'tie ', 'necktie',
  'suit', 'blazer', 'golfer',
];

const _typeWords = <GarmentType, List<String>>{
  GarmentType.dresses: ['dress', 'gown', 'jumpsuit', 'romper', 'frock'],
  GarmentType.outerwear: [
    'jacket', 'coat', 'blazer', 'hoodie', 'sweater', 'jersey', 'cardigan',
    'pullover', 'fleece', 'parka', 'windbreaker', 'puffer', 'gilet',
  ],
  GarmentType.footwear: [
    'shoe', 'shoes', 'sneaker', 'takkies', 'boot', 'boots', 'sandal',
    'slipper', 'heels', 'loafer', 'pumps', 'trainers', 'flip flop',
  ],
  GarmentType.underwear: [
    'underwear', 'briefs', 'boxers', 'bra ', 'bralette', 'panties', 'thong',
    'vest', 'socks', 'sock', 'stockings', 'tights', 'pyjama', 'sleepwear',
    'nightie', 'lingerie', 'shapewear',
  ],
  GarmentType.bottoms: [
    'jean', 'jeans', 'trouser', 'trousers', 'pants', 'chino', 'shorts',
    'skirt', 'leggings', 'joggers', 'tracksuit pants', 'cargo',
  ],
  GarmentType.tops: [
    't-shirt', 'tshirt', 'tee ', 'shirt', 'top ', 'blouse', 'polo', 'vest top',
    'crop top', 'tank', 'camisole', 'golfer', 'sweatshirt', 'jersey top',
  ],
  GarmentType.accessories: [
    'cap', 'hat', 'beanie', 'scarf', 'belt', 'glove', 'gloves', 'bag',
    'handbag', 'backpack', 'wallet', 'sunglasses', 'watch', 'jewellery',
    'necklace', 'earrings', 'bracelet', 'tie ', 'headband',
  ],
};

/// Garments a virtual try-on can actually dress someone in. Shoes, bags and
/// hats are real clothing deals worth browsing, but the model puts a garment
/// on a torso — offering "try on" for a wallet would only disappoint.
const _tryOnableTypes = {
  GarmentType.tops,
  GarmentType.bottoms,
  GarmentType.dresses,
  GarmentType.outerwear,
};

/// Homeware, bedding and hardware that either live beside clothes or borrow a
/// clothing word. "Per coat per litre" is paint; a duvet is not a garment.
const _notApparelWords = [
  'mirror', 'duvet', 'duvets', 'blanket', 'blankets', 'sheet', 'sheets',
  'pillow', 'pillows', 'pillowcase', 'cushion', 'cushions', 'towel', 'towels',
  'curtain', 'curtains', 'rug', 'rugs', 'mat', 'mats', 'doormat', 'throw',
  'throws', 'bedding', 'comforter', 'quilt', 'linen', 'linens', 'valance',
  'mattress', 'protector', 'hanger', 'hangers', 'rail', 'rails', 'basket',
  'laundry', 'iron', 'steamer', 'mannequin', 'wardrobe',
  // Paint and coatings, which speak of coats and undercoats.
  'paint', 'paints', 'ceiling', 'ceilings', 'wall', 'walls', 'primer',
  'varnish', 'enamel', 'undercoat', 'litre', 'litres', 'sealer', 'plaster',
];

String _normalize(String value) =>
    ' ${value.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), ' ').replaceAll(RegExp(r'\s+'), ' ').trim()} ';

Set<String> _tokens(String normalized) =>
    normalized.trim().split(' ').where((token) => token.isNotEmpty).toSet();

/// Whole-word matching. Substring matching put "mat" inside "matte" and
/// "coat" inside paint tins; a garment word has to be its own word, though a
/// multi-word phrase may still be looked for as a phrase.
bool _mentions(String text, List<String> words) {
  final tokens = _tokens(text);
  for (final word in words) {
    final clean = word.trim();
    if (clean.isEmpty) continue;
    if (clean.contains(' ')) {
      if (text.contains(' $clean ')) return true;
      continue;
    }
    if (tokens.contains(clean)) return true;
    // Plain plurals count: "jeans", "sneakers", "boots".
    if (tokens.contains('${clean}s')) return true;
  }
  return false;
}

ClothingAudience audienceForDeal(Deal deal) {
  final text = _normalize('${deal.title} ${deal.sourceLabel}');
  // Kids first: "boys' shirt" is a kids item before it is a men's one.
  if (_mentions(text, _kidsWords)) return ClothingAudience.kids;
  if (_mentions(text, _womenWords)) return ClothingAudience.women;
  if (_mentions(text, _menWords)) return ClothingAudience.men;
  return ClothingAudience.any;
}

GarmentType garmentTypeForDeal(Deal deal) {
  final text = _normalize(deal.title);
  // Most specific shapes first so "denim jacket" is outerwear, not bottoms.
  for (final type in [
    GarmentType.footwear,
    GarmentType.dresses,
    GarmentType.outerwear,
    GarmentType.underwear,
    GarmentType.bottoms,
    GarmentType.accessories,
    GarmentType.tops,
  ]) {
    if (_mentions(text, _typeWords[type]!)) return type;
  }
  return GarmentType.any;
}

bool canTryOnDeal(Deal deal) =>
    _tryOnableTypes.contains(garmentTypeForDeal(deal));

/// True only for things a person wears. The clothing category alone lets in
/// mirrors, hangers and irons that merely live near clothes; a garment must
/// also name a garment.
bool isWearableClothing(Deal deal, {DealClassification? classification}) {
  // Anything naming homeware, bedding or paint is out before any clothing
  // word gets a chance to argue otherwise.
  if (_mentions(_normalize(deal.title), _notApparelWords)) return false;

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
  if (resolved.category != DealCategory.clothing) return false;
  return garmentTypeForDeal(deal) != GarmentType.any;
}

List<Deal> filterClothingDeals(
  List<Deal> deals, {
  String retailerId = 'all',
  ClothingAudience audience = ClothingAudience.any,
  GarmentType type = GarmentType.any,
  bool tryOnableOnly = false,
}) {
  return deals.where((deal) {
    if (retailerId != 'all' && deal.retailerId != retailerId) return false;
    if (audience != ClothingAudience.any &&
        audienceForDeal(deal) != audience) {
      return false;
    }
    if (type != GarmentType.any && garmentTypeForDeal(deal) != type) {
      return false;
    }
    if (tryOnableOnly && !canTryOnDeal(deal)) return false;
    return true;
  }).toList(growable: false);
}
