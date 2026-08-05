import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/assisted_store_cart.dart';

void main() {
  test('checkout lands on /cart for the common storefronts', () {
    expect(
      checkoutUriFor(Uri.parse('https://www.checkers.co.za/p/oats-1kg'))
          .toString(),
      'https://www.checkers.co.za/cart',
    );
    expect(
      checkoutUriFor(Uri.parse('https://www.takealot.com/some-product/PLID123'))
          .toString(),
      'https://www.takealot.com/cart',
    );
  });

  test('platform exceptions use their own checkout paths', () {
    expect(
      checkoutUriFor(Uri.parse('https://www.dischem.co.za/some-product'))
          .toString(),
      'https://www.dischem.co.za/checkout/cart',
    );
    expect(
      checkoutUriFor(
              Uri.parse('https://www.woolworths.co.za/prod/food/A-123'))
          .toString(),
      'https://www.woolworths.co.za/check-out',
    );
  });

  test('query strings and fragments never survive into checkout', () {
    expect(
      checkoutUriFor(Uri.parse('https://shop.test/product?x=1#frag')).toString(),
      'https://shop.test/cart',
    );
  });
}
