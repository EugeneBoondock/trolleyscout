import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme.dart';

/// The readable foreground for a flat [fill]. The blocking palette deliberately
/// mixes light fills (yellow, mint) with dark ones (bandana red, basket green),
/// so a single hard-coded ink foreground puts 3:1 text on the dark half — which
/// is the exact failure the style is usually accused of. Picking by luminance
/// means a caller can pass any brand colour and still clear AA.
Color neoOn(Color fill) => fill.computeLuminance() < 0.42 ? TS.onDark : TS.ink;

/// Section headings as stickers: a colour chip, ink border, tiny hard shadow,
/// rotated a hair off level. Neo-brutalism's section headers are labels
/// somebody slapped on, not typeset captions.
///
/// Sits level. An optional [tilt] alternates the angle by label length, but it
/// is off everywhere by default: a rotated label is the single loudest "this is
/// a toy" signal the style has, and a shopping app that people rely on to make
/// their money go further cannot afford to look like a game. The edge, the
/// weight and the flat colour carry the style on their own.
class NeoSticker extends StatelessWidget {
  const NeoSticker({
    super.key,
    required this.label,
    this.color = TS.yellow,
    this.trailing,
    this.fontSize = 14.5,
    this.tilt = false,
  });

  final String label;
  final Color color;
  final Widget? trailing;
  final double fontSize;

  /// Off by default. Reserved for a one-off editorial moment, never for a
  /// column of section headings.
  final bool tilt;

