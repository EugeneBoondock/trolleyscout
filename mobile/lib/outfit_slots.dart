/// How an outfit is built.
///
/// The fitting model dresses a body one garment per render: each result
/// becomes the photo for the next piece, so the first piece the shopper picks
/// is the one worn against their own photo.
///
/// It also makes slots real. Two shirts cannot both be worn, but a shirt and a
/// jacket can, so the tray has to know the difference between "another top"
/// and "a layer over the top".
library;

import 'api_models.dart';

enum OutfitSlot {
  bottom,
  dress,
  top,
  outer,
  footwear,
  headwear,
  accessory,
}

extension OutfitSlotLabel on OutfitSlot {
  String get label => switch (this) {
        OutfitSlot.bottom => 'Bottoms',
        OutfitSlot.dress => 'Dress',
        OutfitSlot.top => 'Top',
        OutfitSlot.outer => 'Layer',
        OutfitSlot.footwear => 'Shoes',
        OutfitSlot.headwear => 'Headwear',
        OutfitSlot.accessory => 'Accessory',
      };
}

/// The places on a body an outfit can fill. Order here is for display only —
/// what actually goes on first is what the shopper picked first.
const List<OutfitSlot> outfitLayerOrder = [
  OutfitSlot.bottom,
  OutfitSlot.dress,
  OutfitSlot.top,
  OutfitSlot.outer,
  OutfitSlot.footwear,
  OutfitSlot.headwear,
  OutfitSlot.accessory,
];

/// How many pieces each slot takes. Earrings and a necklace are both
/// accessories; two pairs of jeans are not an outfit.
const Map<OutfitSlot, int> outfitSlotCapacity = {
  OutfitSlot.bottom: 1,
  OutfitSlot.dress: 1,
  OutfitSlot.top: 1,
  OutfitSlot.outer: 1,
  OutfitSlot.footwear: 1,
  OutfitSlot.headwear: 1,
  OutfitSlot.accessory: 2,
};

/// Words that mean a thing is worn on the head. The taxonomy files hats under
/// accessories, which is right for browsing and wrong for dressing: a beanie
/// and a necklace do not compete for the same place on a body.
const List<String> _headwearWords = [
  'hat',
  'cap',
  'beanie',
  'headband',
  'hairband',
  'bucket hat',
  'sun hat',
  'visor',
  'bandana',
  'durag',
  'headwrap',
];

/// Where a garment goes, or null when it is not something to layer.
OutfitSlot? outfitSlotFor(ClothingItem item) {
  switch (item.garmentType) {
    case 'bottoms':
      return OutfitSlot.bottom;
    case 'dresses':
      return OutfitSlot.dress;
    case 'tops':
      return OutfitSlot.top;
    case 'outerwear':
      return OutfitSlot.outer;
    case 'footwear':
      return OutfitSlot.footwear;
    case 'accessories':
      final title = item.title.toLowerCase();
      return _headwearWords.any(title.contains)
          ? OutfitSlot.headwear
          : OutfitSlot.accessory;
    default:
      // Underwear and anything untyped are not part of a look the model can
      // usefully render over.
      return null;
  }
}

/// Why a garment cannot join the outfit, or null when it can.
///
/// The message is what the shopper reads, so it says what to do rather than
/// what went wrong.
String? outfitRejection(ClothingItem item, List<ClothingItem> chosen) {
  final slot = outfitSlotFor(item);
  if (slot == null) {
    return '${item.title} is not something I can layer into a look.';
  }
  if (chosen.any((existing) => existing.id == item.id)) {
    return 'That one is already in the outfit.';
  }

  final slots = chosen.map(outfitSlotFor).whereType<OutfitSlot>().toList();

  // A dress is a top and a bottom at once, so it cannot share with either.
  if (slot == OutfitSlot.dress &&
      (slots.contains(OutfitSlot.top) || slots.contains(OutfitSlot.bottom))) {
    return 'A dress replaces a top and bottoms. Remove those first.';
  }
  if ((slot == OutfitSlot.top || slot == OutfitSlot.bottom) &&
      slots.contains(OutfitSlot.dress)) {
    return 'The dress already covers that. Remove it to build separates.';
  }

  final taken = slots.where((existing) => existing == slot).length;
  if (taken >= (outfitSlotCapacity[slot] ?? 1)) {
    return switch (slot) {
      OutfitSlot.top =>
        'You already have a top. Add a jacket to layer over it instead.',
      OutfitSlot.bottom => 'You already have bottoms in this outfit.',
      OutfitSlot.outer => 'You already have a layer over the top.',
      OutfitSlot.footwear => 'You already have shoes in this outfit.',
      OutfitSlot.headwear => 'You already have headwear in this outfit.',
      OutfitSlot.accessory => 'That is as many accessories as I can layer.',
      OutfitSlot.dress => 'You already have a dress in this outfit.',
    };
  }
  return null;
}

/// The outfit in the order it will be worn.
///
/// This is simply the order the shopper picked, and deliberately so. They can
/// see the tray numbering as they build the look, so the order they chose is
/// the order they expect on the body — reshuffling it behind their back would
/// make the result unpredictable from the one thing they control.
///
/// It matters because the model paints each garment onto the previous result:
/// the first piece meets the shopper's own photo, and every piece after that
/// is rendered onto the look so far.
List<ClothingItem> outfitInLayerOrder(List<ClothingItem> chosen) {
  return List.unmodifiable(chosen);
}
