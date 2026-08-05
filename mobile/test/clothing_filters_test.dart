import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/clothing_filters.dart';

Deal _deal(String title, {String retailerId = 'mrp', String retailer = 'Mr Price'}) =>
    Deal(
      id: title,
      retailerId: retailerId,
      retailerName: retailer,
      sourceLabel: 'Fashion',
      title: title,
    );

void main() {
  test('only things a person wears reach the fitting room', () {
    expect(isWearableClothing(_deal('Slim fit denim jeans')), isTrue);
    expect(isWearableClothing(_deal('Ladies floral dress')), isTrue);
    // Lives in the clothing aisle, is not clothing.
    expect(isWearableClothing(_deal('Full length dressing mirror')), isFalse);
    expect(isWearableClothing(_deal('Wooden clothes hangers 10 pack')), isFalse);
    expect(isWearableClothing(_deal('Steam iron 2400W')), isFalse);
    expect(isWearableClothing(_deal('Laundry basket')), isFalse);
    expect(isWearableClothing(_deal('Full cream milk 2L')), isFalse);
  });

  test('reads who a garment is for from how retailers name it', () {
    expect(audienceForDeal(_deal('Boys school shirt')), ClothingAudience.kids);
    expect(audienceForDeal(_deal('Ladies blouse')), ClothingAudience.women);
    expect(audienceForDeal(_deal('Mens chino pants')), ClothingAudience.men);
    // Kids wins over the garment's own gender words.
    expect(audienceForDeal(_deal('Girls summer dress')), ClothingAudience.kids);
    expect(audienceForDeal(_deal('Cotton t-shirt')), ClothingAudience.any);
  });

  test('sorts garments into the type a shopper would filter by', () {
    expect(garmentTypeForDeal(_deal('Denim jacket')), GarmentType.outerwear);
    expect(garmentTypeForDeal(_deal('Slim fit jeans')), GarmentType.bottoms);
    expect(garmentTypeForDeal(_deal('Canvas sneakers')), GarmentType.footwear);
    expect(garmentTypeForDeal(_deal('Floral dress')), GarmentType.dresses);
    expect(garmentTypeForDeal(_deal('Cotton t-shirt')), GarmentType.tops);
    expect(garmentTypeForDeal(_deal('Leather belt')), GarmentType.accessories);
  });

  test('only garments the model can dress a body in offer a try-on', () {
    expect(canTryOnDeal(_deal('Cotton t-shirt')), isTrue);
    expect(canTryOnDeal(_deal('Denim jacket')), isTrue);
    expect(canTryOnDeal(_deal('Canvas sneakers')), isFalse);
    expect(canTryOnDeal(_deal('Leather belt')), isFalse);
  });

  test('filters combine store, audience and garment type', () {
    final deals = [
      _deal('Ladies floral dress'),
      _deal('Mens chino pants'),
      _deal('Boys school shirt'),
      _deal('Ladies blouse', retailerId: 'ackermans', retailer: 'Ackermans'),
    ];

    expect(
      filterClothingDeals(deals, audience: ClothingAudience.women)
          .map((deal) => deal.title),
      ['Ladies floral dress', 'Ladies blouse'],
    );
    expect(
      filterClothingDeals(deals, retailerId: 'ackermans')
          .map((deal) => deal.title),
      ['Ladies blouse'],
    );
    expect(
      filterClothingDeals(deals, type: GarmentType.dresses)
          .map((deal) => deal.title),
      ['Ladies floral dress'],
    );
    expect(
      filterClothingDeals(
        deals,
        audience: ClothingAudience.women,
        retailerId: 'mrp',
      ).map((deal) => deal.title),
      ['Ladies floral dress'],
    );
  });
}
