import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/image_transform.dart';

void main() {
  const photo = 'https://cdn.retailer.test/products/jeans-1500.jpg';

  test('serves the shop own image while transforms are off', () {
    // trolleyscout.co.za is a free zone and does not serve /cdn-cgi/image/
    // URLs — every transformed link answered 404 and blanked every product
    // photo in the app. A slightly heavy image beats no image.
    expect(imageTransformsEnabled, isFalse);
    expect(sizedImageUrl(photo), photo);
    expect(sizedImageUrl(photo, width: 160), photo);
  });

  test('the width ladder is still short, for when it can be switched on', () {
    // The free allowance counts UNIQUE transformations, so widths must snap
    // to a handful of rungs rather than whatever a layout asks for.
    expect(snapImageWidth(1), 160);
    expect(snapImageWidth(161), 320);
    expect(snapImageWidth(5000), imageWidthLadder.last);
  });

  test('passes through what is not an absolute web image', () {
    expect(sizedImageUrl(null), isNull);
    expect(sizedImageUrl('  '), isNull);
    expect(sizedImageUrl('/local/asset.png'), '/local/asset.png');
  });

  test('every deal keeps a URL that actually loads', () {
    final deal = Deal.fromJson(const {
      'id': 'd1',
      'title': 'Braaipack 5kg',
      'retailerId': 'pnp',
      'retailerName': 'Pick n Pay',
      'priceText': 'R199.99',
      'imageUrl': photo,
    });

    expect(deal.imageUrl, photo);
  });
}
