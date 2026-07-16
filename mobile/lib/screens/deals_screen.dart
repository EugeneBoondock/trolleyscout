import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../theme.dart';

class DealsScreen extends StatefulWidget {
  const DealsScreen({super.key, required this.api});
  final Api api;

  @override
  State<DealsScreen> createState() => _DealsScreenState();
}

class _DealsScreenState extends State<DealsScreen> {
  static const _perPage = 24;
  Future<List<Deal>>? _future;
  int _page = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _future = widget.api.deals().then(_sortByPage);
  }

  /// Grouped by retailer, then in catalogue page order — matching the web app.
  List<Deal> _sortByPage(List<Deal> deals) {
    final sorted = [...deals];
    sorted.sort((a, b) {
      if (a.retailerName != b.retailerName) {
        return a.retailerName.compareTo(b.retailerName);
      }
      return (a.pageNumber ?? 1 << 30).compareTo(b.pageNumber ?? 1 << 30);
    });
    return sorted;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Deal>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator(color: TS.red));
        }
        if (snap.hasError || snap.data == null) {
          return _retry();
        }

        final deals = snap.data!;
        if (deals.isEmpty) return _retry(message: 'No deals right now. Pull to refresh.');

        final pageCount = (deals.length / _perPage).ceil();
        final page = _page.clamp(0, pageCount - 1);
        final slice = deals.skip(page * _perPage).take(_perPage).toList();

        return RefreshIndicator(
          color: TS.red,
          onRefresh: () async => setState(() {
            _page = 0;
            _load();
          }),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text('DEAL FINDER', style: TS.eyebrow),
              const SizedBox(height: 4),
              const Text('Source-backed specials',
                  style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
              const SizedBox(height: 12),
              for (final deal in slice) _DealRow(deal: deal),
              if (pageCount > 1)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      OutlinedButton(
                        onPressed: page == 0 ? null : () => setState(() => _page = page - 1),
                        child: const Text('Previous'),
                      ),
                      Text('Page ${page + 1} of $pageCount',
                          style: const TextStyle(color: TS.muted, fontWeight: FontWeight.w700)),
                      OutlinedButton(
                        onPressed: page >= pageCount - 1 ? null : () => setState(() => _page = page + 1),
                        child: const Text('Next'),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _retry({String message = 'Could not load deals.'}) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(message, style: const TextStyle(color: TS.muted)),
          const SizedBox(height: 12),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: TS.yellow, foregroundColor: TS.ink),
            onPressed: () => setState(_load),
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

class _DealRow extends StatelessWidget {
  const _DealRow({required this.deal});
  final Deal deal;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: deal.productUrl == null
          ? null
          : () => launchUrl(Uri.parse(deal.productUrl!), mode: LaunchMode.externalApplication),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: TS.card(width: 2),
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(deal.retailerName.toUpperCase(), style: TS.eyebrow),
                if (deal.pageNumber != null) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(border: Border.all(color: TS.lineSoft, width: 1.5)),
                    child: Text('Page ${deal.pageNumber}',
                        style: const TextStyle(fontSize: 10, color: TS.muted, fontWeight: FontWeight.w800)),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 4),
            Text(deal.title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                if (deal.priceText != null)
                  Text(deal.priceText!,
                      style: const TextStyle(color: TS.red, fontSize: 20, fontWeight: FontWeight.w900)),
                const SizedBox(width: 8),
                if (deal.previousPriceText != null)
                  Text(deal.previousPriceText!,
                      style: const TextStyle(
                          color: TS.faint, decoration: TextDecoration.lineThrough, fontSize: 13)),
              ],
            ),
            if (deal.savingText != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(deal.savingText!, style: const TextStyle(color: TS.muted, fontSize: 12)),
              ),
          ],
        ),
      ),
    );
  }
}
