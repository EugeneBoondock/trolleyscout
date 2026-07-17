import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../widgets/common.dart';

class SavedSourcesScreen extends StatefulWidget {
  const SavedSourcesScreen({super.key, required this.api});

  final Api api;

  @override
  State<SavedSourcesScreen> createState() => _SavedSourcesScreenState();
}

class _SavedSourcesScreenState extends State<SavedSourcesScreen> {
  late Future<List<SavedSource>> _future = widget.api.savedSources();

  void _reload() => setState(() => _future = widget.api.savedSources());

  Future<void> _remove(String id) async {
    try {
      final sources = await widget.api.deleteSavedSource(id);
      if (mounted) setState(() => _future = Future.value(sources));
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<SavedSource>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          return ErrorPane(
              message: 'Could not load saved sources.', onRetry: _reload);
        }

        final sources = snapshot.data!;
        final grouped = <String, List<SavedSource>>{};
        for (final source in sources) {
          grouped.putIfAbsent(source.retailerName, () => []).add(source);
        }

        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const ScreenHeader(
              eyebrow: 'Official page watchlist',
              title: 'Saved sources',
              description:
                  'Each item bookmarks the exact official page Trolley Scout checks for deals, catalogues, or store information.',
            ),
            if (sources.isEmpty)
              const EmptyCard(
                  message: 'No saved sources yet.',
                  icon: Icons.bookmark_outline)
            else
              for (final entry in grouped.entries) ...[
                Padding(
                  padding: const EdgeInsets.only(top: 4, bottom: 8),
                  child: Text(entry.key,
                      style: Theme.of(context)
                          .textTheme
                          .titleLarge
                          ?.merge(TS.display)),
                ),
                for (final source in entry.value)
                  PaperCard(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: _SourceLogo(sourceUrl: source.sourceUrl),
                      title: Text(source.sourceLabel,
                          style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text(
                          '${_sourceKindLabel(source.sourceKind)} · saved ${_savedDate(source.createdAt)}'),
                      onTap: () => openExternal(source.sourceUrl),
                      trailing: IconButton(
                        tooltip: 'Remove saved source',
                        onPressed: () => _remove(source.id),
                        icon: const Icon(Icons.delete_outline),
                      ),
                    ),
                  ),
              ],
          ],
        );
      },
    );
  }
}

class _SourceLogo extends StatelessWidget {
  const _SourceLogo({required this.sourceUrl});

  final String sourceUrl;

  @override
  Widget build(BuildContext context) {
    final host = Uri.tryParse(sourceUrl)?.host.replaceFirst('www.', '');
    final url = host == null || host.isEmpty
        ? null
        : 'https://icons.duckduckgo.com/ip3/$host.ico';
    final fallback =
        Icon(Icons.storefront_outlined, color: TS.greenOf(context), size: 28);
    return SizedBox(
      width: 42,
      height: 42,
      child: url == null
          ? fallback
          : Image.network(url,
              fit: BoxFit.contain, errorBuilder: (_, __, ___) => fallback),
    );
  }
}

String _sourceKindLabel(String value) => switch (value) {
      'specials' => 'Specials page',
      'store-finder' => 'Store finder',
      'loyalty' => 'Loyalty page',
      'app' => 'Retailer app',
      _ => 'Official page',
    };

String _savedDate(String value) {
  final date = DateTime.tryParse(value);
  if (date == null) return value;
  return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
}
