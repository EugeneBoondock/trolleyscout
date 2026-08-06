#version 460 core
#include <flutter/runtime_effect.glsl>

// Turns a flat fitting-room photo as though the shopper were on a turntable.
//
// A real rotation needs geometry nobody has: one photo cannot show a back.
// What it CAN do is exploit the one thing every standing body has in common —
// it is roughly a cylinder. The middle of a torso is nearer the camera than
// its edges, so turning it shifts the middle across the frame further than the
// edges. Sampling with exactly that displacement reads as a body turning, and
// it costs one texture lookup rather than a model call.
//
// Honest about its range: this is a believable +/- 20 degrees, not a way to
// see someone's back. Past that the wrap becomes visible, so the Dart side
// clamps the angle rather than letting it smear.

uniform vec2 uSize;
// -1 turns left, +1 turns right, 0 is the photo as taken.
uniform float uAngle;
// Where the body sits in the frame, and how wide it is, both 0..1. Defaults
// suit a full-body photo taken at arm's length.
uniform float uCenter;
uniform float uHalfWidth;
uniform sampler2D uImage;

out vec4 fragColor;

void main() {
  vec2 uv = FlutterFragCoord().xy / uSize;

  // How far across the body this pixel is, -1 at one edge, +1 at the other.
  float acrossBody = (uv.x - uCenter) / max(uHalfWidth, 0.001);

  // Cylindrical depth: 1 at the centre line, falling to 0 at the sides, and
  // flat zero for the background either side of the body so the room behind
  // the shopper stays still while they turn.
  float inBody = step(abs(acrossBody), 1.0);
  float depth = sqrt(max(0.0, 1.0 - acrossBody * acrossBody)) * inBody;

  // The turn itself. Nearer pixels travel further, which is the whole effect.
  float shift = uAngle * 0.13 * depth;

  // A body turning also narrows slightly, and its far edge rises a touch.
  float squeeze = 1.0 - abs(uAngle) * 0.04 * depth;
  vec2 sampled = vec2(
    uCenter + (uv.x - uCenter - shift) / max(squeeze, 0.001),
    uv.y - uAngle * 0.008 * depth * acrossBody
  );

  // Outside the frame there is nothing to sample; showing the edge pixel
  // stretched is less distracting than a black band.
  sampled = clamp(sampled, vec2(0.0), vec2(1.0));

  fragColor = texture(uImage, sampled);
}
