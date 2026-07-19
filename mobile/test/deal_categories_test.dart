import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/deal_categories.dart';

void main() {
  group('classifyDeal', () {
    test('keeps pumps, pressure washers, tools, and hardware out of food', () {
      expect(classifyDeal('Water pump 750W', 'pick-n-pay').category,
          DealCategory.diyHardware);
      expect(classifyDeal('High pressure washer 135 bar', 'checkers').category,
          DealCategory.diyHardware);
      expect(classifyDeal('Cordless power tool combo kit', 'shoprite').category,
          DealCategory.diyHardware);
      expect(classifyDeal('General hardware value pack', 'pick-n-pay').category,
          DealCategory.diyHardware);
    });

    test('does not treat unmatched supermarket products as food', () {
      expect(classifyDeal('Camping chair', 'pick-n-pay').category,
          isNot(DealCategory.food));
      expect(classifyDeal('Braai grid', 'checkers').category,
          isNot(DealCategory.food));
      expect(classifyDeal('Pool chlorine', 'shoprite').category,
          isNot(DealCategory.food));
    });

    test('recognises strong grocery signals and rejects shared non-food words',
        () {
      final water = classifyDeal('Bottled still water 6 x 1.5L', 'unknown');
      expect(water.category, DealCategory.food);
      expect(water.foodSubcategory, FoodSubcategory.beverages);

      for (final title in [
        'Cake wheat flour 2.5kg',
        'Fresh full cream milk 2L',
        'Free range chicken portions',
        'Long grain rice 5kg',
        'Ground coffee 250g',
        'Fresh seasonal fruit selection',
      ]) {
        expect(classifyDeal(title, 'unknown').category, DealCategory.food,
            reason: title);
      }

      expect(classifyDeal('Reusable water bottle 1L', 'pick-n-pay').category,
          DealCategory.homeCookware);
      expect(classifyDeal('Electric coffee grinder', 'shoprite').category,
          DealCategory.homeCookware);
      expect(classifyDeal('Premium motor oil 5L', 'pick-n-pay').category,
          DealCategory.diyHardware);
    });

    test('resolves food-word homonyms from the named product type', () {
      expect(classifyDeal('Water storage tank 1000L', 'pick-n-pay').category,
          DealCategory.diyHardware);
      expect(classifyDeal('Garden water hose 20m', 'checkers').category,
          DealCategory.diyHardware);
      expect(classifyDeal('Kids water gun', 'shoprite').category,
          DealCategory.babyKids);
      expect(classifyDeal('Chocolate body butter 250ml', 'unknown').category,
          DealCategory.healthBeauty);
      expect(classifyDeal('Electric meat grinder', 'unknown').category,
          DealCategory.homeCookware);
      expect(classifyDeal('Ceramic fruit bowl set', 'unknown').category,
          DealCategory.homeCookware);
      expect(classifyDeal('Modern egg chair', 'unknown').category,
          DealCategory.homeCookware);
      expect(classifyDeal('Stainless steel bread knife', 'unknown').category,
          DealCategory.homeCookware);
      expect(classifyDeal('Wooden cheese board', 'unknown').category,
          DealCategory.homeCookware);
      expect(classifyDeal('Manual vegetable chopper', 'unknown').category,
          DealCategory.homeCookware);
      expect(
          classifyDeal('Airtight rice storage container', 'unknown').category,
          DealCategory.homeCookware);
      expect(classifyDeal('Automatic chicken feeder', 'unknown').category,
          DealCategory.pets);
    });
  });
}
