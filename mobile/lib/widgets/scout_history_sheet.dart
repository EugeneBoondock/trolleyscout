import 'package:flutter/material.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

import '../scout_history_store.dart';
import '../theme.dart';
import '../ux.dart';

/// Past conversations with Mr Scout, kept on this phone.
///
/// Returns the one the shopper picked, or null if they closed it.
Future<ScoutConversation?> showScoutHistorySheet(
  BuildContext context,
  ScoutHistoryStore store,
) {
  return showModalBottomSheet<ScoutConversation>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (sheetContext) => _HistorySheet(store: store),
  );
}

class _HistorySheet extends StatefulWidget {
  const _HistorySheet({required this.store});

  final ScoutHistoryStore store;

  @override
  State<_HistorySheet> createState() => _HistorySheetState();
}

class _HistorySheetState extends State<_HistorySheet> {
  late Future<List<ScoutConversation>> _future = widget.store.load();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(10),
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.7,
        ),
        decoration: TS.cardFill(context),
        foregroundDecoration: TS.cardStroke(context),
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Your chats',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w900),
                  ),
                ),
                IconButton(
                  tooltip: 'Close',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded, size: 20),
                ),
              ],
            ),
            Text(
              'Kept on this phone only. Nothing you ask Mr Scout is stored on '
              'a server.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            Flexible(
              child: FutureBuilder<List<ScoutConversation>>(
                future: _future,
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return const Padding(
                      padding: EdgeInsets.symmetric(vertical: 36),
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }
                  final chats = snapshot.data ?? const <ScoutConversation>[];
                  if (chats.isEmpty) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 30),
                      child: Column(
                        children: [
                          Icon(
                            PhosphorIcons.chatCircleText(
                                PhosphorIconsStyle.duotone),
                            size: 34,
                            color: TS.mutedOf(context),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            'No chats yet. Ask Mr Scout something and it will '
                            'show up here.',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    );
                  }
                  return ListView.separated(
                    shrinkWrap: true,
                    itemCount: chats.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 6),
                    itemBuilder: (context, index) {
                      final chat = chats[index];
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(
                          PhosphorIcons.chatCircle(PhosphorIconsStyle.fill),
                          size: 20,
                          color: TS.redOf(context),
                        ),
                        title: Text(
                          chat.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                        subtitle: Text(
                          '${chat.turns.length} messages · '
                          '${_ago(chat.startedAt)}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        onTap: () {
                          uxTap();
                          Navigator.of(context).pop(chat);
                        },
                      );
                    },
                  );
                },
              ),
            ),
            TextButton.icon(
              onPressed: () async {
                uxTap();
                await widget.store.clear();
                if (!mounted) return;
                setState(() => _future = widget.store.load());
              },
              icon: const Icon(Icons.delete_outline, size: 16),
              label: const Text('Clear history'),
            ),
          ],
        ),
      ),
    );
  }
}

String _ago(DateTime when) {
  final gap = DateTime.now().difference(when);
  if (gap.inMinutes < 1) return 'just now';
  if (gap.inHours < 1) return '${gap.inMinutes}m ago';
  if (gap.inDays < 1) return '${gap.inHours}h ago';
  if (gap.inDays == 1) return 'yesterday';
  return '${gap.inDays}d ago';
}
