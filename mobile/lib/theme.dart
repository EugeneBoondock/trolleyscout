import 'package:flutter/material.dart';

/// Marks the subtree of a slab that is currently held down, so the hard shadow
/// under it can collapse while the slab travels into it. The style's press is
/// a stamp: the slab moves the exact distance its shadow was offset and the
/// shadow vanishes underneath, which is why it reads as pressed into the page
/// rather than sliding across it. Kept as an inherited scope because every
/// decoration in this file is already built from a BuildContext, so all ~35
/// existing `TS.card(context)` call sites inherit the behaviour untouched.
class NeoPressScope extends InheritedWidget {
  const NeoPressScope({
    super.key,
    required this.pressed,
    required super.child,
  });

  final bool pressed;

  static bool of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<NeoPressScope>()?.pressed ??
      false;

  @override
  bool updateShouldNotify(NeoPressScope oldWidget) =>
      pressed != oldWidget.pressed;
}

/// A rounded rectangle that casts the app's hard slab shadow, as a
/// [ShapeBorder] so buttons and chips can carry it.
///
/// Cards get their shadow from a BoxDecoration, but Flutter's ButtonStyle has
/// no boxShadow and Material's own elevation is always blurred — which is the
/// one thing this style never does. Without this, every card in the app casts
/// a slab and every button stays flat, and the buttons are what people
/// actually touch. Painting it in the shape reaches all of them through the
/// theme, with no call site changed.
///
/// The slab is painted as the offset shape *minus* the shape itself, so only
/// the sliver that would show behind the button is drawn. Painting the whole
/// offset rectangle would cover the button's own fill, because a border paints
/// after the background.
class NeoSlabBorder extends OutlinedBorder {
  const NeoSlabBorder({
    super.side = BorderSide.none,
    this.radius = 12,
    this.offset = 3,
    this.shadowColor = const Color(0xFF1C1710),
  });

  final double radius;

  /// Distance the slab sits down and right. Zero paints no slab, which is how
  /// the pressed state flattens a button onto the page.
  final double offset;

  final Color shadowColor;

  RRect _rrect(Rect rect) =>
      RRect.fromRectAndRadius(rect, Radius.circular(radius));

  @override
  EdgeInsetsGeometry get dimensions => EdgeInsets.all(side.width);

  @override
  Path getInnerPath(Rect rect, {TextDirection? textDirection}) =>
      Path()..addRRect(_rrect(rect).deflate(side.width));

  @override
  Path getOuterPath(Rect rect, {TextDirection? textDirection}) =>
      Path()..addRRect(_rrect(rect));

  @override
  void paint(Canvas canvas, Rect rect, {TextDirection? textDirection}) {
    if (offset > 0) {
      final own = Path()..addRRect(_rrect(rect));
      final cast = Path()..addRRect(_rrect(rect.shift(Offset(offset, offset))));
      canvas.drawPath(
        Path.combine(PathOperation.difference, cast, own),
        Paint()..color = shadowColor,
      );
    }
    if (side.style != BorderStyle.none) {
      canvas.drawRRect(
        _rrect(rect).deflate(side.width / 2),
        side.toPaint(),
      );
    }
  }

  @override
  NeoSlabBorder copyWith({
    BorderSide? side,
    double? radius,
    double? offset,
    Color? shadowColor,
  }) =>
      NeoSlabBorder(
        side: side ?? this.side,
        radius: radius ?? this.radius,
        offset: offset ?? this.offset,
        shadowColor: shadowColor ?? this.shadowColor,
      );

  @override
  ShapeBorder scale(double t) => NeoSlabBorder(
        side: side.scale(t),
        radius: radius * t,
        offset: offset * t,
        shadowColor: shadowColor,
      );

  @override
  bool operator ==(Object other) =>
      other is NeoSlabBorder &&
      other.side == side &&
      other.radius == radius &&
      other.offset == offset &&
      other.shadowColor == shadowColor;

  @override
  int get hashCode => Object.hash(side, radius, offset, shadowColor);
}

