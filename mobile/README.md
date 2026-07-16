# Trolley Scout — mobile app (Flutter)

Native Android/iOS app for Trolley Scout. It talks to the same live Cloudflare
API as the website (https://trolleyscout.co.za), so there is no separate backend.

## Screens
- **Home** — the "money on the table" till slip: SASSA grant amounts a household
  can claim, plus the grant-fraud warning.
- **Money** — every SASSA grant with who qualifies, how to apply free, and a link
  to the official page.
- **Near me** — asks for device location and lists the supermarkets around you
  with this week's deals and catalogues for each (reused globally, date-aware).
- **Deals** — the source-backed specials board, sorted by retailer and catalogue
  page, paginated 24 per page.

## Run
    cd mobile
    flutter pub get
    flutter run            # connected device / emulator
    flutter run -d chrome  # or in the browser

## Release APK (Android)
The Android SDK is installed but its licenses must be accepted once:
    flutter doctor --android-licenses
    flutter build apk --release   # build/app/outputs/flutter-apk/app-release.apk

## Verify
    flutter analyze   # 0 issues
    flutter test      # boots to home, shows the till slip
    flutter build web --release
