// CupertinoPageTransitionsBuilder lives in the cupertino library as of
// Flutter 3.44; material no longer re-exports it.
import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';

class TS {
  static const bg = Color(0xFFF4EEDD);
  static const surface = Color(0xFFFDFAF1);
  static const surfaceSoft = Color(0xFFECE4CD);
  static const ink = Color(0xFF1C1710);
  static const muted = Color(0xFF5D5546);
  static const faint = Color(0xFF6F6753);
  static const line = Color(0xFF1C1710);
  static const lineSoft = Color(0xFFD4C9AC);
  static const red = Color(0xFFC9271B);
  static const redBright = Color(0xFFD92D1C);
  static const yellow = Color(0xFFFFD42E);
  static const green = Color(0xFF0D6B3D);

  static const _darkBg = Color(0xFF191410);
  static const _darkSurface = Color(0xFF221C15);
  static const _darkSurfaceSoft = Color(0xFF2C251C);
  static const _darkInk = Color(0xFFF3ECD9);
  static const _darkMuted = Color(0xFFBAAE95);
  static const _darkLineSoft = Color(0xFF423A2D);
  static const _darkRed = Color(0xFFFF6A57);
  static const _darkGreen = Color(0xFF4DBD82);

  static ThemeData theme() => lightTheme();

  static ThemeData lightTheme() => _theme(
        brightness: Brightness.light,
        background: bg,
        surfaceColor: surface,
        surfaceSoftColor: surfaceSoft,
        inkColor: ink,
        mutedColor: muted,
        outlineColor: line,
        outlineSoftColor: lineSoft,
        redColor: red,
        greenColor: green,
        primaryColor: ink,
        onPrimaryColor: const Color(0xFFFFFDF4),
      );

  static ThemeData darkTheme() => _theme(
        brightness: Brightness.dark,
        background: _darkBg,
        surfaceColor: _darkSurface,
        surfaceSoftColor: _darkSurfaceSoft,
        inkColor: _darkInk,
        mutedColor: _darkMuted,
        outlineColor: _darkInk,
        outlineSoftColor: _darkLineSoft,
        redColor: _darkRed,
        greenColor: _darkGreen,
        primaryColor: yellow,
        onPrimaryColor: ink,
      );

  static ThemeData _theme({
    required Brightness brightness,
    required Color background,
    required Color surfaceColor,
    required Color surfaceSoftColor,
    required Color inkColor,
    required Color mutedColor,
    required Color outlineColor,
    required Color outlineSoftColor,
    required Color redColor,
    required Color greenColor,
    required Color primaryColor,
    required Color onPrimaryColor,
  }) {
    final scheme = ColorScheme(
      brightness: brightness,
      primary: primaryColor,
      onPrimary: onPrimaryColor,
      secondary: redColor,
      onSecondary: brightness == Brightness.light ? Colors.white : ink,
      error: redColor,
      onError: brightness == Brightness.light ? Colors.white : ink,
      surface: surfaceColor,
      onSurface: inkColor,
      tertiary: greenColor,
      onTertiary: brightness == Brightness.light ? Colors.white : ink,
      outline: outlineColor,
      outlineVariant: outlineSoftColor,
      surfaceContainerHighest: surfaceSoftColor,
      onSurfaceVariant: mutedColor,
    );
    final base = ThemeData(
        brightness: brightness, useMaterial3: true, colorScheme: scheme);
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.zero,
      borderSide: BorderSide(color: outlineColor, width: 2),
    );
    return base.copyWith(
      scaffoldBackgroundColor: background,
      canvasColor: background,
      colorScheme: scheme,
      // Shared-axis fades on Android, native slide on iOS: route changes
      // read as motion, never as a flash.
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.windows: FadeForwardsPageTransitionsBuilder(),
          TargetPlatform.linux: FadeForwardsPageTransitionsBuilder(),
        },
      ),
      textTheme:
          base.textTheme.apply(bodyColor: inkColor, displayColor: inkColor),
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        foregroundColor: inkColor,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: surfaceColor,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.zero,
          side: BorderSide(color: outlineSoftColor, width: 1.5),
        ),
      ),
      drawerTheme: DrawerThemeData(backgroundColor: background),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: background,
        indicatorColor: yellow,
        labelTextStyle: WidgetStatePropertyAll(TextStyle(color: inkColor)),
        iconTheme: WidgetStateProperty.resolveWith((states) => IconThemeData(
              color: states.contains(WidgetState.selected) ? ink : inkColor,
            )),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceColor,
        border: border,
        enabledBorder: border,
        focusedBorder:
            border.copyWith(borderSide: BorderSide(color: redColor, width: 3)),
        labelStyle: TextStyle(color: mutedColor),
        hintStyle: TextStyle(color: mutedColor),
      ),
      dividerColor: outlineSoftColor,
      snackBarTheme: SnackBarThemeData(
        backgroundColor: inkColor,
        contentTextStyle: TextStyle(color: background),
      ),
    );
  }

  static Color inkOf(BuildContext context) =>
      Theme.of(context).colorScheme.onSurface;
  static Color mutedOf(BuildContext context) =>
      Theme.of(context).colorScheme.onSurfaceVariant;
  static Color faintOf(BuildContext context) =>
      Theme.of(context).colorScheme.onSurfaceVariant;
  static Color lineOf(BuildContext context) =>
      Theme.of(context).colorScheme.outline;
  static Color lineSoftOf(BuildContext context) =>
      Theme.of(context).colorScheme.outlineVariant;
  static Color redOf(BuildContext context) =>
      Theme.of(context).colorScheme.secondary;
  static Color greenOf(BuildContext context) =>
      Theme.of(context).colorScheme.tertiary;
  static Color surfaceOf(BuildContext context) =>
      Theme.of(context).colorScheme.surface;
  static Color surfaceSoftOf(BuildContext context) =>
      Theme.of(context).colorScheme.surfaceContainerHighest;
  static Color bgOf(BuildContext context) =>
      Theme.of(context).scaffoldBackgroundColor;

  static BoxDecoration card(
    BuildContext context, {
    Color? color,
    Color? border,
    double width = 2,
  }) =>
      BoxDecoration(
        color: color ?? surfaceOf(context),
        border: Border.all(color: border ?? lineOf(context), width: width),
        boxShadow: [
          BoxShadow(
            color: Theme.of(context).brightness == Brightness.dark
                ? const Color(0x8C000000)
                : const Color(0x291C1710),
            offset: const Offset(3, 3),
          ),
        ],
      );

  static const display = TextStyle(
    fontWeight: FontWeight.w900,
    letterSpacing: 0.4,
    height: 1.05,
  );

  static TextStyle eyebrowOf(BuildContext context) => TextStyle(
        color: redOf(context),
        fontWeight: FontWeight.w900,
        fontSize: 12,
        letterSpacing: 1.4,
      );

  static const eyebrow = TextStyle(
    color: red,
    fontWeight: FontWeight.w900,
    fontSize: 12,
    letterSpacing: 1.4,
  );
}
