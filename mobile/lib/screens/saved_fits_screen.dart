import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../currency.dart';
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

  Future<void> _togglePin(SavedFit fit) async {
    uxTap();
    final fits = await _store.setPinned(fit.id, !fit.pinned);
    if (!mounted) return;
    setState(() => _future = Future.value(fits));
    showNotice(
      context,
      fit.pinned ? 'Unpinned.' : 'Pinned to the top of your fits.',
    );
  }

  Future<void> _openFullScreen(SavedFit fit) async {
    uxTap();
    final bytes = await _store.readImage(fit);
    if (!mounted || bytes == null) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => _FullScreenFit(
        fit: fit,
        bytes: bytes,
        onDownload: () => _download(fit, bytes),
      ),
    ));
  }

  /// Hands the image to the phone's own save/share sheet, which is the route
  /// that works on both platforms without asking for gallery permissions.
  Future<void> _download(SavedFit fit, Uint8List bytes) async {
    try {
      await SharePlus.instance.share(ShareParams(
        files: [XFile(fit.imagePath, mimeType: 'image/png', name: '${fit.id}.png')],
        subject: fit.title,
      ));
    } catch (_) {
      if (mounted) showNotice(context, 'That fit could not be saved.');
    }
  }

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
              onOpen: () => _openFullScreen(fits[index]),
              onTogglePin: () => _togglePin(fits[index]),
            ),
          );
        },
      ),
    );
  }
}

/// One saved look, filling the screen: pinch to zoom, one tap to keep it.
class _FullScreenFit extends StatelessWidget {
  const _FullScreenFit({
    required this.fit,
    required this.bytes,
    required this.onDownload,
  });

  final SavedFit fit;
  final Uint8List bytes;
  final VoidCallback onDownload;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(fit.title, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            key: const Key('download-fit'),
            tooltip: 'Save this fit to your phone',
            onPressed: () {
              uxTap();
              onDownload();
            },
            icon: const Icon(Icons.download_rounded),
          ),
        ],
      ),
      body: Center(
        child: InteractiveViewer(
          key: const Key('full-screen-fit'),
          minScale: 1,
          maxScale: 5,
          child: Image.memory(bytes, fit: BoxFit.contain),
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: SizedBox(
            width: double.infinity,
            height: 48,
            child: FilledButton.icon(
              onPressed: () {
                uxTap();
                onDownload();
              },
              icon: const Icon(Icons.download_rounded, size: 18),
              label: const Text('Save to phone'),
            ),
          ),
        ),
      ),
    );
  }
}

class _SavedFitCard extends StatelessWidget {
  const _SavedFitCard({
    required this.fit,
    required this.readImage,
    required this.onDelete,
    required this.onOpen,
    required this.onTogglePin,
  });

  final SavedFit fit;
  final Future<Uint8List?> Function(SavedFit fit) readImage;
  final VoidCallback onDelete;
  final VoidCallback onOpen;
  final VoidCallback onTogglePin;

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
            child: Semantics(
              button: true,
              label: 'Open ${fit.title} full screen',
              child: GestureDetector(
                onTap: onOpen,
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
                      Row(
                        children: [
                          if (fit.valueCents > 0) ...[
                            Text(
                              Currency.of('ZAR').format(fit.valueCents),
                              style: TextStyle(
                                color: TS.redOf(context),
                                fontSize: 12.5,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(width: 6),
                          ],
                          Flexible(
                            child: Text(
                              _when(fit.savedAt),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  color: TS.mutedOf(context), fontSize: 11.5),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                IconButton(
                  key: Key('pin-fit-${fit.id}'),
                  tooltip: fit.pinned ? 'Unpin this fit' : 'Pin this fit',
                  onPressed: onTogglePin,
                  icon: Icon(
                    fit.pinned
                        ? Icons.push_pin_rounded
                        : Icons.push_pin_outlined,
                    size: 19,
                    color: fit.pinned
                        ? TS.redOf(context)
                        : TS.mutedOf(context),
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
