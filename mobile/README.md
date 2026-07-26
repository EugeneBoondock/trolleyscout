# Trolley Scout mobile apps (Flutter)

The shopper and business apps are separate Android products backed by the same Flutter project and Cloudflare API.

## Features

- Public: Home, Near me, Find deals, Tools, Stores, Properties, and About and help.
- Member: Log in, Sign up, Dashboard, Saved deals, Basket, Subscription, Profile, and sign out.
- Admin: role-gated account, plan, source, deal, leaflet, and scout status.
- Appearance: matching light and dark themes with a persistent theme choice.
- Branding: one Trolley Scout mark across the app bar, Flutter web, Android, iOS, and the website.

## Run the shopper app

```text
cd mobile
flutter pub get
flutter run --flavor consumer -t lib/main.dart
```

## Run the business app

```text
cd mobile
flutter pub get
flutter run --flavor business -t lib/main_business.dart
```

## Verify

```text
flutter analyze
flutter test
flutter build appbundle --flavor consumer -t lib/main.dart
flutter build appbundle --flavor business -t lib/main_business.dart
```
