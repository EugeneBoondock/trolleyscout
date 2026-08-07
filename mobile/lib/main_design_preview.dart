// A design-only entrypoint: renders the real shared widgets and the real
// theme with stub data, so the neo-brutalist system can be reviewed without a
// session. The app itself is a login wall, which makes every screen
// unreachable for visual review; everything on this page is the same code
// those screens are built from, so what is checked here is what ships.
//
// Not part of the shipped app. Run with:
//   flutter run -d chrome -t lib/main_design_preview.dart

import 'package:flutter/material.dart';

import 'theme.dart';
import 'widgets/common.dart';
import 'widgets/neo.dart';

void main() => runApp(const DesignPreviewApp());

class DesignPreviewApp extends StatefulWidget {
  const DesignPreviewApp({super.key});

  @override
  State<DesignPreviewApp> createState() => _DesignPreviewAppState();
}

class _DesignPreviewAppState extends State<DesignPreviewApp> {
  // `?dark` in the URL boots straight into the dark theme, so both themes can
  // be screenshotted without driving the in-canvas toggle.
  var _dark = Uri.base.queryParameters.containsKey('dark');

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: TS.lightTheme(),
        darkTheme: TS.darkTheme(),
        themeMode: _dark ? ThemeMode.dark : ThemeMode.light,
        home: _Gallery(
          dark: _dark,
          onToggleTheme: () => setState(() => _dark = !_dark),
        ),
      );
}

class _Gallery extends StatelessWidget {
  const _Gallery({required this.dark, required this.onToggleTheme});

  final bool dark;
  final VoidCallback onToggleTheme;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 40),
            children: [
              const ScreenHeader(
                eyebrow: 'Design system',
                title: 'Every slab, every edge',
                description:
                    'The shared widgets each of the app\'s screens is built '
                    'from, shown in one place so the system can be judged as '
                    'a system.',
              ),
              OutlinedButton(
                onPressed: onToggleTheme,
                child: Text(dark ? 'Light theme' : 'Dark theme'),
              ),
              const SizedBox(height: 24),
              const NeoSticker(label: 'THE MONEY SHOT'),
              const SizedBox(height: 12),
              PressableScale(
                travel: TS.shadowHero,
                child: PaperCard(
                  color: TS.yellow,
                  shadow: TS.shadowHero,
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('KEPT THIS MONTH',
                          style: TS.eyebrow.copyWith(color: TS.ink)),
                      const SizedBox(height: 10),
                      const NeoNumeral(value: '1 284', unit: 'R', size: 52),
                      const SizedBox(height: 6),
                      const Text('across 31 deals you actually bought',
                          style: TextStyle(
                              color: TS.ink, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 26),
              const NeoSticker(label: 'COLOUR BLOCKS'),
              const SizedBox(height: 12),
              Row(
                children: [
                  for (var i = 0; i < TS.blocks.length; i++) ...[
                    if (i > 0) const SizedBox(width: 10),
                    Expanded(
                      child: PressableScale(
                        child: NeoSlab(
                          color: TS.blockAt(i).fill,
                          padding: const EdgeInsets.symmetric(vertical: 18),
                          child: Center(
                            child: Text(
                              ['Deals', 'Near me', 'Basket', 'Stores'][i],
                              style: TextStyle(
                                color: TS.blockAt(i).on,
                                fontWeight: FontWeight.w900,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 26),
              const NeoSticker(label: 'CARDS & TAGS'),
              const SizedBox(height: 12),
              const PressableScale(
                child: PaperCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text('Clover Fresh Milk 2L',
                                style: TextStyle(
                                    fontWeight: FontWeight.w800, fontSize: 16)),
                          ),
                          NeoTag(label: '-32%', color: TS.red),
                        ],
                      ),
                      SizedBox(height: 10),
                      NeoNumeral(
                          value: '24.99',
                          unit: 'R',
                          size: 30,
                          suffix: 'was 36.99'),
                      SizedBox(height: 12),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          NeoTag(label: 'Checkers'),
                          NeoTag(label: 'Ends Sunday', color: TS.rentTag),
                          NeoTag(label: 'In your basket', color: TS.green),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 26),
              const NeoSticker(label: 'CONTROLS'),
              const SizedBox(height: 12),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  FilledButton(
                      onPressed: () {}, child: const Text('Save deal')),
                  OutlinedButton(
                      onPressed: () {}, child: const Text('Compare')),
                  TextButton(onPressed: () {}, child: const Text('Skip')),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                children: [
                  for (final label in ['All', 'Food', 'Household', 'Baby'])
                    FilterChip(
                      label: Text(label),
                      selected: label == 'Food',
                      onSelected: (_) {},
                    ),
                ],
              ),
              const SizedBox(height: 12),
              const TextField(
                decoration: InputDecoration(
                  labelText: 'Search deals',
                  hintText: 'milk, bread, nappies',
                ),
              ),
              const SizedBox(height: 26),
              const NeoSticker(label: 'EMPTY & ERROR'),
              const SizedBox(height: 12),
              EmptyCard(
                message: 'No saved deals yet.\nTap the heart on anything good.',
                action: FilledButton(
                    onPressed: () {}, child: const Text('Browse deals')),
              ),
              const SizedBox(height: 12),
              PaperCard(
                child: ErrorPane(
                    message: 'Could not reach the shops.', onRetry: () {}),
              ),
              const SizedBox(height: 26),
              const NeoSticker(label: 'METRICS'),
              const SizedBox(height: 12),
              const MetricCard(
                  label: 'Deals watched', value: '18', icon: Icons.visibility),
              const SizedBox(height: 10),
              const MetricCard(
                  label: 'Stores nearby', value: '7', icon: Icons.storefront),
            ],
          ),
        ),
      );
}
