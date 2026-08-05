import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/healthy_food.dart';

Deal _deal(String title) => Deal(
      id: title,
      retailerId: 'shoprite',
      retailerName: 'Shoprite',
      sourceLabel: 'Weekly specials',
      title: title,
    );

void main() {
  test('whole-food staples count as healthy picks', () {
    expect(isHealthyFoodDeal(_deal('Sugar Beans 2kg')), isTrue);
    expect(isHealthyFoodDeal(_deal('Lucky Star Pilchards 400g')), isTrue);
    expect(isHealthyFoodDeal(_deal('Jungle Oats 1kg')), isTrue);
    expect(isHealthyFoodDeal(_deal('Butternut per kg')), isTrue);
    expect(isHealthyFoodDeal(_deal('Large Eggs 30s')), isTrue);
    expect(isHealthyFoodDeal(_deal('Amasi 2L')), isTrue);
  });

  test('processed treats and drinks stay out even when cheap', () {
    expect(isHealthyFoodDeal(_deal('Coca-Cola 2L')), isFalse);
    expect(isHealthyFoodDeal(_deal('Chocolate digestive biscuits')), isFalse);
    expect(isHealthyFoodDeal(_deal('Simba Chips 120g')), isFalse);
    expect(isHealthyFoodDeal(_deal('Vanilla Ice Cream 2L')), isFalse);
  });

  test('healthy words on non-food or alcohol never qualify', () {
    expect(isHealthyFoodDeal(_deal('Apple iPhone 15 128GB')), isFalse);
    expect(isHealthyFoodDeal(_deal('Savanna Dry Cider 6-pack')), isFalse);
  });

  test('a chocolate-coated healthy word is still a treat', () {
    expect(isHealthyFoodDeal(_deal('Chocolate coated oats bar')), isFalse);
  });

  test('every calendar day resolves to a fact with a usable tip', () {
    for (var offset = 0; offset < healthyFoodFacts.length + 2; offset++) {
      final fact =
          healthyFactForDay(DateTime.utc(2026, 8, 1).add(Duration(days: offset)));
      expect(fact.fact, isNotEmpty);
      expect(fact.tip, isNotEmpty);
    }
  });
}
