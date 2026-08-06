import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/image_transform.dart';

void main() {
  const photo = 'https://cdn.retailer.test/products/jeans-1500.jpg';

  test('fetches a card-sized photo instead of the shop\'s full-size one', () {
    final url = sizedImageUrl(photo);

    expect(url, contains('/cdn-cgi/image/'));
    expect(url, contains('width=640'));
    // Most of the saving on a photo comes from the format, not the pixels.
    expect(url, contains('format=auto'));
    // scale-down means a small source is never upscaled and re-encoded.
    expect(url, contains('fit=scale-down'));
    expect(url, contains(photo));
  });

  test('snaps to a short ladder, because unique widths cost the allowance', () {
    // The free allowance counts UNIQUE transformations, so a hundred
    // arbitrary widths would spend the month on a single screen.
    expect(snapImageWidth(1), 160);
    expect(snapImageWidth(160), 160);
    expect(snapImageWidth(161), 320);
    expect(snapImageWidth(5000), imageWidthLadder.last);
  });

  test('leaves alone what it cannot improve', () {
    const transformed =
        'https://trolleyscout.co.za/cdn-cgi/image/width=320/https://x.test/a.jpg';
    expect(sizedImageUrl(transformed), transformed);

    const svg = 'https://cdn.retailer.test/logo.svg';
    expect(sizedImageUrl(svg), svg);

    // Our own media is already stored at the right size.
    const own = 'https://trolleyscout.co.za/media/catalogue/page-1.jpg';
    expect(sizedImageUrl(own), own);

    expect(sizedImageUrl(null), isNull);
    expect(sizedImageUrl('  '), isNull);
    expect(sizedImageUrl('/local/asset.png'), '/local/asset.png');
  });

  test('every deal arrives already sized, not just the ones we remembered',
      () {
    // Doing this once where the payload is parsed is what makes it true for
    // all three dozen widgets that draw a product photo.
    final deal = Deal.fromJson(const {
      'id': 'd1',
      'title': 'Braaipack 5kg',
      'retailerId': 'pnp',
      'retailerName': 'Pick n Pay',
      'priceText': 'R199.99',
      'imageUrl': photo,
    });

    expect(deal.imageUrl, contains('/cdn-cgi/image/'));
    expect(deal.imageUrl, contains(photo));
  });
}
