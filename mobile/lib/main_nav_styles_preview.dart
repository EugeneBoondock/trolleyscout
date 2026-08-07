// Five bottom-bar treatments, rendered with the real theme and the real icon
// set so the choice is made on what ships rather than on a mockup.
//
// Not part of the shipped app. Run with:
//   flutter run -t lib/main_nav_styles_preview.dart

import 'package:flutter/material.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import 'theme.dart';

void main() => runApp(const NavStylesPreviewApp());

/// The five destinations, so every option is judged on the same row.
const _tabs = <({String label, IconData line, IconData bold, IconData duo, IconData fill})>[
  (
    label: 'Home',
    line: PhosphorIconsRegular.house,
    bold: PhosphorIconsBold.house,
    duo: PhosphorIconsDuotone.house,
    fill: PhosphorIconsFill.house,
  ),
  (
    label: 'Marketplace',
    line: PhosphorIconsRegular.tag,
    bold: PhosphorIconsBold.tag,
    duo: PhosphorIconsDuotone.tag,
    fill: PhosphorIconsFill.tag,
  ),
  (
    label: 'Mr Scout',
    line: PhosphorIconsRegular.compass,
    bold: PhosphorIconsBold.compass,
    duo: PhosphorIconsDuotone.compass,
    fill: PhosphorIconsFill.compass,
  ),
  (
    label: 'Stores',
    line: PhosphorIconsRegular.storefront,
    bold: PhosphorIconsBold.storefront,
    duo: PhosphorIconsDuotone.storefront,
    fill: PhosphorIconsFill.storefront,
  ),
  (
    label: 'Window',
    line: PhosphorIconsRegular.squaresFour,
    bold: PhosphorIconsBold.squaresFour,
    duo: PhosphorIconsDuotone.squaresFour,
    fill: PhosphorIconsFill.squaresFour,
  ),
];

class NavStylesPreviewApp extends StatefulWidget {
  const NavStylesPreviewApp({super.key});

  @override
  State<NavStylesPreviewApp> createState() => _NavStylesPreviewAppState();
}

class _NavStylesPreviewAppState extends State<NavStylesPreviewApp> {
  bool _dark = false;

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: TS.lightTheme(),
        darkTheme: TS.darkTheme(),
        themeMode: _dark ? ThemeMode.dark : ThemeMode.light,
        home: Builder(
          builder: (context) => Scaffold(
            backgroundColor: TS.bgOf(context),
            body: SafeArea(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 24),
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text('Bottom bar styles',
                            style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w900,
                                color: TS.inkOf(context))),
                      ),
                      TextButton(
                        onPressed: () => setState(() => _dark = !_dark),
                        child: Text(_dark ? 'Light' : 'Dark'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  const _Option(
                    number: '1',
                    name: 'Lit line',
                    note: 'What ships today. Thin strokes, the chosen tab '
                        'thickens and lights yellow.',
                    child: _BarLitLine(),
                  ),
                  const _Option(
                    number: '2',
                    name: 'Duotone',
                    note: 'Two weights in one glyph: a solid shape behind a '
                        'line. Softest of the five.',
                    child: _BarDuotone(),
                  ),
                  const _Option(
                    number: '3',
                    name: 'Slab tile',
                    note: 'The chosen tab sits in a keyed slab with the ink '
                        'edge. Matches the cards exactly.',
                    child: _BarSlab(),
                  ),
                  const _Option(
                    number: '4',
                    name: 'Highlighter',
                    note: 'A marker stroke under the chosen label. The icon '
                        'never changes colour, so the row stays calm.',
                    child: _BarHighlighter(),
                  ),
                  const _Option(
                    number: '5',
                    name: 'Sticker',
                    note: 'Solid glyphs. The chosen one is yellow with an ink '
                        'shadow behind it, like a pressed sticker.',
                    child: _BarSticker(),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}

class _Option extends StatelessWidget {
  const _Option({
    required this.number,
    required this.name,
    required this.note,
    required this.child,
  });

  final String number;
  final String name;
  final String note;
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 22,
                  height: 22,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: TS.yellow,
                    border: Border.all(color: TS.ink, width: 1.5),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(number,
                      style: const TextStyle(
                          color: TS.ink,
                          fontWeight: FontWeight.w900,
                          fontSize: 12)),
                ),
                const SizedBox(width: 8),
                Text(name,
                    style: TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 15,
                        color: TS.inkOf(context))),
              ],
            ),
            const SizedBox(height: 3),
            Text(note,
                style: TextStyle(fontSize: 11.5, color: TS.mutedOf(context))),
            const SizedBox(height: 8),
            DecoratedBox(
              decoration: BoxDecoration(
                color: TS.surfaceOf(context),
                border: Border(
                    top: BorderSide(color: TS.lineOf(context), width: 2)),
              ),
              child: child,
            ),
          ],
        ),
      );
}

