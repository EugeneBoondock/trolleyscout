import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../saved_fits_store.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/common.dart';

/// Every look the shopper kept — a private wardrobe that never leaves the
/// phone.
class SavedFitsScreen extends StatefulWidget {
  const SavedFitsScreen({super.key, this.store});

  /// Test seam — widget tests inject an in-memory store because real file I/O
  /// never completes inside their fake-async zone.
  final SavedFitsStore? store;

  @override
  State<SavedFitsScreen> createState() => _SavedFitsScreenState();
}

class _SavedFitsScreenState extends State<SavedFitsScreen> {
  late final SavedFitsStore _store = widget.store ?? SavedFitsStore();
  late Future<List<SavedFit>> _future = _store.load();

  Future<void> _remove(SavedFit fit) async {
    final confirmed = await confirmAction(
      context,
      title: 'Delete this fit?',
      message: 'It is only on this phone, so this removes the only copy.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!confirmed) return;
    final fits = await _store.remove(fit.id);
    if (!mounted) return;
    setState(() => _future = Future.value(fits));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Saved fits')),
      body: FutureBuilder<List<SavedFit>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const LoadingPane();
          }
          final fits = snapshot.data ?? const <SavedFit>[];
          if (fits.isEmpty) {
            return ListView(
              padding: const EdgeInsets.all(16),
              children: const [
                EmptyCard(
                  icon: Icons.bookmark_border_rounded,
                  message: 'No saved fits yet. Try something on and tap '
                      '"Save this fit" to keep the look here.',
                ),
              ],
            );
          }
          return GridView.builder(
            padding: const EdgeInsets.all(16),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 220,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              mainAxisExtent: 290,
            ),
            itemCount: fits.length,
            itemBuilder: (context, index) => _SavedFitCard(
              fit: fits[index],
              readImage: _store.readImage,
              onDelete: () => _remove(fits[index]),
            ),
          );
        },
      ),
    );
  }
}

class _SavedFitCard extends StatelessWidget {
  const _SavedFitCard({
    required this.fit,
    required this.readImage,
    required this.onDelete,
  });

  final SavedFit fit;
  final Future<Uint8List?> Function(SavedFit fit) readImage;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: TS.cardFill(context),
      foregroundDecoration: TS.cardStroke(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: FutureBuilder<Uint8List?>(
              future: readImage(fit),
              builder: (context, snapshot) {
                final bytes = snapshot.data;
                if (bytes == null) {
                  return Container(
                    color: TS.surfaceSoftOf(context),
                    alignment: Alignment.center,
                    child: Icon(Icons.checkroom_outlined,
                        size: 36, color: TS.mutedOf(context)),
                  );
                }
                return SizedBox(
                  width: double.infinity,
                  child: Image.memory(bytes, fit: BoxFit.cover),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 6, 6),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        fit.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 13),
                      ),
                      Text(
                        _when(fit.savedAt),
                        style: TextStyle(
                            color: TS.mutedOf(context), fontSize: 11.5),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Delete this fit',
                  onPressed: () {
                    uxTap();
                    onDelete();
                  },
                  icon: Icon(Icons.delete_outline_rounded,
                      size: 20, color: TS.mutedOf(context)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _when(DateTime savedAt) {
    final difference = DateTime.now().difference(savedAt);
    if (difference.inMinutes < 1) return 'Just now';
    if (difference.inHours < 1) return '${difference.inMinutes} min ago';
    if (difference.inDays < 1) return '${difference.inHours} h ago';
    if (difference.inDays == 1) return 'Yesterday';
    if (difference.inDays < 7) return '${difference.inDays} days ago';
    return '${savedAt.year}-${savedAt.month.toString().padLeft(2, '0')}-'
        '${savedAt.day.toString().padLeft(2, '0')}';
  }
}
