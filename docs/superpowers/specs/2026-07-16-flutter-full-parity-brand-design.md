# Flutter Full Parity and Brand Design

## Scope

The Flutter app will expose every public, member, and role-gated admin area available on the website. Existing Home, Money help, Near me, Find deals, and Tools views remain. New views cover authentication, Dashboard, Stores, Saved deals, Basket, Saved sources, Offers, Scanner, Subscription, Profile, About and help, Rules, and Admin console.

The same generated Trolley Scout mark will appear in the website header, website manifest, Flutter header, Flutter web manifest, Android launcher, and iOS launcher.

## Navigation

Five frequent destinations remain in the bottom bar: Home, Money, Near me, Deals, and Tools. A leading menu opens every destination without crowding the bottom bar. Signed-out users see “Log in” and “Sign up” actions in the app bar. Signed-in users see their account entry and sign-out action. Admin console appears only when the session account has the admin role.

## Session and API

One API client owns all HTTP work. Native builds capture the server’s `ts_member_session` cookie and keep it in device storage for later requests. Flutter web uses browser-managed cookies with credentialed requests. The client exposes typed methods for session, retailers, discovery, saved data, basket, offers, scanner, subscriptions, profile updates, and admin data.

Authentication errors stay on the current screen and show the first server issue. A 401 response clears local session state. Loading, empty, retry, and error states use shared widgets.

## Screens and actions

- Dashboard shows plan, deal, source, basket, offer, and store counts with shortcuts.
- Stores supports text and source-type filters, official links, and save actions.
- Find deals keeps the current deal list and adds save actions when signed in.
- Saved deals supports remove, add to basket, and source review.
- Basket supports quantity changes, remove, totals, and savings.
- Saved sources supports open and remove.
- Offers lists verified offers and permits admin deletion.
- Scanner validates a draft, shows issues, and permits verified saves.
- Subscription lists plans and opens PayFast checkout returned by the server.
- Profile updates display name and password, and exposes sign out.
- About and help and Rules mirror the website’s consumer guidance.
- Admin console shows account, plan, source, deal, and scout status data for admins.

## Appearance

The existing specials-insert style remains: cream paper, ink borders, red pricing, yellow markers, and green trust accents. A matching dark theme uses warm near-black paper and readable light ink. The device theme is the first-run default, and the user’s selection persists.

The new logo is a flat, strong-silhouette shopping trolley and scout symbol with the platform palette. It contains no text, gradients, 3D effects, or fine details that disappear at launcher size.

## Verification

Tests cover cookie capture, authenticated requests, API model parsing, authentication switching, signed-out actions, role-gated navigation, theme switching, and key member actions. Final checks are `flutter analyze`, `flutter test`, `flutter build web --release`, the website test suite, and the website production build.
