import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/body_bounds.dart';
import 'package:trolley_scout/turntable.dart';

void main() {
  group('the turn holds the shopper\'s shape', () {
    test('the silhouette does not move when the body turns', () {
      // The old effect pushed pixels sideways, which moved the outline and
      // squashed the person. The fix: every screen pixel inside the body
      // still samples from inside the body, so the outline cannot travel.
      for (final x in [0.2, 0.35, 0.5, 0.65, 0.8]) {
        final source = turntableSourceX(x, maxTurntableAngle);
        expect(source, greaterThanOrEqualTo(0.5 - turntableBodyHalfWidth));
        expect(source, lessThanOrEqualTo(0.5 + turntableBodyHalfWidth));
      }
    });

    test('the room behind the shopper does not turn with them', () {
      expect(turntableSourceX(0.02, 1), 0.02);
      expect(turntableSourceX(0.98, -1), 0.98);
    });

    test('the picture slides across the body rather than shifting it', () {
      // Turning right means the centre of the body now shows what used to be
      // slightly to the side — the texture travels, the cylinder does not.
      final centre = turntableSourceX(0.5, 0.4);
      expect(centre, greaterThan(0.5));
      expect(turntableSourceX(0.5, -0.4), lessThan(0.5));
    });

    test('nothing moves at all when the photo is square on', () {
      expect(turntableSourceX(0.5, 0), 0.5);
      expect(turntableSourceX(0.4, 0), closeTo(0.4, 1e-9));
    });

    test('the far edge wraps out of view instead of stretching', () {
      // Past the rim, sin() folds back: the trailing edge shows mirrored
      // nearby texture, the way a shoulder disappears around a real turn.
      const rim = 0.5 + turntableBodyHalfWidth * 0.999;
      final nearRim = turntableSourceX(rim, 0.4);
      expect(nearRim, lessThan(0.5 + turntableBodyHalfWidth));
    });

    test('the side turning away darkens, the side coming round brightens', () {
      final receding = turntableShadeAt(0.5 + turntableBodyHalfWidth / 2, 0.4);
      final advancing = turntableShadeAt(0.5 - turntableBodyHalfWidth / 2, 0.4);
      expect(receding, lessThan(1));
      expect(advancing, greaterThan(1));
      expect(turntableShadeAt(0.02, 0.4), 1);
    });
  });

  group('turning by dragging', () {
    test('a drag across the view turns the body', () {
      final angle = turntableAngleFromDrag(
        startAngle: 0,
        dragPixels: 100,
        viewWidth: 400,
      );
      expect(angle, greaterThan(0));
      expect(angle, lessThanOrEqualTo(maxTurntableAngle));
    });

    test('dragging the other way turns the other way', () {
      expect(
        turntableAngleFromDrag(
            startAngle: 0, dragPixels: -100, viewWidth: 400),
        lessThan(0),
      );
    });

    test('a long drag stops where the illusion stops being believable', () {
      expect(
        turntableAngleFromDrag(
            startAngle: 0, dragPixels: 100000, viewWidth: 400),
        maxTurntableAngle,
      );
      expect(
        turntableAngleFromDrag(
            startAngle: 0, dragPixels: -100000, viewWidth: 400),
        -maxTurntableAngle,
      );
    });

    test('a drag continues from where the last one left off', () {
      final first =
          turntableAngleFromDrag(startAngle: 0, dragPixels: 40, viewWidth: 400);
      final second = turntableAngleFromDrag(
          startAngle: first, dragPixels: 40, viewWidth: 400);
      expect(second, greaterThan(first));
    });

    test('a view with no width cannot turn, and does not divide by zero', () {
      expect(
        turntableAngleFromDrag(startAngle: 0.3, dragPixels: 50, viewWidth: 0),
        0.3,
      );
    });

    test('a nonsense angle settles square rather than propagating', () {
      expect(clampTurntableAngle(double.nan), 0);
    });
  });

  group('finding the shopper in the photo', () {
    // A tiny studio scene: white backdrop, a dark figure filling a known band
    // of columns. Colours are flat because the estimator must key off the
    // border, not off any particular skin or garment tone.
    Uint8List scene({
      required int width,
      required int height,
      required int bodyFrom,
      required int bodyTo,
    }) {
      final bytes = Uint8List(width * height * 4);
      for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
          final i = (y * width + x) * 4;
          final isBody =
              x >= bodyFrom && x <= bodyTo && y > height ~/ 8 && y < height - 2;
          final value = isBody ? 60 : 245;
          bytes[i] = value;
          bytes[i + 1] = value;
          bytes[i + 2] = value;
          bytes[i + 3] = 255;
        }
      }
      return bytes;
    }

    test('a centred shopper gets a centred band', () {
      final band = estimateBodyBand(
        scene(width: 128, height: 96, bodyFrom: 48, bodyTo: 80),
        128,
        96,
      );
      expect(band.centre, closeTo(0.5, 0.05));
      expect(band.halfWidth, closeTo(0.14, 0.05));
    });

    test('a shopper standing off to one side is found there', () {
      final band = estimateBodyBand(
        scene(width: 128, height: 96, bodyFrom: 12, bodyTo: 44),
        128,
        96,
      );
      expect(band.centre, closeTo(0.22, 0.06));
    });

    test('a photo with no visible person falls back to the centred band', () {
      final band = estimateBodyBand(
        scene(width: 128, height: 96, bodyFrom: 200, bodyTo: 210),
        128,
        96,
      );
      expect(band.centre, BodyBand.fallback.centre);
      expect(band.halfWidth, BodyBand.fallback.halfWidth);
    });

    test('a photo too small to measure falls back rather than guessing', () {
      final band = estimateBodyBand(Uint8List(16), 2, 2);
      expect(band.centre, BodyBand.fallback.centre);
    });
  });
}
