import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/turntable.dart';

void main() {
  group('the shape of a person', () {
    test('the centre line of the body is nearest the camera', () {
      // The whole illusion rests on this: a torso is roughly a cylinder, so
      // its middle is closer than its sides. Turning it moves the middle
      // further across the frame, which is what the eye reads as rotation.
      expect(turntableDepthAt(0.5), closeTo(1.0, 0.001));
      expect(turntableDepthAt(0.5 + turntableBodyHalfWidth / 2),
          lessThan(turntableDepthAt(0.5)));
      expect(turntableDepthAt(0.5 - turntableBodyHalfWidth / 2),
          closeTo(turntableDepthAt(0.5 + turntableBodyHalfWidth / 2), 0.001));
    });

    test('the room behind the shopper does not turn with them', () {
      // Beyond the body there is no depth, so the background stays put. A
      // wall that swung with the shoulders would give the trick away.
      expect(turntableDepthAt(0.02), 0);
      expect(turntableDepthAt(0.98), 0);
      expect(turntableShiftAt(0.02, 1), 0);
    });

    test('nearer parts of the body travel further when it turns', () {
      final centre = turntableShiftAt(0.5, 1).abs();
      final edge = turntableShiftAt(0.5 + turntableBodyHalfWidth * 0.9, 1).abs();
      expect(centre, greaterThan(edge));
      expect(edge, greaterThan(0));
    });

    test('nothing moves at all when the photo is square on', () {
      expect(turntableShiftAt(0.5, 0), 0);
      expect(turntableShiftAt(0.4, 0), 0);
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
      // Past roughly twenty degrees the edges smear and it reads as a warped
      // picture rather than a person, so the angle is clamped rather than
      // allowed to run.
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
}