class TS {
  // The radius ladder, tightened a step. The reference implementations sit at
  // about 5px; going that square would fight the mascot, which is a round,
  // friendly character, and this app is used by people who need it to feel
  // approachable rather than severe. But 20/16 was round enough that a button
  // came out a pill and the edge stopped reading as an edge. This keeps the
  // corner soft enough to stay warm and hard enough that the 2px stroke and
  // the slab behind it are the first things you see.
  static const cardRadius = 18.0;
  static const controlRadius = 12.0;
  static const panelRadius = 24.0;
  // The bottom bar. Shallower than a panel so a short bar reads as a neat
  // strip rather than a stretched pill.
  static const navRadius = 16.0;
  // Chips and badges that read as pills — category filters, plan tags. Kept as
  // a token so a chip never ends up with a hand-picked radius of its own.
  static const pillRadius = 999.0;
  // Small tiles that sit inside a card: swatches, thumbnails, stat chips.
  static const tileRadius = 12.0;

  // The slab shadow scale. Zero blur at every step — a blurred shadow is the
  // one thing the style never does, because the shadow is meant to read as a
  // second flat shape behind the first, not as light falling on it. Depth is
  // carried by offset alone, so the ladder is what ranks a sticker below a
  // card below the one thing on screen that should shout.
  static const shadowSticker = 2.0;
  static const shadowCard = 4.0;
  static const shadowHero = 6.0;

  // Border weights. One canonical stroke (2) does most of the work; the
  // hairline is for chips small enough that 2 would swallow the label, and
  // the bold stroke is for surfaces that float over the page (sheets,
  // dialogs) where the edge is doing the job elevation used to do.
  static const strokeHair = 1.5;
  static const strokeBase = 2.0;
  static const strokeBold = 2.5;

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
  // Mint tag for "to rent" property badges — accent surface with ink text,
  // theme-independent like [yellow].
  static const rentTag = Color(0xFFBFE3D0);

  /// Cream, as a foreground on the dark blocks. The mascot's own face colour,
  /// which is why it reads as part of the set rather than as plain white.
  static const onDark = Color(0xFFFDFAF1);

  /// The colour-blocking rotation, drawn entirely from the mascot: the
  /// yellow, the bandana red, the basket green, the mint. Neo-brutalism fills
  /// a whole surface with one flat colour rather than tinting it, so a row of
  /// tiles reads as a set of objects instead of a form.
  ///
  /// Each entry carries its own foreground because the set deliberately mixes
  /// light and dark fills — a single ink foreground would fail contrast on the
  /// red and the green. Both members are theme-independent, which is what lets
  /// a slab keep its colour in dark mode instead of washing out.
  static const blocks = <({Color fill, Color on})>[
    (fill: yellow, on: ink),
    (fill: red, on: onDark),
    (fill: rentTag, on: ink),
    (fill: green, on: onDark),
  ];

