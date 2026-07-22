# Trolley Scout mobile app (Flutter)

Native Android and iOS app for Trolley Scout. It uses the same live Cloudflare API and member account as [trolleyscout.co.za](https://trolleyscout.co.za).

## Features

- Public: Home, Near me, Find deals, Tools, Stores, Properties, and About and help.
- Member: Log in, Sign up, Dashboard, Saved deals, Basket, Subscription, Profile, and sign out.
- Admin: role-gated account, plan, source, deal, leaflet, and scout status.
- Appearance: matching light and dark themes with a persistent theme choice.
- Branding: one Trolley Scout mark across the app bar, Flutter web, Android, iOS, and the website.

## Run

```text
cd mobile
flutter pub get
flutter run
flutter run -d chrome
```

## Verify

```text
flutter analyze
flutter test
flutter build web --release
```
