# Animated Scout Mark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Animate the compass needle in website and Flutter navigation and reuse it as the branded loading indicator.

**Architecture:** Keep the current PNG as the static base. Each target draws a cream compass-face cover and vector needle above it, then rotates only the needle with either a searching sweep or continuous loading rotation.

**Tech Stack:** React 19, TypeScript, CSS keyframes, Vitest, Flutter, Dart animation controllers, Flutter widget tests.

## Global Constraints

- Navigation motion is a gentle left and right sweep.
- Loading motion is a continuous clockwise rotation.
- Installed icons and favicons remain static.
- Reduced-motion settings stop all needle animation.
- Existing light and dark themes remain readable.

---

### Task 1: Website scout mark

**Files:**
- Create: `src/components/ScoutMark.tsx`
- Create: `src/components/ScoutMark.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `ScoutMark({ motion, size, className })` with motion type `'scout' | 'spin' | 'static'`.

- [ ] **Step 1: Write the failing component tests**

```tsx
render(<ScoutMark motion="scout" />)
expect(screen.getByTestId('scout-mark')).toHaveClass('is-scouting')
render(<ScoutMark motion="spin" />)
expect(screen.getByTestId('scout-mark')).toHaveClass('is-spinning')
```

- [ ] **Step 2: Run the focused test and verify the missing component failure**

Run: `npm test -- --run src/components/ScoutMark.test.tsx`

Expected: FAIL because `ScoutMark.tsx` does not exist.

- [ ] **Step 3: Implement the base image, cover circle, vector needle, and motion classes**

```tsx
export type ScoutMotion = 'scout' | 'spin' | 'static'

export function ScoutMark({ motion = 'static', size = 38 }: ScoutMarkProps) {
  return <span className={clsx('scout-mark', `is-${motion}`)}>{/* image and vector overlay */}</span>
}
```

- [ ] **Step 4: Add sweep, spin, and reduced-motion CSS**

```css
.scout-mark.is-scout .scout-mark-needle { animation: scout-sweep 3.2s ease-in-out infinite; }
.scout-mark.is-spin .scout-mark-needle { animation: scout-spin 0.9s linear infinite; }
@media (prefers-reduced-motion: reduce) { .scout-mark-needle { animation: none !important; } }
```

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- --run src/components/ScoutMark.test.tsx`

Expected: PASS.

### Task 2: Website header and loading use

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/ScoutMark.test.tsx`

**Interfaces:**
- Consumes: `ScoutMark` from Task 1.
- Produces: animated header marks and loading strips.

- [ ] **Step 1: Add failing assertions for header and loader modes**

```tsx
expect(renderToStaticMarkup(<ScoutMark motion="scout" />)).toContain('is-scouting')
expect(renderToStaticMarkup(<ScoutMark motion="spin" />)).toContain('is-spinning')
```

- [ ] **Step 2: Verify the new use-site assertions fail**

Run: `npm test -- --run src/components/ScoutMark.test.tsx`

Expected: FAIL until header and loading markup use the component.

- [ ] **Step 3: Replace the three header images and loading-strip square**

```tsx
<ScoutMark motion="scout" />
<ScoutMark motion="spin" size={28} />
```

- [ ] **Step 4: Run the focused and full website tests**

Run: `npm test -- --run src/components/ScoutMark.test.tsx`

Expected: PASS.

### Task 3: Flutter animated mark

**Files:**
- Create: `mobile/lib/widgets/scout_mark.dart`
- Create: `mobile/test/scout_mark_test.dart`

**Interfaces:**
- Produces: `ScoutMarkMotion` and `AnimatedScoutMark({ motion, size })`.

- [ ] **Step 1: Write failing widget tests**

```dart
await tester.pumpWidget(const MaterialApp(home: AnimatedScoutMark(motion: ScoutMarkMotion.scout)));
expect(find.byKey(const ValueKey('scout-mark-needle')), findsOneWidget);
```

- [ ] **Step 2: Run the test and verify the missing widget failure**

Run: `flutter test test/scout_mark_test.dart`

Expected: FAIL because the widget does not exist.

- [ ] **Step 3: Implement the base image, painters, controller, and reduced-motion handling**

```dart
enum ScoutMarkMotion { static, scout, spin }

class AnimatedScoutMark extends StatefulWidget {
  const AnimatedScoutMark({super.key, this.motion = ScoutMarkMotion.static, this.size = 38});
  final ScoutMarkMotion motion;
  final double size;
}
```

- [ ] **Step 4: Run the focused widget tests**

Run: `flutter test test/scout_mark_test.dart`

Expected: PASS.

### Task 4: Flutter app bar and loader use

**Files:**
- Modify: `mobile/lib/main.dart`
- Modify: `mobile/lib/widgets/common.dart`
- Modify: `mobile/lib/screens/deals_screen.dart`
- Modify: `mobile/lib/screens/near_me_screen.dart`
- Modify: `mobile/test/widget_test.dart`
- Modify: `mobile/test/scout_mark_test.dart`

**Interfaces:**
- Consumes: `AnimatedScoutMark` from Task 3.
- Produces: scouting navigation and spinning content loaders.

- [ ] **Step 1: Add failing use-site tests**

```dart
expect(find.byKey(const ValueKey('navbar-scout-mark')), findsOneWidget);
expect(find.byKey(const ValueKey('loading-scout-mark')), findsOneWidget);
```

- [ ] **Step 2: Verify the use-site tests fail**

Run: `flutter test test/widget_test.dart test/scout_mark_test.dart`

Expected: FAIL until the app bar and loaders use the animated mark.

- [ ] **Step 3: Replace the app-bar image and page progress indicators**

```dart
const AnimatedScoutMark(key: ValueKey('navbar-scout-mark'), motion: ScoutMarkMotion.scout, size: 36)
const AnimatedScoutMark(key: ValueKey('loading-scout-mark'), motion: ScoutMarkMotion.spin, size: 48)
```

- [ ] **Step 4: Run focused tests, then all Flutter tests**

Run: `flutter test`

Expected: PASS.

### Task 5: Final checks

**Files:**
- Verify all files above.

- [ ] **Step 1: Format and analyze**

Run: `dart format src mobile/lib mobile/test` where applicable, then `flutter analyze`.

Expected: no Dart analysis issues.

- [ ] **Step 2: Verify website**

Run: `npm run verify`

Expected: tests, lint, build, and function type checking pass.

- [ ] **Step 3: Verify Flutter builds**

Run: `flutter build apk --debug --no-pub` and `flutter build web --no-pub --no-wasm-dry-run`.

Expected: both builds succeed.