  @override
  Widget build(BuildContext context) {
    final chip = Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color,
        border: Border.all(color: TS.ink, width: TS.strokeHair),
        borderRadius: BorderRadius.circular(7),
        boxShadow: TS.hardShadow(context, offset: TS.shadowSticker),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: neoOn(color),
          fontWeight: FontWeight.w900,
          fontSize: fontSize,
          letterSpacing: 0.1,
        ),
      ),
    );
    return Row(
      children: [
        Expanded(
          child: Align(
            alignment: Alignment.centerLeft,
            child: tilt
                ? Transform.rotate(
                    angle: label.length.isEven ? -0.018 : 0.014,
                    child: chip,
                  )
                : chip,
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

/// The one number on a screen that is the reason the screen exists, set the way
/// the reference designs set it: the quantity enormous and tight, the currency
/// mark small and lifted to the cap line rather than matched to the digits.
/// Matching the unit to the digits is what makes an amount read as a table
/// cell; shrinking it is what makes it read as a headline.
class NeoNumeral extends StatelessWidget {
  const NeoNumeral({
    super.key,
    required this.value,
    this.unit,
    this.size = 46,
    this.color,
    this.suffix,
  });

  /// The digits, already formatted for the shopper's own currency and locale.
  final String value;

  /// The currency mark or unit, drawn small and raised. Null for a bare count.
  final String? unit;

  final double size;
  final Color? color;

  /// A trailing qualifier set at unit size — "/ month", "kept", "left".
  final String? suffix;

  @override
  Widget build(BuildContext context) {
    // Inherit an enclosing slab's foreground before falling back to theme
    // ink, so a numeral dropped on any colour block is readable unasked.
    final tone =
        color ?? DefaultTextStyle.of(context).style.color ?? TS.inkOf(context);
    final unitSize = size * 0.42;
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (unit != null) ...[
          Padding(
            // Lifts the mark to sit against the cap line of the digits rather
            // than their baseline, which is where the eye expects a currency
            // mark on a headline number.
            padding: EdgeInsets.only(top: size * 0.1),
            child: Text(
              unit!,
              style: TS.numeralUnit.copyWith(fontSize: unitSize, color: tone),
            ),
          ),
          SizedBox(width: size * 0.05),
        ],
        Flexible(
          child: Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TS.numeral.copyWith(fontSize: size, color: tone),
          ),
        ),
        if (suffix != null) ...[
          SizedBox(width: size * 0.06),
          Padding(
            padding: EdgeInsets.only(top: size * 0.42),
            child: Text(
              suffix!,
              style: TS.numeralUnit.copyWith(
                fontSize: unitSize * 0.72,
                color: tone,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// The spiked burst from the reference work, drawn rather than shipped as an
/// asset so it inherits any colour and costs nothing to place.
///
/// Deployment rule: at most one per screen, and always *behind* something —
/// peeking out from a corner of the money card, not framing an icon. Centred
/// behind a symbol it turns into a sun with a stamp on it; half-hidden behind
/// a slab's corner it reads the way it does in the good reference sets, as a
/// print accident that survived. Scarcity is the difference between an accent
/// and clipart.
///
/// Purely decorative: excluded from semantics so a screen reader never
/// announces it.
class NeoBurst extends StatelessWidget {
  const NeoBurst({
    super.key,
    this.size = 44,
    this.color = TS.yellow,
    this.points = 10,
    this.rotation = 0,
  });

  final double size;
  final Color color;
  final int points;
  final double rotation;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: Transform.rotate(
          angle: rotation,
          child: CustomPaint(
            size: Size.square(size),
            painter: _BurstPainter(color: color, points: points),
          ),
        ),
      );
}

class _BurstPainter extends CustomPainter {
  const _BurstPainter({required this.color, required this.points});

  final Color color;
  final int points;

  @override
  void paint(Canvas canvas, Size size) {
    final centre = Offset(size.width / 2, size.height / 2);
    final outer = size.width / 2;
    // A deep inner radius is what makes the spikes read as a burst rather
    // than a cog; anything above about 0.6 rounds off into a gear.
    final inner = outer * 0.46;
    final path = Path();
    final step = math.pi / points;
    for (var i = 0; i < points * 2; i++) {
      final radius = i.isEven ? outer : inner;
      final angle = i * step - math.pi / 2;
      final point = Offset(
        centre.dx + radius * math.cos(angle),
        centre.dy + radius * math.sin(angle),
      );
      i == 0
          ? path.moveTo(point.dx, point.dy)
          : path.lineTo(point.dx, point.dy);
    }
    path.close();
    canvas.drawPath(path, Paint()..color = color);
  }

  @override
  bool shouldRepaint(_BurstPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.points != points;
}

/// A small hard-edged tag: ink border, flat fill, w900 label. The style's
/// answer to a badge — no tonal wash, no soft pill shadow.
class NeoTag extends StatelessWidget {
  const NeoTag({
    super.key,
    required this.label,
    this.color = TS.yellow,
    this.icon,
  });

  final String label;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: color,
          border: Border.all(color: TS.ink, width: TS.strokeHair),
          // Tighter than tileRadius: at a tag's height, 12 rounds into a
          // pill, and a pill is the one silhouette this system never draws.
          borderRadius: BorderRadius.circular(7),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 12, color: neoOn(color)),
              const SizedBox(width: 4),
            ],
            Text(
              label,
              style: TextStyle(
                color: neoOn(color),
                fontWeight: FontWeight.w900,
                fontSize: 11,
                letterSpacing: 0.2,
              ),
            ),
          ],
        ),
      );
}

/// A whole surface filled with one flat colour, ink border, hard shadow — the
/// colour-blocked slab. Cream cards keep the app calm; slabs are for the things
/// that deserve to shout, and the shouting is done by area of flat colour
/// rather than by a tint or a gradient.
class NeoSlab extends StatelessWidget {
  const NeoSlab({
    super.key,
    required this.child,
    required this.color,
    this.padding = const EdgeInsets.all(16),
    this.shadow = TS.shadowCard,
    this.width,
  });

  final Widget child;
  final Color color;
  final EdgeInsetsGeometry padding;
  final double shadow;
  final double? width;

  @override
  Widget build(BuildContext context) {
    // A slab keeps its fill in both themes, so its foreground cannot come
    // from the theme: dark-mode ink is cream, and cream on the yellow slab is
    // unreadable. The slab sets its own text and icon defaults from its fill,
    // making it impossible for a call site to inherit the wrong colour.
    final on = neoOn(color);
    return Container(
      width: width,
      padding: padding,
      decoration: TS.slab(context, color: color, shadow: shadow),
      // Ink splashes and ListTiles paint on the nearest Material; without a
      // transparent one they would paint under this slab's colour.
      child: Material(
        type: MaterialType.transparency,
        child: DefaultTextStyle.merge(
          style: TextStyle(color: on),
          child: IconTheme.merge(
            data: IconThemeData(color: on),
            child: child,
          ),
        ),
      ),
    );
  }
}
