# Flutter Full Parity and Brand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every website feature to Flutter and install one new Trolley Scout logo across all supported platforms.

**Architecture:** Keep one stateful app shell as the owner of session, navigation, and theme state. Move HTTP and JSON concerns into focused API model and transport files, then build small screens around typed methods and shared paper-style widgets.

**Tech Stack:** Flutter, Dart, Material 3, `http`, `shared_preferences`, `url_launcher`, Flutter widget tests, GPT Image built-in generation.

## Global Constraints

- Include public, member, and admin website areas.
- Keep admin navigation role-gated.
- Support light and dark themes with readable contrast.
- Never write the supplied OpenAI API key to the repository.
- Use the generated logo for web, Android, iOS, and Flutter web.
- Use smart punctuation in visible copy and no em dashes.

---

### Task 1: Session transport and typed API

**Files:**
- Create: `mobile/lib/api_models.dart`
- Create: `mobile/lib/session_cookie_store.dart`
- Create: `mobile/lib/platform_http_client.dart`
- Create: `mobile/lib/platform_http_client_io.dart`
- Create: `mobile/lib/platform_http_client_web.dart`
- Modify: `mobile/lib/api.dart`
- Test: `mobile/test/api_test.dart`

**Interfaces:**
- Produces: `Api`, `SessionCookieStore`, `MemorySessionCookieStore`, `MemberSession`, and typed resource models.

- [ ] Write API tests using a recording `http.Client` and in-memory cookie store. Assert `Set-Cookie` is saved, later requests send `Cookie`, sign-out clears it, API issues are surfaced, and key payloads parse.
- [ ] Run `flutter test test/api_test.dart` and confirm failures reference missing session methods and types.
- [ ] Add platform clients, cookie storage, request helpers, typed methods, and JSON models.
- [ ] Run `flutter test test/api_test.dart` and confirm all API tests pass.

### Task 2: Authentication, app state, and navigation

**Files:**
- Create: `mobile/lib/app_controller.dart`
- Create: `mobile/lib/screens/auth_screen.dart`
- Create: `mobile/lib/widgets/app_drawer.dart`
- Modify: `mobile/lib/main.dart`
- Test: `mobile/test/widget_test.dart`

**Interfaces:**
- Consumes: `Api.session`, `Api.authenticate`, `Api.signOut`, and `MemberSession`.
- Produces: `AppController`, signed-out app-bar actions, role-gated drawer destinations, and persisted theme selection.

- [ ] Add widget tests that require visible “Log in” and “Sign up” actions, switchable auth forms, every drawer destination, and admin visibility only for admin sessions.
- [ ] Run `flutter test test/widget_test.dart` and confirm failures match the absent controls.
- [ ] Add controller, auth form, app bar, drawer, session restore, and sign-out behavior.
- [ ] Run `flutter test test/widget_test.dart` and confirm the navigation and auth tests pass.

### Task 3: Public, member, and admin views

**Files:**
- Create: `mobile/lib/widgets/common.dart`
- Create: `mobile/lib/screens/dashboard_screen.dart`
- Create: `mobile/lib/screens/stores_screen.dart`
- Create: `mobile/lib/screens/saved_deals_screen.dart`
- Create: `mobile/lib/screens/basket_screen.dart`
- Create: `mobile/lib/screens/saved_sources_screen.dart`
- Create: `mobile/lib/screens/offers_screen.dart`
- Create: `mobile/lib/screens/scanner_screen.dart`
- Create: `mobile/lib/screens/subscription_screen.dart`
- Create: `mobile/lib/screens/profile_screen.dart`
- Create: `mobile/lib/screens/about_screen.dart`
- Create: `mobile/lib/screens/rules_screen.dart`
- Create: `mobile/lib/screens/admin_screen.dart`
- Modify: `mobile/lib/screens/deals_screen.dart`
- Modify: `mobile/lib/main.dart`
- Test: `mobile/test/member_screens_test.dart`

**Interfaces:**
- Consumes: typed `Api` methods and models.
- Produces: every missing destination with loading, empty, error, and action states.

- [ ] Add focused widget tests for dashboard counts, retailer filters, saved-deal removal, basket quantity, saved-source removal, scanner validation, plan selection, profile forms, guidance copy, and admin summary.
- [ ] Run `flutter test test/member_screens_test.dart` and confirm failures match the missing screens.
- [ ] Implement shared state widgets and each screen with the smallest server-backed behavior needed by its tests.
- [ ] Run `flutter test test/member_screens_test.dart` and confirm all member-screen tests pass.

### Task 4: Light and dark themes

**Files:**
- Modify: `mobile/lib/theme.dart`
- Modify: `mobile/lib/main.dart`
- Test: `mobile/test/theme_test.dart`

**Interfaces:**
- Produces: `TS.lightTheme()`, `TS.darkTheme()`, and stored `ThemeMode` changes.

- [ ] Add tests for light and dark scaffold, surface, text, navigation, and form colors.
- [ ] Run `flutter test test/theme_test.dart` and confirm the dark-theme test fails.
- [ ] Add the dark palette and theme persistence.
- [ ] Run `flutter test test/theme_test.dart` and confirm all theme tests pass.

### Task 5: Generated logo and platform icons

**Files:**
- Replace: `public/assets/brand-mark.png`
- Create: `mobile/assets/brand-mark.png`
- Modify: `mobile/pubspec.yaml`
- Modify: `mobile/web/manifest.json`
- Replace: Android launcher PNG files under `mobile/android/app/src/main/res/mipmap-*`
- Replace: iOS launcher PNG files under `mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset`
- Replace: Flutter web icons under `mobile/web/icons`
- Replace: `mobile/web/favicon.png`
- Modify: `public/manifest.webmanifest`
- Modify: `index.html`

**Interfaces:**
- Consumes: one square GPT Image logo source.
- Produces: consistent website, PWA, Android, iOS, and in-app branding.

- [ ] Generate a square, flat, text-free brand mark with the built-in image tool and inspect it at full size.
- [ ] Copy the selected source into web and Flutter assets.
- [ ] Generate required launcher sizes from the selected source and update manifests.
- [ ] Add asset rendering to the Flutter app bar and auth screen.

### Task 6: Final verification

**Files:**
- Modify: `mobile/README.md`

- [ ] Run `flutter analyze` and resolve every issue.
- [ ] Run `flutter test` and resolve every failure.
- [ ] Run `flutter build web --release` and confirm exit code 0.
- [ ] Run `npm test -- --run` and confirm exit code 0.
- [ ] Run `npm run build` and confirm exit code 0.
- [ ] Review `git diff --check`, `git status --short`, and the requirement checklist before reporting completion.
