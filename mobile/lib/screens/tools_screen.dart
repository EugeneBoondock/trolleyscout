import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../widgets/auto_compare_tool.dart';
import '../widgets/common.dart';
import '../widgets/shop_compare_tool.dart';

class ToolsScreen extends StatelessWidget {
  const ToolsScreen({super.key, this.api});

  final Api? api;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const ScreenHeader(
          eyebrow: 'Tools',
          title: 'Compare before you buy',
          description:
              'Search the same product across selected stores, or compare a full shopping list side by side.',
        ),
        if (api != null) AutoCompareTool(api: api!),
        const SizedBox(height: 24),
        const ShopCompareTool(),
        const SizedBox(height: 12),
        Text(
          'Prices are checked against available store results. Open a source result to confirm availability before travelling.',
          style: TextStyle(color: TS.mutedOf(context), fontSize: 12),
        ),
      ],
    );
  }
}