/// Shared row scaffolding, so the five options differ only in how a tab is
/// drawn and not in spacing.
class _Row extends StatelessWidget {
  const _Row({required this.tab});

  /// Draws one destination: context, index, and whether it is the chosen one.
  final Widget Function(BuildContext, int, bool) tab;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 64,
        child: Row(
          children: [
            for (var i = 0; i < _tabs.length; i += 1)
              Expanded(child: Center(child: tab(context, i, i == 0))),
          ],
        ),
      );
}

Widget _label(BuildContext context, String text, Color colour,
        {FontWeight weight = FontWeight.w700}) =>
    Text(text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(fontSize: 11, fontWeight: weight, color: colour));

class _BarLitLine extends StatelessWidget {
  const _BarLitLine();

  @override
  Widget build(BuildContext context) => _Row(
        tab: (context, i, selected) {
          final tab = _tabs[i];
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(selected ? tab.bold : tab.line,
                  size: 26,
                  color: selected ? TS.yellow : TS.inkOf(context),
                  shadows: selected
                      ? const [Shadow(color: Color(0x66FFD42E), blurRadius: 9)]
                      : null),
              const SizedBox(height: 3),
              _label(context, tab.label, TS.inkOf(context),
                  weight: selected ? FontWeight.w900 : FontWeight.w700),
            ],
          );
        },
      );
}

class _BarDuotone extends StatelessWidget {
  const _BarDuotone();

  @override
  Widget build(BuildContext context) => _Row(
        tab: (context, i, selected) {
          final tab = _tabs[i];
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(tab.duo,
                  size: 27,
                  color: selected ? TS.greenOf(context) : TS.inkOf(context)),
              const SizedBox(height: 3),
              _label(context, tab.label, TS.inkOf(context),
                  weight: selected ? FontWeight.w900 : FontWeight.w700),
            ],
          );
        },
      );
}

class _BarSlab extends StatelessWidget {
  const _BarSlab();

  @override
  Widget build(BuildContext context) => _Row(
        tab: (context, i, selected) {
          final tab = _tabs[i];
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 44,
                height: 30,
                alignment: Alignment.center,
                decoration: selected
                    ? TS.slab(context,
                        color: TS.yellow,
                        radius: TS.controlRadius,
                        shadow: TS.shadowSticker)
                    : null,
                child: Icon(selected ? tab.bold : tab.line,
                    size: 22, color: selected ? TS.ink : TS.inkOf(context)),
              ),
              const SizedBox(height: 3),
              _label(context, tab.label, TS.inkOf(context),
                  weight: selected ? FontWeight.w900 : FontWeight.w700),
            ],
          );
        },
      );
}

class _BarHighlighter extends StatelessWidget {
  const _BarHighlighter();

  @override
  Widget build(BuildContext context) => _Row(
        tab: (context, i, selected) {
          final tab = _tabs[i];
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(selected ? tab.bold : tab.line,
                  size: 26, color: TS.inkOf(context)),
              const SizedBox(height: 3),
              Stack(
                alignment: Alignment.center,
                children: [
                  if (selected)
                    Positioned(
                      bottom: 1,
                      child: Container(
                        height: 7,
                        width: tab.label.length * 6.2,
                        color: TS.yellow,
                      ),
                    ),
                  _label(context, tab.label, TS.inkOf(context),
                      weight: selected ? FontWeight.w900 : FontWeight.w700),
                ],
              ),
            ],
          );
        },
      );
}

class _BarSticker extends StatelessWidget {
  const _BarSticker();

  @override
  Widget build(BuildContext context) => _Row(
        tab: (context, i, selected) {
          final tab = _tabs[i];
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: 28,
                child: selected
                    ? Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Positioned(
                            left: 2,
                            top: 2,
                            child: Icon(tab.fill, size: 26, color: TS.ink),
                          ),
                          Icon(tab.fill, size: 26, color: TS.yellow),
                        ],
                      )
                    : Icon(tab.line, size: 26, color: TS.mutedOf(context)),
              ),
              const SizedBox(height: 3),
              _label(context, tab.label, TS.inkOf(context),
                  weight: selected ? FontWeight.w900 : FontWeight.w700),
            ],
          );
        },
      );
}
