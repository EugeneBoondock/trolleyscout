/// The maths behind the fitting-room turntable.
///
/// Kept apart from the widget so the behaviour that matters — how far a drag
/// turns the body, and where the illusion stops being believable — can be
/// tested without a GPU.
library;

import 'dart:math' as math;

/// How far the turn is allowed to go, in each direction.
///
/// The effect is a cylinder approximation of a body: past about twenty degrees
/// the edge of the photo starts to smear and it reads as a warped picture
/// rather than a person turning. Stopping short of that is the difference
/// between a feature and a bug report.
const double maxTurntableAngle = 1.0;

/// Screen distance, as a fraction of the view's width, for a full turn.
const double turntableDragSpan = 0.55;

/// Turns a horizontal drag into an angle in [-1, 1].
double turntableAngleFromDrag({
  required double startAngle,
  required double dragPixels,
  required double viewWidth,
}) {
  if (viewWidth <= 0) return startAngle;
  final delta = dragPixels / (viewWidth * turntableDragSpan);
  return clampTurntableAngle(startAngle + delta);
}

double clampTurntableAngle(double angle) {
  if (angle.isNaN) return 0;
  return angle.clamp(-maxTurntableAngle, maxTurntableAngle).toDouble();
}

/// Where the body is assumed to sit in a full-body photo.
///
/// A shopper photographing themselves stands in the middle of the frame, so
/// the default is the middle. Anything else would need a segmentation model,
/// which is exactly the cost this approach exists to avoid.
const double turntableBodyCentre = 0.5;
const double turntableBodyHalfWidth = 0.30;

/// The cylindrical depth at a point across the frame: 1 down the centre line
/// of the body, 0 at its edges and beyond.
///
/// This is the whole trick. A torso is roughly a cylinder, so its middle is
/// nearer the camera than its sides; turning it moves the middle further
/// across the frame than the sides, which is what the eye reads as rotation.
double turntableDepthAt(
  double x, {
  double centre = turntableBodyCentre,
  double halfWidth = turntableBodyHalfWidth,
}) {
  final across = (x - centre) / math.max(halfWidth, 0.001);
  if (across.abs() > 1) return 0;
  return math.sqrt(math.max(0, 1 - across * across));
}

/// How far a point moves when the body turns. Used by the tests to prove the
/// shader's intent: the nose travels, the shoulders barely do, the wall
/// behind does not move at all.
double turntableShiftAt(double x, double angle) =>
    angle * 0.13 * turntableDepthAt(x);
