import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../theme.dart';
import '../ux.dart';
import '../widgets/scout_mark.dart';

/// "Scroll" — the window-shopping reel. A full-screen vertical feed of deals,
/// one per swipe, TikTok-style: no destination, just the pleasure of the next
/// deal. Pulls image-rich flash deals from the external deal sites and mixes in
/// the platform's own grocery finds, then loops endlessly.
class ScrollFeedScreen extends StatefulWidget {
  const ScrollFeedScreen({super.key, required this.api});

  final Api api;

  @override
  State<ScrollFeedScreen> createState() => _ScrollFeedScreenState();
}

class _ScrollFeedScreenState extends State<ScrollFeedScreen> {
  static const _likesKey = 'scroll_likes_v1';
  final _pageController = PageController();
  List<ScrollDeal> _deals = const [];
  Set<String> _liked = {};
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _restoreLikes();
    _load();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _restoreLikes() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getStringList(_likesKey);
      if (raw != null && mounted) setState(() => _liked = raw.toSet());
    } catch (_) {}
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Deal-site items (image-rich) are the backbone; grocery discovery deals
      // with images add variety. Fetched together, failures degrade gracefully.
      final results = await Future.wait([
        widget.api.dealSites().catchError((_) => <ScrollDeal>[]),
        widget.api
            .discovery()
            .then((r) => r.deals
                .where((d) => d.imageUrl != null)
                .map(ScrollDeal.fromDeal)
                .toList())
            .catchError((_) => <ScrollDeal>[]),
      ]);

      final combined = <ScrollDeal>[
        ...results[0].where((d) => d.hasImage),
        ...results[1],
      ];
      // De-dupe and shuffle for an ever-fresh feel.
      final seen = <String>{};
      final unique = <ScrollDeal>[];
      for (final deal in combined) {
        if (deal.id.isEmpty || seen.add(deal.id)) unique.add(deal);
      }
      unique.shuffle();

      if (!mounted) return;
      setState(() {
        _deals = unique;
        _loading = false;
        _error = unique.isEmpty ? 'No deals to scroll yet. Check back soon.' : null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not load the deal reel. Pull to retry.';
      });
    }
  }

  Future<void> _toggleLike(ScrollDeal deal) async {
    uxSuccess();
    setState(() {
      if (!_liked.add(deal.id)) _liked.remove(deal.id);
    });
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_likesKey, _liked.toList());
    } catch (_) {}
  }

  Future<void> _open(ScrollDeal deal) async {
    final uri = Uri.tryParse(deal.productUrl);
    if (uri == null) return;
    uxTap();
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _share(ScrollDeal deal) async {
    final parts = [
      deal.title,
      if (deal.priceText != null) deal.priceText!,
      'at ${deal.retailerName}',
      deal.productUrl,
      'found on Trolley Scout',
    ];
    final text = Uri.encodeComponent(parts.join(' · '));
    await launchUrl(Uri.parse('https://wa.me/?text=$text'),
        mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(
        child: AnimatedScoutMark(motion: ScoutMarkMotion.spin, size: 44),
      );
    }
    if (_deals.isEmpty) {
      return _EmptyState(message: _error ?? 'Nothing to scroll yet.', onRetry: _load);
    }

    return Stack(
      children: [
        PageView.builder(
          controller: _pageController,
          scrollDirection: Axis.vertical,
          // Endless: cycle through the shuffled deals so the reel never stops.
          onPageChanged: (_) => uxTap(),
          itemBuilder: (context, index) {
            final deal = _deals[index % _deals.length];
            return _ScrollCard(
              deal: deal,
              liked: _liked.contains(deal.id),
              onOpen: () => _open(deal),
              onLike: () => _toggleLike(deal),
              onShare: () => _share(deal),
            );
          },
        ),
        // A quiet hint on the first card so shoppers know to swipe.
        Positioned(
          top: 12,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.45),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text('SCROLL · swipe up for the next deal',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.8)),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _ScrollCard extends StatelessWidget {
  const _ScrollCard({
    required this.deal,
    required this.liked,
    required this.onOpen,
    required this.onLike,
    required this.onShare,
  });

  final ScrollDeal deal;
  final bool liked;
  final VoidCallback onOpen;
  final VoidCallback onLike;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onDoubleTap: onLike,
      child: ColoredBox(
        color: Colors.black,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (deal.hasImage)
              Image.network(
                deal.imageUrl!,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const _ImageFallback(),
                loadingBuilder: (context, child, progress) =>
                    progress == null ? child : const _ImageFallback(),
              )
            else
              const _ImageFallback(),
            // Scrim so text is always legible over any image.
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.transparent,
                    Color(0xCC000000),
                    Color(0xF2000000),
                  ],
                  stops: [0, 0.45, 0.78, 1],
                ),
              ),
            ),
            // Right-side action rail.
            Positioned(
              right: 10,
              bottom: 190,
              child: Column(
                children: [
                  _RailButton(
                    icon: liked ? Icons.favorite : Icons.favorite_border,
                    color: liked ? TS.red : Colors.white,
                    label: 'Like',
                    onTap: onLike,
                  ),
                  const SizedBox(height: 18),
                  _RailButton(
                    icon: Icons.share,
                    color: Colors.white,
                    label: 'Share',
                    onTap: onShare,
                  ),
                ],
              ),
            ),
            // Bottom content.
            Positioned(
              left: 16,
              right: 74,
              bottom: 28,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      _Badge(text: deal.sourceLabel.toUpperCase(), color: TS.yellow, textColor: TS.ink),
                      if (deal.category != null) ...[
                        const SizedBox(width: 6),
                        _Badge(
                            text: deal.category!.toUpperCase(),
                            color: Colors.white24,
                            textColor: Colors.white),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    deal.title,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        height: 1.1),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      if (deal.priceText != null)
                        Text(deal.priceText!,
                            style: const TextStyle(
                                color: TS.yellow,
                                fontSize: 30,
                                fontWeight: FontWeight.w900)),
                      const SizedBox(width: 10),
                      if (deal.previousPriceText != null)
                        Text(deal.previousPriceText!,
                            style: const TextStyle(
                                color: Colors.white70,
                                decoration: TextDecoration.lineThrough,
                                fontSize: 16)),
                    ],
                  ),
                  Row(
                    children: [
                      if (deal.savingText != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4, right: 8),
                          child: _Badge(
                              text: deal.savingText!,
                              color: TS.red,
                              textColor: Colors.white),
                        ),
                      if (_expiryLabel(deal.expiresAt) != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: _Badge(
                              text: _expiryLabel(deal.expiresAt)!,
                              color: Colors.white,
                              textColor: TS.ink),
                        ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: TS.yellow,
                        foregroundColor: TS.ink,
                        shape: const RoundedRectangleBorder(),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      onPressed: onOpen,
                      icon: const Icon(Icons.open_in_new, size: 18),
                      label: Text('View at ${deal.retailerName}',
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String? _expiryLabel(String? expiresAt) {
    if (expiresAt == null) return null;
    final end = DateTime.tryParse(expiresAt);
    if (end == null) return null;
    final now = DateTime.now();
    final diff = end.difference(now);
    if (diff.isNegative) return null;
    if (diff.inHours < 24 && end.day == now.day) return 'ENDS TODAY';
    if (diff.inHours < 48) return 'ENDS SOON';
    if (diff.inDays < 7) return '${diff.inDays} DAYS LEFT';
    return null;
  }
}

class _RailButton extends StatelessWidget {
  const _RailButton({
    required this.icon,
    required this.color,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.4),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: color, size: 26),
          ),
          const SizedBox(height: 3),
          Text(label,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.text, required this.color, required this.textColor});

  final String text;
  final Color color;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      color: color,
      child: Text(text,
          style: TextStyle(
              color: textColor,
              fontSize: 10,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.4)),
    );
  }
}

class _ImageFallback extends StatelessWidget {
  const _ImageFallback();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: Color(0xFF1C1710),
      child: Center(
        child: Icon(Icons.local_offer_outlined, color: Colors.white24, size: 64),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.local_offer_outlined, size: 48, color: TS.mutedOf(context)),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(message,
                textAlign: TextAlign.center,
                style: TextStyle(color: TS.mutedOf(context))),
          ),
          const SizedBox(height: 12),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: TS.yellow, foregroundColor: TS.ink),
            onPressed: onRetry,
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}
