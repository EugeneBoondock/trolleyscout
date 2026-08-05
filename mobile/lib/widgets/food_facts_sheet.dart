import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../ux.dart';

/// Health facts for a healthy marketplace food: written by the AI the first
/// time anyone asks, then served to every shopper from the shared cache.
Future<void> showFoodFactsSheet(
  BuildContext context,
  Api api,
  String title,
) async {
  uxTap();
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: TS.bgOf(context),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(TS.panelRadius)),
    ),
    builder: (_) => _FoodFactsSheet(api: api, title: title),
  );
}

class _FoodFactsSheet extends StatefulWidget {
  const _FoodFactsSheet({required this.api, required this.title});

  final Api api;
  final String title;

  @override
  State<_FoodFactsSheet> createState() => _FoodFactsSheetState();
}

class _FoodFactsSheetState extends State<_FoodFactsSheet> {
  late Future<FoodFactsInfo> _future = widget.api.foodFacts(widget.title);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 14, 18, 26),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 44,
              height: 4,
              decoration: BoxDecoration(
                color: TS.lineOf(context),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  color: TS.greenOf(context),
                  borderRadius: BorderRadius.circular(TS.controlRadius),
                ),
                child: Icon(
                  Icons.eco_rounded,
                  size: 20,
                  color: Theme.of(context).colorScheme.onTertiary,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('WHY THIS IS A HEALTHY PICK',
                        style: TS.eyebrowOf(context)),
                    Text(
                      widget.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w900),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          FutureBuilder<FoodFactsInfo>(
            future: _future,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 26),
                  child: Center(
                    child: Column(
                      children: [
                        const CircularProgressIndicator(),
                        const SizedBox(height: 12),
                        Text(
                          'Asking the dietitian…',
                          style: TextStyle(color: TS.mutedOf(context)),
                        ),
                      ],
                    ),
                  ),
                );
              }
              final info = snapshot.data;
              if (info == null || !info.available || info.facts.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'No facts for this one yet.',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Try again in a moment — the first look at a food can '
                        'take a few seconds.',
                        style: TextStyle(color: TS.mutedOf(context)),
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: () => setState(() {
                          _future = widget.api.foodFacts(widget.title);
                        }),
                        icon: const Icon(Icons.refresh_rounded, size: 18),
                        label: const Text('Try again'),
                      ),
                    ],
                  ),
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final fact in info.facts)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Icon(Icons.check_circle_outline_rounded,
                                size: 17, color: TS.greenOf(context)),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              fact,
                              style: const TextStyle(fontSize: 14, height: 1.35),
                            ),
                          ),
                        ],
                      ),
                    ),
                  if (info.budgetTip.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Container(
                      key: const Key('food-facts-budget-tip'),
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: TS.yellow,
                        borderRadius: BorderRadius.circular(TS.controlRadius),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('STRETCH YOUR RAND',
                              style: TextStyle(
                                  color: TS.ink,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 0.6)),
                          const SizedBox(height: 3),
                          Text(
                            info.budgetTip,
                            style: const TextStyle(
                                color: TS.ink,
                                fontSize: 13.5,
                                fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 10),
                  Text(
                    'Checked once by Mr Scout, shared with every shopper.',
                    style: TextStyle(color: TS.faintOf(context), fontSize: 11),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
