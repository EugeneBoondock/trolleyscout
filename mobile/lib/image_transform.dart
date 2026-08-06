/// Serves retailer product photos at the size the app actually draws them.
///
/// Shops publish product images at whatever size suits their own site — often
/// 1500px and a few hundred kilobytes for a card rendered 160px wide. On
/// prepaid data that is real money spent on pixels nobody sees, which is
/// exactly the kind of cost this app exists to cut.
///
/// Cloudflare resizes at the edge and caches the result. The free allowance
/// counts UNIQUE transformations, so widths snap to a short ladder: a hundred
/// arbitrary widths would spend the month's allowance rendering one screen.
///
/// Mirrors src/services/imageTransform.ts, and the two are kept in step by
/// tests on both sides.
library;

const String _transformOrigin = 'https://trolleyscout.co.za';

/// Whether the zone will actually serve /cdn-cgi/image/ URLs.
///
/// It will not: trolleyscout.co.za is a free zone, and zone image
/// transformations are not available on it — every transformed URL answers
/// 404, which blanked every product photo and catalogue cover in the app.
///
/// The cost this was meant to save is real, so the machinery stays and this
/// flag is the one line to flip if transformations are ever enabled. Until
/// then the shop's own URL is served untouched, because a slightly heavy
/// image beats no image.
const bool imageTransformsEnabled = false;

/// The only widths asked for, so unique transformations stay proportional to
/// the number of images rather than the number of screen sizes.
const List<int> imageWidthLadder = [160, 320, 640, 960];

/// What a card-sized product photo is fetched at. Sharp on a phone, a
/// fraction of the bytes of the original.
const int defaultCardImageWidth = 640;

/// Returns a resized URL, or the original when resizing would be wrong.
String? sizedImageUrl(String? source, {int width = defaultCardImageWidth}) {
  final url = (source ?? '').trim();
  if (url.isEmpty) return null;
  if (!imageTransformsEnabled) return url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return url;
  // Already transformed, already ours, or vector art that resizing can only
  // break.
  if (url.contains('/cdn-cgi/image/')) return url;
  if (url.startsWith(_transformOrigin)) return url;
  if (RegExp(r'\.svg($|\?)', caseSensitive: false).hasMatch(url)) return url;

  final rung = snapImageWidth(width);
  // format=auto serves WebP or AVIF where the phone supports it, which is
  // most of the saving on a photo. scale-down never upscales a small source.
  return '$_transformOrigin/cdn-cgi/image/'
      'width=$rung,quality=80,format=auto,fit=scale-down/$url';
}

/// Rounds up to the next rung on the ladder.
int snapImageWidth(int width) {
  if (width <= 0) return imageWidthLadder.first;
  for (final rung in imageWidthLadder) {
    if (width <= rung) return rung;
  }
  return imageWidthLadder.last;
}