  /// The blocking colour for the item at [index], so a list of any length
  /// colours itself without the call site hand-picking hues.
  static ({Color fill, Color on}) blockAt(int index) =>
      blocks[index % blocks.length];

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
    // Shapes paint without a BuildContext, so the cast colour has to be baked
    // in here rather than resolved per-frame like [hardShadow] does.
    final castColor = brightness == Brightness.dark ? _darkCast : ink;
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(controlRadius),
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
      // Body copy sits at w500, not w400. The style's own component libraries
      // set their base weight there, and it matters: against 2px ink borders
      // and flat colour blocks, regular-weight text reads as washed out. It
      // stops short of bold, which is what keeps paragraphs readable —
      // the loud type is the headings' job, not the body's.
      textTheme: base.textTheme
          .apply(bodyColor: inkColor, displayColor: inkColor)
          .merge(const TextTheme(
            bodyLarge: TextStyle(fontWeight: FontWeight.w500),
            bodyMedium: TextStyle(fontWeight: FontWeight.w500),
            bodySmall: TextStyle(fontWeight: FontWeight.w500),
            titleLarge: TextStyle(fontWeight: FontWeight.w800),
            titleMedium: TextStyle(fontWeight: FontWeight.w800),
            titleSmall: TextStyle(fontWeight: FontWeight.w800),
            labelLarge: TextStyle(fontWeight: FontWeight.w800),
            headlineSmall: TextStyle(fontWeight: FontWeight.w900),
            headlineMedium: TextStyle(fontWeight: FontWeight.w900),
            headlineLarge: TextStyle(fontWeight: FontWeight.w900),
          )),
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
          borderRadius: BorderRadius.circular(cardRadius),
          side: BorderSide(color: outlineColor, width: 2),
        ),
      ),
      drawerTheme: DrawerThemeData(
        backgroundColor: background,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.horizontal(
            right: Radius.circular(panelRadius),
          ),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surfaceColor,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.vertical(
            top: Radius.circular(panelRadius),
          ),
          side: BorderSide(color: outlineColor, width: 2.5),
        ),
      ),
      // Every button is a slab: ink border, hard offset shadow, no elevation,
      // no tonal wash. This is the piece that makes the style read on every
      // screen instead of only where a card was hand-styled.
      //
      // The shadow drops to zero while pressed, which is the second half of
      // the style's press — a button that flattens onto the page reads as
      // pushed, where one that merely tints reads as a web link.
      filledButtonTheme: FilledButtonThemeData(
        style: ButtonStyle(
          elevation: const WidgetStatePropertyAll(0),
          textStyle: const WidgetStatePropertyAll(
            TextStyle(fontWeight: FontWeight.w900),
          ),
          shape: WidgetStateProperty.resolveWith(
            (states) => NeoSlabBorder(
              radius: controlRadius,
              offset: states.contains(WidgetState.pressed) ? 0 : shadowSticker,
              shadowColor: castColor,
              side: const BorderSide(color: ink, width: strokeBase),
            ),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: ButtonStyle(
          textStyle: const WidgetStatePropertyAll(
            TextStyle(fontWeight: FontWeight.w800),
          ),
          // The side lives on the shape, not here: setting both paints the
          // stroke twice, and the second pass is not offset by the slab.
          side: const WidgetStatePropertyAll(BorderSide.none),
          shape: WidgetStateProperty.resolveWith(
            (states) => NeoSlabBorder(
              radius: controlRadius,
              offset: states.contains(WidgetState.pressed) ? 0 : shadowSticker,
              shadowColor: castColor,
              side: BorderSide(color: outlineColor, width: strokeBase),
            ),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: ButtonStyle(
          shape: WidgetStatePropertyAll(RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(controlRadius),
          )),
        ),
      ),
      // Stock M3 segmented buttons are stadiums — the auth screen's
      // Sign up / Log in toggle was the one pill-shaped control left in the
      // app. Keyed corners and the standard stroke bring it into the system;
      // the selected fill stays the scheme's secondary (bandana red).
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          textStyle: const WidgetStatePropertyAll(
            TextStyle(fontWeight: FontWeight.w800),
          ),
          side: WidgetStatePropertyAll(
            BorderSide(color: outlineColor, width: strokeBase),
          ),
          shape: WidgetStatePropertyAll(RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(controlRadius),
          )),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 64,
        backgroundColor: surfaceColor,
        elevation: 0,
        indicatorColor: yellow,
        indicatorShape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(controlRadius),
        ),
        labelTextStyle: WidgetStatePropertyAll(TextStyle(
          color: inkColor,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        )),
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
      checkboxTheme: CheckboxThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(6),
        ),
      ),
      // Chips were full pills. A pill is the shape of a soft system; against
      // square-cornered cards a row of them read as borrowed from a different
      // app. They take the control radius and the same slab as the buttons, so
      // a filter row now looks like a set of small keys.
      chipTheme: ChipThemeData(
        shape: NeoSlabBorder(
          radius: controlRadius,
          offset: shadowSticker,
          shadowColor: castColor,
          side: BorderSide(color: outlineColor, width: strokeBase),
        ),
        labelStyle: TextStyle(
          color: inkColor,
          fontWeight: FontWeight.w800,
        ),
      ),
      dividerColor: outlineSoftColor,
      snackBarTheme: SnackBarThemeData(
        backgroundColor: inkColor,
        contentTextStyle: TextStyle(
          color: background,
          fontWeight: FontWeight.w700,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(controlRadius),
          side: const BorderSide(color: yellow, width: 2),
        ),
        behavior: SnackBarBehavior.floating,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surfaceColor,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(panelRadius),
          side: BorderSide(color: outlineColor, width: 2.5),
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: surfaceColor,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(cardRadius),
        ),
      ),
    );
  }

  static Color inkOf(BuildContext context) =>
      Theme.of(context).colorScheme.onSurface;
  static Color mutedOf(BuildContext context) =>
      Theme.of(context).colorScheme.onSurfaceVariant;
  // Genuinely fainter than mutedOf in both themes (the old alias returned the
  // identical colour, so "faint" text silently rendered as "muted"). Light
  // mode uses the static [faint] tone, which still clears WCAG AA (4.5:1) on
  // the cream background where an alpha blend would not; dark mode has far
  // more contrast headroom, so a light alpha fade is safe there.
  static Color faintOf(BuildContext context) {
    final theme = Theme.of(context);
    return theme.brightness == Brightness.dark
        ? theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.85)
        : faint;
  }

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

  /// The shadow the whole app casts. A solid offset slab, zero blur: a second
  /// flat shape sitting behind the first, never light falling on it.
  ///
  /// Both themes cast it solid. The dark theme used to fade this to an
  /// 18%-alpha yellow, which politely erased the one thing the style is built
  /// on — at that alpha, over a near-black page, there is no visible slab left.
  /// The reference implementations all keep the shadow fully opaque in dark
  /// mode for exactly this reason. Ours is a warm near-black from the ink
  /// family rather than pure #000, so the cast still belongs to this palette
  /// and reads deeper than the page instead of foreign to it.
  ///
  /// Returns an empty list while an enclosing [NeoPressScope] is held down, so
  /// the slab lands flat on the page at the bottom of its travel.
  static const _darkCast = Color(0xFF090705);

  static List<BoxShadow> hardShadow(
    BuildContext context, {
    double offset = shadowCard,
  }) {
    if (NeoPressScope.of(context)) return const [];
    return [
      BoxShadow(
        color:
            Theme.of(context).brightness == Brightness.dark ? _darkCast : ink,
        offset: Offset(offset, offset),
      ),
    ];
  }

  static BoxDecoration card(
    BuildContext context, {
    Color? color,
    Color? border,
    double width = strokeBase,
    double shadow = shadowCard,
    double? radiusOverride,
  }) =>
      BoxDecoration(
        color: color ?? surfaceOf(context),
        border: Border.all(color: border ?? lineOf(context), width: width),
        borderRadius: BorderRadius.circular(radiusOverride ?? cardRadius),
        boxShadow: hardShadow(context, offset: shadow),
      );

  /// Card chrome for cards whose child bleeds to the edges (product photos):
  /// use [cardFill] as `decoration` and [cardStroke] as `foregroundDecoration`.
  /// A full-bleed image clipped to the card's outer radius paints over the
  /// inner half of a background border at the top corners, fading the stroke —
  /// painting the stroke in the foreground keeps it crisp on every corner.
  static BoxDecoration cardFill(
    BuildContext context, {
    Color? color,
    double shadow = shadowCard,
  }) =>
      BoxDecoration(
        color: color ?? surfaceOf(context),
        borderRadius: BorderRadius.circular(cardRadius),
        boxShadow: hardShadow(context, offset: shadow),
      );

  /// A colour-blocked slab: the Gumroad move. A whole card filled in one of
  /// the mascot's colours, ink border, hard offset shadow. Cream cards keep
  /// the app calm; slabs are for the things that deserve to shout.
  static BoxDecoration slab(
    BuildContext context, {
    required Color color,
    double shadow = shadowCard,
    double radius = cardRadius,
  }) =>
      BoxDecoration(
        color: color,
        border: Border.all(color: ink, width: strokeBase),
        borderRadius: BorderRadius.circular(radius),
        boxShadow: hardShadow(context, offset: shadow),
      );

  static BoxDecoration cardStroke(
    BuildContext context, {
    Color? border,
    double width = 2,
  }) =>
      BoxDecoration(
        border: Border.all(color: border ?? lineOf(context), width: width),
        borderRadius: BorderRadius.circular(cardRadius),
      );

  static const display = TextStyle(
    fontWeight: FontWeight.w900,
    letterSpacing: 0.4,
    height: 1.05,
  );

  /// Screen titles. Heavier and tighter than [display]: at headline sizes the
  /// positive tracking that helps a small all-caps eyebrow starts to look
  /// slack, and the style wants its big type packed.
  static const title = TextStyle(
    fontWeight: FontWeight.w900,
    letterSpacing: -0.8,
    height: 1.0,
  );

  /// The one number on a screen that is the reason the screen exists — the
  /// money kept, the total, the count. Set as tight as the face allows and
  /// with tabular figures so a live-updating amount doesn't jitter its own
  /// width. Pair with [numeralUnit] for the currency mark.
  static const numeral = TextStyle(
    fontWeight: FontWeight.w900,
    letterSpacing: -1.6,
    height: 0.95,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  /// The currency mark or unit riding on a [numeral]. Set small and lifted
  /// rather than matched to the digits: the reference designs all shrink the
  /// unit so the quantity is what the eye lands on first.
  static const numeralUnit = TextStyle(
    fontWeight: FontWeight.w900,
    height: 1.0,
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
