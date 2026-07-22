import 'package:flutter/material.dart';

import '../api_models.dart';
import '../theme.dart';
import '../ux.dart';
import 'in_app_browser.dart';

/// A clearly-labelled sponsored slot. Ads pay to appear here, so honesty
/// matters: the "SPONSORED" eyebrow is always shown, the card is visually
/// distinct from real deals, and tapping opens the advertiser's link.
class SponsoredAdCard extends StatelessWidget {
  const SponsoredAdCard({super.key, required this.ad});

  final PublicAd ad;

  Future<void> _open(BuildContext context) async {
    uxTap();
    await showInAppBrowser(context, ad.targetUrl, title: ad.title);
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => _open(context),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: TS.card(context,
            color: TS.surfaceSoftOf(context), border: TS.yellow, width: 2),
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  color: TS.yellow,
                  child: const Text('SPONSORED',
                      style: TextStyle(
                          color: TS.ink,
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.8)),
                ),
                const Spacer(),
                Icon(Icons.open_in_new, size: 14, color: TS.mutedOf(context)),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (ad.imageUrl != null) ...[
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: Image.network(
                      ad.imageUrl!,
                      width: 58,
                      height: 58,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        width: 58,
                        height: 58,
                        color: TS.surfaceOf(context),
                        child: Icon(Icons.campaign_outlined,
                            color: TS.mutedOf(context)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(ad.title,
                          style: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 3),
                      Text(ad.bodyText,
                          style: TextStyle(
                              color: TS.mutedOf(context), fontSize: 13)),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
