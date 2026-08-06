/// The maths behind the fitting-room turntable.
///
/// Kept apart from the widget so the behaviour that matters — how far a drag
/// turns the body, and where each pixel looks up its colour — can be tested
/// without a GPU.
library;

import 'dart:math' as math;

/// How far the turn is allowed to go, in radians, in each direction.
///
/// About twenty-eight degrees. The effect treats the body as a cylinder and
/// slides the photo around it; well past this the mirrored wrap on the far
/// edge becomes obvious and it stops reading as a person turning.
const double maxTurntableAngle = 0.5;

/// Screen distance, as a fraction of the view's width, for a full turn.
const double turntableDragSpan = 0.55;

/// Turns a horizontal drag into an angle in [-maxTurntableAngle, +].
double turntableAngleFromDrag({
  required double startAngle,
  required double dragPixels,
  required double viewWidth,
}) {
  if (viewWidth <= 0) return startAngle;
  final delta =
      dragPixels / (viewWidth * turntableDragSpan) * maxTurntableAngle;
  return clampTurntableAngle(startAngle + delta);
}

double clampTurntableAngle(double angle) {
  if (angle.isNaN) return 0;
  return angle.clamp(-maxTurntableAngle, maxTurntableAngle).toDouble();
}

/// Fallbacks for when the body cannot be measured in the photo.
///
/// A shopper photographing themselves stands in the middle of the frame, so
/// the default is the middle. Real fits get their band measured from the
/// rendered pixels instead — see body_bounds.dart.
const double turntableBodyCentre = 0.5;
const double turntableBodyHalfWidth = 0.30;

/// Where a screen pixel samples the photo from once the body has turned.
///
/// This is the whole trick, and why it no longer squashes. The old effect
/// pushed pixels sideways, which moved the silhouette and read as a smear.
/// This one holds the silhouette still and slides the picture around the
/// cylinder instead: a pixel sitting at cylinder angle φ shows whatever was
/// at angle φ + turn before the turn. Texture bunches on the edge coming
/// toward the eye and spreads on the edge leaving it — exactly what a real
/// turning body does. Past the rim, sin() folds back on itself, so the far
/// edge mirrors away naturally, like a shoulder wrapping out of view.
double turntableSourceX(
  double x,
  double angle, {
  double centre = turntableBodyCentre,
  double halfWidth = turntableBodyHalfWidth,
}) {
  final safeHalfWidth = math.max(halfWidth, 0.001);
  final across = (x - centre) / safeHalfWidth;
  // The room behind the shopper has no depth; it does not turn.
  if (across.abs() >= 1) return x;
  final phi = math.asin(across.clamp(-1.0, 1.0));
  return centre + safeHalfWidth * math.sin(phi + angle);
}

/// How much brighter or darker a pixel gets as its patch of body rotates
/// toward or away from the light. Subtle on purpose: the photo's own shading
/// stays the star, this just stops the turn from looking like a flat slide.
double turntableShadeAt(
  double x,
  double angle, {
  double centre = turntableBodyCentre,
  double halfWidth = turntableBodyHalfWidth,
}) {
  final safeHalfWidth = math.max(halfWidth, 0.001);
  final across = (x - centre) / safeHalfWidth;
  if (across.abs() >= 1) return 1;
  final phi = math.asin(across.clamp(-1.0, 1.0));
  final shade = 1.0 + 0.35 * (math.cos(phi + angle) - math.cos(phi));
  return shade.clamp(0.65, 1.08).toDouble();
}
