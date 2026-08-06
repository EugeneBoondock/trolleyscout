import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/outfit_slots.dart';

ClothingItem garment(
  String id,
  String title,
  String type, {
  String retailer = 'Mr Price',
}) =>
    ClothingItem(
      id: id,
      title: title,
      retailerId: retailer.toLowerCase(),
      retailerName: retailer,
      priceCents: 19900,
      imageUrl: 'https://cdn.example.test/$id.jpg',
      productUrl: 'https://shop.example.test/$id',
      audience: 'any',
      garmentType: type,
    );

final jeans = garment('jeans', 'Slim Fit Jeans', 'bottoms');
final shirt = garment('shirt', 'Cotton T-Shirt', 'tops');
final jacket = garment('jacket', 'Denim Jacket', 'outerwear');
final sneakers = garment('shoes', 'Canvas Sneakers', 'footwear');
final cap = garment('cap', 'Baseball Cap Black', 'accessories');
final earrings = garment('earrings', 'Gold Hoop Earrings', 'accessories');
final dress = garment('dress', 'Floral Maxi Dress', 'dresses');

void main() {
  group('where a garment goes', () {
    test('reads the place on the body, not just the browse category', () {
      expect(outfitSlotFor(jeans), OutfitSlot.bottom);
      expect(outfitSlotFor(shirt), OutfitSlot.top);
      expect(outfitSlotFor(jacket), OutfitSlot.outer);
      expect(outfitSlotFor(sneakers), OutfitSlot.footwear);
      expect(outfitSlotFor(dress), OutfitSlot.dress);
    });

    test('splits headwear out of accessories', () {
      // The taxonomy files a cap under accessories, which is right for
      // browsing and wrong for dressing: a cap and earrings do not compete
      // for the same place on a body.
      expect(outfitSlotFor(cap), OutfitSlot.headwear);
      expect(outfitSlotFor(earrings), OutfitSlot.accessory);
    });

    test('leaves out what cannot be layered into a look', () {
      expect(
          outfitSlotFor(garment('socks', 'Ankle Socks', 'underwear')), isNull);
    });
  });

  group('what may join the outfit', () {
    test('a second top is refused, a jacket over it is not', () {
      expect(outfitRejection(shirt, [jeans]), isNull);

      final another = garment('shirt2', 'Striped Shirt', 'tops');
      expect(outfitRejection(another, [shirt]), contains('already have a top'));
      // ...and the message points at what does work.
      expect(outfitRejection(another, [shirt]), contains('jacket'));

      expect(outfitRejection(jacket, [shirt]), isNull);
    });

    test('a full look builds up without complaint', () {
      final chosen = <ClothingItem>[];
      for (final piece in [jeans, shirt, jacket, sneakers, cap, earrings]) {
        expect(outfitRejection(piece, chosen), isNull,
            reason: '${piece.title} should fit into the look');
        chosen.add(piece);
      }
      expect(chosen, hasLength(6));
    });

    test('a dress cannot share a body with separates', () {
      expect(outfitRejection(dress, [shirt]), contains('replaces a top'));
      expect(outfitRejection(dress, [jeans]), contains('replaces a top'));
      expect(outfitRejection(shirt, [dress]), contains('dress already covers'));
      // Shoes and accessories are still fine with a dress.
      expect(outfitRejection(sneakers, [dress]), isNull);
      expect(outfitRejection(earrings, [dress]), isNull);
    });

    test('the same garment cannot be added twice', () {
      expect(
          outfitRejection(shirt, [shirt]), contains('already in the outfit'));
    });

    test('accessories stop at two', () {
      final necklace = garment('necklace', 'Gold Necklace', 'accessories');
      final bracelet = garment('bracelet', 'Silver Bracelet', 'accessories');
      expect(outfitRejection(necklace, [earrings]), isNull);
      expect(
        outfitRejection(bracelet, [earrings, necklace]),
        contains('as many accessories'),
      );
    });
  });

  group('the order clothes go on', () {
    test('the first piece picked is the first one worn', () {
      // The shopper sees the tray number as they build the look, so the order
      // they chose is the order they expect on the body. Reshuffling it would
      // make the result unpredictable from the one thing they control.
      expect(
        outfitInLayerOrder([shirt, jeans]).map((item) => item.id),
        ['shirt', 'jeans'],
      );
      expect(
        outfitInLayerOrder([jeans, shirt]).map((item) => item.id),
        ['jeans', 'shirt'],
      );
    });

    test('the first piece worn is the one that meets the original photo', () {
      // Every piece after the first is rendered onto the look so far.
      final ordered = outfitInLayerOrder([jeans, shirt, jacket]);
      expect(ordered.first.id, 'jeans');
      expect(ordered.last.id, 'jacket');
    });

    test('a long look keeps its order all the way through', () {
      final picked = [jeans, shirt, jacket, sneakers, cap, earrings];
      expect(
        outfitInLayerOrder(picked).map((item) => item.id),
        picked.map((item) => item.id),
      );
    });
  });
}
