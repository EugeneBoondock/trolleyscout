/// Finds where the shopper actually stands in a fitting-room render.
///
/// The turntable treats the body as a cylinder, and a cylinder drawn in the
/// wrong place warps the wall instead of the person. Try-on models return the
/// shopper on a plain studio backdrop, so the body can be found the cheap way:
/// the backdrop colour is whatever the border pixels agree on, and any column
/// with enough pixels that disagree is body.
library;

import 'dart:math' as math;
import 'dart:typed_data';

import 'turntable.dart';

/// The measured band, both values in 0..1 of the image width.
class BodyBand {
  const BodyBand({required this.centre, required this.halfWidth});

  final double centre;
  final double halfWidth;

  /// The assumption the shader falls back on when nothing can be measured:
  /// a shopper standing in the middle of their own photo.
  static const BodyBand fallback = BodyBand(
    centre: turntableBodyCentre,
    halfWidth: turntableBodyHalfWidth,
  );
}

// How different a pixel must be from the backdrop, per channel sum, before it
// counts as body. Studio backdrops are flat but JPEG compression speckles
// them, so zero is too strict.
const int _channelDifferenceThreshold = 90;
// A column is body once this share of its sampled rows disagree with the
// backdrop. Filters out shadows and vignettes at the frame's edge.
const double _columnCoverageThreshold = 0.06;
// Sampling stride targets: enough columns to place the band within a couple
// of percent, few enough that a full-size render costs nothing to scan.
const int _sampledColumns = 64;
const int _sampledRows = 48;
// The measured band gets a whisker of margin so sleeves and elbows sit inside
// the cylinder rather than clipping at its rim.
const double _bandPadding = 1.12;

/// Measures the body band in raw RGBA bytes.
///
/// Returns [BodyBand.fallback] when the photo is too small to sample or no
/// band can be told apart from the backdrop — a busy background degrades to
/// exactly the behaviour the app shipped with, never to something worse.
BodyBand estimateBodyBand(Uint8List rgba, int width, int height) {
  if (width < 8 || height < 8 || rgba.length < width * height * 4) {
    return BodyBand.fallback;
  }

  final backdrop = _borderColour(rgba, width, height);
  final columnStep = math.max(1, width ~/ _sampledColumns);
  final rowStep = math.max(1, height ~/ _sampledRows);

  var first = -1;
  var last = -1;
  for (var x = 0; x < width; x += columnStep) {
    var hits = 0;
    var samples = 0;
    for (var y = 0; y < height; y += rowStep) {
      samples += 1;
      if (_differs(rgba, (y * width + x) * 4, backdrop)) hits += 1;
    }
    if (samples == 0 || hits / samples < _columnCoverageThreshold) continue;
    if (first < 0) first = x;
    last = x;
  }

  if (first < 0 || last <= first) return BodyBand.fallback;

  final centre = (first + last) / 2 / width;
  final halfWidth =
      ((last - first) / 2 / width * _bandPadding).clamp(0.02, 0.5).toDouble();
  return BodyBand(centre: centre, halfWidth: halfWidth);
}

/// The backdrop colour: an average of pixels along all four borders. A person
/// rarely touches every edge of their own photo, so the border is backdrop
/// even when a foot or a hand crosses one side of it.
List<int> _borderColour(Uint8List rgba, int width, int height) {
  var r = 0, g = 0, b = 0, count = 0;
  void sample(int x, int y) {
    final i = (y * width + x) * 4;
    r += rgba[i];
    g += rgba[i + 1];
    b += rgba[i + 2];
    count += 1;
  }

  final columnStep = math.max(1, width ~/ _sampledColumns);
  final rowStep = math.max(1, height ~/ _sampledRows);
  for (var x = 0; x < width; x += columnStep) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (var y = 0; y < height; y += rowStep) {
    sample(0, y);
    sample(width - 1, y);
  }
  if (count == 0) return const [255, 255, 255];
  return [r ~/ count, g ~/ count, b ~/ count];
}

bool _differs(Uint8List rgba, int index, List<int> backdrop) {
  final difference = (rgba[index] - backdrop[0]).abs() +
      (rgba[index + 1] - backdrop[1]).abs() +
      (rgba[index + 2] - backdrop[2]).abs();
  return difference > _channelDifferenceThreshold;
}
