import 'package:flutter/material.dart';

import '../store_visit_assistant.dart';
import '../theme.dart';
import '../widgets/common.dart';

class StoreVisitHistoryScreen extends StatelessWidget {
  StoreVisitHistoryScreen({
    super.key,
    StoreVisitPreferences? preferences,
  }) : preferences = preferences ?? StoreVisitPreferences.instance;

  final StoreVisitPreferences preferences;

  Future<void> _clear(BuildContext context) async {
    final confirmed = await confirmAction(
      context,
      title: 'Clear shopping history?',
      message:
          'This removes the store visits kept on this device. It does not change saved receipts.',
      confirmLabel: 'Clear history',
      destructive: true,
    );
    if (confirmed) await preferences.clearHistory();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TS.bgOf(context),
      appBar: AppBar(title: const Text('Shopping visits')),
      body: AnimatedBuilder(
        animation: preferences,
        builder: (context, _) {
          final visits = preferences.visits;
          final frequent = preferences.frequentStores.take(5).toList();
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const ScreenHeader(
                eyebrow: 'On this device',
                title: 'Your shopping visits',
                description:
                    'See stores you return to often. This history stays on your phone and can be cleared here.',
              ),
              if (!preferences.enabled)
                PaperCard(
                  margin: const EdgeInsets.only(bottom: 14),
                  child: Row(
                    children: [
                      Icon(Icons.location_off_outlined,
                          color: TS.mutedOf(context)),
                      const SizedBox(width: 10),
                      const Expanded(
                        child: Text(
                          'In-store Scout is off. Existing visit history remains available.',
                        ),
                      ),
                    ],
                  ),
                ),
              if (visits.isEmpty)
                const EmptyCard(
                  message:
                      'No shopping visits yet. Turn on In-store Scout in Settings to start a private history.',
                  icon: Icons.store_mall_directory_outlined,
                )
              else ...[
                if (frequent.isNotEmpty) ...[
                  Text(
                    'Your regular stores',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.merge(TS.display),
                  ),
                  const SizedBox(height: 8),
                  PaperCard(
                    margin: const EdgeInsets.only(bottom: 18),
                    child: Column(
                      children: [
                        for (var index = 0;
                            index < frequent.length;
                            index++) ...[
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: CircleAvatar(
                              backgroundColor: TS.surfaceSoftOf(context),
                              foregroundColor: TS.redOf(context),
                              child: Text('${index + 1}'),
                            ),
                            title: Text(frequent[index].storeName),
                            subtitle: Text(
                              '${frequent[index].visitCount} ${frequent[index].visitCount == 1 ? 'visit' : 'visits'} · Last ${_dateLabel(frequent[index].lastVisitedAt)}',
                            ),
                          ),
                          if (index < frequent.length - 1)
                            Divider(color: TS.lineSoftOf(context), height: 1),
                        ],
                      ],
                    ),
                  ),
                ],
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Recent visits',
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.merge(TS.display),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: () => _clear(context),
                      icon: const Icon(Icons.delete_sweep_outlined, size: 18),
                      label: const Text('Clear'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                for (final visit in visits)
                  PaperCard(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        visit.isActive
                            ? Icons.storefront
                            : Icons.storefront_outlined,
                        color: visit.isActive
                            ? TS.redOf(context)
                            : TS.mutedOf(context),
                      ),
                      title: Text(visit.storeName),
                      subtitle: Text(
                        [
                          if (visit.address != null) visit.address!,
                          visit.isActive
                              ? 'At this store now · ${_timeLabel(visit.arrivedAt)}'
                              : '${_dateLabel(visit.arrivedAt)} · ${_timeLabel(visit.arrivedAt)}',
                        ].join('\n'),
                      ),
                    ),
                  ),
              ],
            ],
          );
        },
      ),
    );
  }
}

String _dateLabel(DateTime value) {
  final local = value.toLocal();
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final date = DateTime(local.year, local.month, local.day);
  if (date == today) return 'Today';
  if (date == today.subtract(const Duration(days: 1))) return 'Yesterday';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${local.day} ${months[local.month - 1]} ${local.year}';
}

String _timeLabel(DateTime value) {
  final local = value.toLocal();
  final minute = local.minute.toString().padLeft(2, '0');
  return '${local.hour.toString().padLeft(2, '0')}:$minute';
}
