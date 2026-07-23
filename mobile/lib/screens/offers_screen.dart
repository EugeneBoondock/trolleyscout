import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../widgets/common.dart';

class OffersScreen extends StatefulWidget {
  const OffersScreen({super.key, required this.api, required this.canDelete});

  final Api api;
  final bool canDelete;

  @override
  State<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends State<OffersScreen> {
  late Future<List<VerifiedOffer>> _future = widget.api.offers();

  void _reload() => setState(() {
        _future = widget.api.offers();
      });

  Future<void> _delete(VerifiedOffer offer) async {
    final confirmed = await confirmAction(
      context,
      title: 'Delete this offer?',
      message: 'This removes “${offer.title}” from the verified offer board.',
      confirmLabel: 'Delete offer',
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    try {
      await widget.api.deleteOffer(offer.id);
      final offers = await widget.api.offers();
      if (mounted) {
        setState(() {
          _future = Future.value(offers);
        });
      }
    } on ApiException catch (error) {
      if (mounted) showNotice(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<VerifiedOffer>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          final error = snapshot.error;
          return ErrorPane(
            message: 'Could not load verified offers.',
            detail: error is ApiException ? error.message : null,
            onRetry: _reload,
          );
        }
        final offers = snapshot.data!;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const ScreenHeader(
              eyebrow: 'Offer board',
              title: 'Verified offers',
              description:
                  'Date-stamped offers saved only after source and copy checks pass.',
            ),
            if (offers.isEmpty)
              const EmptyCard(
                  message: 'No verified offers are active.',
                  icon: Icons.receipt_long_outlined)
            else
              for (final offer in offers)
                PaperCard(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (offer.imageUrl != null) ...[
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.network(
                            offer.imageUrl!,
                            semanticLabel: offer.title,
                            width: double.infinity,
                            height: 150,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => Container(
                              height: 100,
                              color: TS.surfaceOf(context),
                              child: const Center(
                                child: Icon(Icons.image_not_supported_outlined),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],
                      Text(offer.retailerId.toUpperCase(),
                          style: TS.eyebrowOf(context)),
                      const SizedBox(height: 4),
                      Text(offer.title,
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 16)),
                      if (offer.priceText != null)
                        Text(offer.priceText!,
                            style: TextStyle(
                                color: TS.redOf(context),
                                fontWeight: FontWeight.w900,
                                fontSize: 22)),
                      if (offer.savingText != null)
                        Text(offer.savingText!,
                            style: TextStyle(color: TS.greenOf(context))),
                      if (offer.termsText != null) ...[
                        const SizedBox(height: 6),
                        Text(offer.termsText!,
                            style: TextStyle(color: TS.mutedOf(context))),
                      ],
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          OutlinedButton.icon(
                            onPressed: () => openExternal(offer.sourceUrl),
                            icon: const Icon(Icons.open_in_new),
                            label: const Text('Open source'),
                          ),
                          if (widget.canDelete) ...[
                            const Spacer(),
                            IconButton(
                              tooltip: 'Delete offer',
                              onPressed: () => _delete(offer),
                              icon: const Icon(Icons.delete_outline),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
          ],
        );
      },
    );
  }
}
