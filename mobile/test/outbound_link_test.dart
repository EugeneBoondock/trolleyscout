import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/outbound_link.dart';

void main() {
  test('tags a shop link so the shop can see where the visit came from', () {
    expect(
      withReferralSource('https://oger.nl/products/oger-shirt-271729'),
      'https://oger.nl/products/oger-shirt-271729?utm_source=$kReferralSource',
    );
  });

  test('keeps a link that already carries its own query', () {
    final tagged = withReferralSource('https://www.takealot.com/x/PLID1?sku=9')!;

    expect(tagged, contains('sku=9'));
    expect(tagged, contains('utm_source=$kReferralSource'));
  });

  // A retailer's own campaign tag is how they measure spend they paid for.
  // Overwriting it would quietly take the credit for somebody else's visit.
  test('leaves a retailer own campaign tag alone', () {
    const paid = 'https://oger.nl/products/shirt?utm_source=google';

    expect(withReferralSource(paid), paid);
  });

  test('does not credit us with sending ourselves traffic', () {
    const own = 'https://trolleyscout.co.za/deals';

    expect(withReferralSource(own), own);
  });

  // The tag is a courtesy; the shopper reaching the shop is the point.
  test('hands back anything it cannot tag rather than breaking the link', () {
    expect(withReferralSource('mailto:help@oger.nl'), 'mailto:help@oger.nl');
    expect(withReferralSource('/products/local-path'), '/products/local-path');
    expect(withReferralSource(''), isNull);
    expect(withReferralSource(null), isNull);
  });
}
