import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';

void main() {
  test('parses a retailer review payload', () {
    final info = ProductReviewInfo.fromJson({
      'available': true,
      'rating': 4.6,
      'reviewCount': 42,
      'reviews': [
        {
          'author': 'Thandi',
          'body': 'Boils fast, feels solid.',
          'date': '2026-07-01',
          'rating': 5,
          'title': 'Great kettle',
        },
      ],
    });

    expect(info.available, isTrue);
    expect(info.rating, 4.6);
    expect(info.reviewCount, 42);
    expect(info.reviews.single.author, 'Thandi');
    expect(info.reviews.single.rating, 5);
  });

  test('an unavailable payload stays quiet and safe', () {
    final info = ProductReviewInfo.fromJson({'available': false});
    expect(info.available, isFalse);
    expect(info.rating, isNull);
    expect(info.reviews, isEmpty);
  });
}
