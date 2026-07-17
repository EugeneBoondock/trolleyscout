# Animated Scout Mark Design

## Objective

Give the compass needle in the Trolley Scout mark a clear “searching” motion in website and Flutter navigation, then reuse the same mark as the page and content loading indicator.

## Approved Motion

- Navigation uses a gentle left and right sweep with a brief visual pause.
- Loading uses a continuous clockwise rotation.
- The trolley, compass ring, cardinal arrows, favicon, and installed app icons stay still.
- Website and Flutter use the same needle shape, pivot, colours, and timing.

## Rendering

The existing PNG remains the base artwork. A cream circle covers the static needle inside the compass face. A vector red and yellow needle plus black hub is drawn above that cover and rotated around the compass pivot. This keeps the installed brand artwork unchanged and avoids several raster frames.

## Website

- Add a `ScoutMark` React component with `scout`, `spin`, and `static` motion modes.
- Use `scout` in the public, account, and member headers.
- Use `spin` in `LoadingStrip`.
- CSS keyframes control motion. `prefers-reduced-motion: reduce` stops the needle.

## Flutter

- Add an `AnimatedScoutMark` widget with matching motion modes.
- Use `scout` in the main app bar.
- Use `spin` in shared page loading and the deal and nearby-store loading states.
- `MediaQuery.disableAnimations` stops the controller and renders a static needle.

## Tests

- React tests assert each motion mode produces the correct class and loading markup.
- Flutter widget tests assert the app bar uses scouting motion, loaders use spinning motion, and reduced motion holds the transform still.
- Existing website and Flutter suites, analysis, and production builds must remain green.
