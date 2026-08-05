import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/assisted_store_cart.dart';
import 'package:trolley_scout/widgets/in_app_browser.dart';

void main() {
  test('the in-app browser accepts only hosted web links', () {
    expect(
        safeInAppBrowserUri('https://example.test/deal')?.host, 'example.test');
    expect(
        safeInAppBrowserUri('http://example.test/deal')?.host, 'example.test');
    expect(safeInAppBrowserUri('javascript:alert(1)'), isNull);
    expect(safeInAppBrowserUri('intent://scan'), isNull);
    expect(safeInAppBrowserUri('/relative'), isNull);
  });

  test('assisted basket items accept only hosted retailer pages', () {
    expect(
      AssistedStoreCartItem.tryCreate(
        title: 'Long grain rice',
        productUrl: 'https://shop.example.test/rice',
        quantity: 2,
      ),
      isNotNull,
    );
    expect(
      AssistedStoreCartItem.tryCreate(
        title: 'Unsafe',
        productUrl: 'javascript:alert(1)',
      ),
      isNull,
    );
  });

  test('assisted basket scripts only target explicit visible basket controls',
      () {
    final addScript = assistedAddOneScript();
    final basketScript = assistedOpenBasketScript();

    expect(addScript, contains('add to cart'));
    expect(addScript, contains('wishlist'));
    expect(addScript, contains('ambiguous'));
    expect(addScript, contains('elementFromPoint'));
    expect(addScript, isNot(contains('buy now')));
    expect(basketScript, contains('basket'));
    expect(basketScript, contains('no-basket-link'));
    expect(addScript, isNot(contains('document.forms')));
  });

  test('assisted controls stay on the retailer site', () {
    expect(
      isSameRetailerSite(
        Uri.parse('https://www.clicks.co.za/cart'),
        Uri.parse('https://clicks.co.za/product/1'),
      ),
      isTrue,
    );
    expect(
      isSameRetailerSite(
        Uri.parse('https://checkout.example.test/cart'),
        Uri.parse('https://shop.example.test/product/1'),
      ),
      isFalse,
    );
  });

  test('assisted basket results are decoded across WebView platforms', () {
    expect(
      parseAssistedStoreCartResult(
          '{"status":"clicked","label":"Add to cart"}'),
      const AssistedStoreCartResult(
        status: AssistedStoreCartStatus.clicked,
        label: 'Add to cart',
      ),
    );
    expect(
      parseAssistedStoreCartResult(
        '"{\\"status\\":\\"ambiguous\\",\\"label\\":\\"Add\\"}"',
      ).status,
      AssistedStoreCartStatus.ambiguous,
    );
  });
}
