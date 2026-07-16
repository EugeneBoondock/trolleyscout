import 'package:flutter/material.dart';

/// Trolley Scout's "specials insert" look, matching the web app: newsprint
/// cream, ink, specials-red prices, marker-yellow accents, hard shadows.
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

  static ThemeData theme() {
    final base = ThemeData.light(useMaterial3: true);
    return base.copyWith(
      scaffoldBackgroundColor: bg,
      colorScheme: base.colorScheme.copyWith(
        primary: ink,
        secondary: red,
        surface: surface,
      ),
      textTheme: base.textTheme.apply(bodyColor: ink, displayColor: ink),
      appBarTheme: const AppBarTheme(
        backgroundColor: bg,
        foregroundColor: ink,
        elevation: 0,
        centerTitle: false,
      ),
    );
  }

  /// A hard "cut-paper" shadow, like the web's box-shadow.
  static List<BoxShadow> hardShadow = const [
    BoxShadow(color: Color(0x291C1710), offset: Offset(3, 3)),
  ];

  static BoxDecoration card({Color? color, Color border = line, double width = 2}) =>
      BoxDecoration(
        color: color ?? surface,
        border: Border.all(color: border, width: width),
        boxShadow: hardShadow,
      );

  static const display = TextStyle(
    fontWeight: FontWeight.w900,
    letterSpacing: 0.4,
    height: 1.05,
  );

  static const eyebrow = TextStyle(
    color: red,
    fontWeight: FontWeight.w900,
    fontSize: 12,
    letterSpacing: 1.4,
  );
}
