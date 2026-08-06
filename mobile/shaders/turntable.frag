#version 460 core
#include <flutter/runtime_effect.glsl>

// Turns a flat fitting-room photo as though the shopper were on a turntable.
//
// A real rotation needs geometry nobody has: one photo cannot show a back.
// What it CAN do is exploit the one thing every standing body has in common —
// it is roughly a cylinder. The earlier version pushed pixels sideways by a
// fake depth, which moved the silhouette and squashed the person. This one
// does what rotating-product viewers do instead: the silhouette holds still
// and the PICTURE slides around the cylinder. A pixel at cylinder angle phi
// shows whatever sat at phi + turn before the turn. Texture bunches on the
// edge coming toward the eye, spreads on the edge leaving it, and past the
// rim sin() folds back so the far edge mirrors away like a shoulder wrapping
// out of view.
//
// Honest about its range: believable to roughly +/- 28 degrees, not a way to
// see someone's back. The Dart side clamps the angle rather than letting the
// wrap smear. The body band (uCenter, uHalfWidth) is measured from the photo
// itself — see body_bounds.dart — so the cylinder sits on the person, not on
// an assumption about where they stood.

uniform vec2 uSize;
// Radians. Negative turns left, positive right, 0 is the photo as taken.
uniform float uAngle;
// Where the body sits in the frame, and how wide it is, both 0..1.
uniform float uCenter;
uniform float uHalfWidth;
uniform sampler2D uImage;

out vec4 fragColor;

void main() {
  vec2 uv = FlutterFragCoord().xy / uSize;

  float halfWidth = max(uHalfWidth, 0.001);
  // How far across the body this pixel is, -1 at one edge, +1 at the other.
  float across = (uv.x - uCenter) / halfWidth;

  // The room behind the shopper has no depth, so it does not turn.
  if (abs(across) >= 1.0) {
    fragColor = texture(uImage, uv);
    return;
  }

  float phi = asin(clamp(across, -1.0, 1.0));
  float psi = phi + uAngle;
  vec2 sampled = vec2(uCenter + halfWidth * sin(psi), uv.y);

  // A patch of body rotating away from the light darkens a touch, one coming
  // round brightens. Kept faint: the photo's own shading stays the star, this
  // just stops the turn from reading as a flat slide.
  float shade = clamp(1.0 + 0.35 * (cos(psi) - cos(phi)), 0.65, 1.08);

  vec4 colour = texture(uImage, clamp(sampled, vec2(0.0), vec2(1.0)));
  fragColor = vec4(colour.rgb * shade, colour.a);
}
