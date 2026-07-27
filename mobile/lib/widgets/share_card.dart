import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api_models.dart';
import '../price_display.dart';
import '../theme.dart';
import '../ux.dart';
import 'share_image_file.dart';

/// Captured at 3x, [DealShareCard]'s 360x450 logical card lands on a 1080x1350
/// PNG — the portrait ratio WhatsApp, Instagram and X all show uncropped.
const double shareCardPixelRatio = 3.0;

/// How long we wait for the artwork to decode before offering the share
/// button anyway. A slow shop photo should delay the card, never block it.
const Duration _artworkWarmUpTimeout = Duration(seconds: 6);

/// Everything the shareable card paints, independent of the feed an item came
/// from — grocery deals, window-shopping finds and property listings all fold
/// into this one shape so there is a single card design to maintain.
@immutable
class ShareCardData {
  const ShareCardData({
    required this.eyebrow,
    required this.title,
    required this.sourceName,
    this.priceText,
    this.previousPriceText,
    this.badgeText,
    this.subtitle,
    this.imageUrl,
    this.link,
    this.imageFit = BoxFit.contain,
    this.fallbackIcon = Icons.local_offer_outlined,
    this.sourcePreposition = 'at',
    this.noun = 'deal',
    this.soldOut = false,
  });

  /// A grocery special or discovery find. [imageUrl] overrides the deal's own
  /// cover for feeds that carry a richer gallery.
  factory ShareCardData.fromDeal(Deal deal, {String? imageUrl}) =>
      ShareCardData(
        eyebrow: 'DEAL',
        title: deal.title,
        sourceName: deal.retailerName,
        priceText: deal.priceText,
        // Feeds emit R0.00 as their "no previous price" marker; showing it
        // would read as a broken deal, so reuse the shared sanity check.
        previousPriceText:
            meaningfulWasPrice(deal.previousPriceText, deal.priceText),
        badgeText: deal.savingText,
        imageUrl: _trimToNull(imageUrl ?? deal.imageUrl),
        link: _safeLink(deal.productUrl ?? deal.sourceUrl),
        // A shared card outlives the moment it was made and reaches people who
        // never opened the app. If the thing is gone, the picture has to say so
        // too, or the share sends someone else out for nothing.
        soldOut: deal.soldOut,
      );

  /// A Window Shopping find — the reel keeps its gallery separate from the
  /// single cover image, so take the first frame of whichever it has.
  factory ShareCardData.fromScrollDeal(ScrollDeal deal) =>
      ShareCardData.fromDeal(
        deal.toDeal(),
        imageUrl: deal.hasImage ? deal.gallery.first : null,
      );

  factory ShareCardData.fromCatalogue(Catalogue catalogue) {
    final parameters = <String, String>{
      if (catalogue.id?.trim().isNotEmpty == true)
        'catalogue': catalogue.id!.trim(),
      if (catalogue.retailerId?.trim().isNotEmpty == true)
        'retailer': catalogue.retailerId!.trim(),
    };
    final link =
        Uri.https('trolleyscout.co.za', '/deals', parameters).toString();
    return ShareCardData(
      eyebrow: 'CATALOGUE',
      title: catalogue.name,
      sourceName: catalogue.retailerName ?? 'Trolley Scout',
      badgeText:
          catalogue.validTo == null ? null : 'Valid until ${catalogue.validTo}',
      imageUrl: catalogue.coverImageUrl,
      link: link,
      fallbackIcon: Icons.menu_book_outlined,
      noun: 'catalogue',
      sourcePreposition: 'from',
    );
  }

  /// A Properties Scout listing. Homes are photographed, not cut out, so the
  /// artwork fills its frame instead of sitting on a plate.
  factory ShareCardData.fromProperty(PropertyListing listing) => ShareCardData(
        eyebrow: listing.listingType == 'rent' ? 'TO RENT' : 'FOR SALE',
        title: listing.title,
        sourceName: listing.portalName,
        priceText: listing.priceText ?? 'Price on application',
        badgeText: _propertyFeatures(listing),
        subtitle: _propertyPlace(listing),
        imageUrl: listing.hasImage ? listing.gallery.first : null,
        link: _safeLink(listing.listingUrl),
        imageFit: BoxFit.cover,
        fallbackIcon: Icons.home_outlined,
        sourcePreposition: 'on',
        noun: 'home',
      );

  /// The small caps tag in the card's top-left — "DEAL", "FOR SALE".
  final String eyebrow;
  final String title;

  /// The retailer or portal the item came from.
  final String sourceName;
  final String? priceText;

  /// Only ever a "was" price worth showing — callers filter out feed noise.
  final String? previousPriceText;

  /// The accent chip beside the price: a saving for deals, bed/bath for homes.
  final String? badgeText;

  /// Whether the shop said this can no longer be bought.
  final bool soldOut;

  /// A quiet second line under the title — a suburb, an area.
  final String? subtitle;
  final String? imageUrl;

  /// The validated https link that rides in the caption, when there is one.
  final String? link;

  /// Product cut-outs read better contained on a plate; photos fill the frame.
  final BoxFit imageFit;
  final IconData fallbackIcon;

  /// How the source reads in the caption — "at Checkers", "on Property24".
  final String sourcePreposition;

  /// What this card is, for the sheet's copy — "deal", "home".
  final String noun;

  /// The caption that rides with the image, and the whole message when only a
  /// link can be shared.
  String get shareText => [
        title,
        if (priceText != null) priceText!,
        '$sourcePreposition $sourceName',
        if (link != null) link!,
        'found on https://trolleyscout.co.za',
      ].join(' · ');

  /// A recognisable name for the shared PNG, so it reads well in a chat thread.
  String get fileName {
    final slug = title
        .toLowerCase()
        .replaceAll(RegExp('[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');
    final trimmed = (slug.length > 40 ? slug.substring(0, 40) : slug)
        .replaceAll(RegExp(r'-+$'), '');
    return 'trolley-scout-${trimmed.isEmpty ? noun : trimmed}.png';
  }

  static String? _trimToNull(String? value) {
    final trimmed = value?.trim();
    return trimmed == null || trimmed.isEmpty ? null : trimmed;
  }

  /// Only real web links belong in a caption — anything else (an app scheme, a
  /// relative path) would land as noise in someone's chat.
  static String? _safeLink(String? value) {
    final trimmed = _trimToNull(value);
    if (trimmed == null) return null;
    final uri = Uri.tryParse(trimmed);
    if (uri == null || uri.host.isEmpty) return null;
    return uri.scheme == 'https' || uri.scheme == 'http'
        ? uri.toString()
        : null;
  }

  static String? _propertyPlace(PropertyListing listing) {
    final parts = [
      if (listing.location != null) listing.location!,
      if (listing.province != null) listing.province!,
    ].where((part) => part.trim().isNotEmpty).toList();
    return parts.isEmpty ? null : parts.join(', ');
  }

  /// Bed/bath, the pair every portal leads with. Bathrooms may be a half (an
  /// en-suite), so they are trimmed rather than floored.
  static String? _propertyFeatures(PropertyListing listing) {
    final baths = listing.bathrooms;
    final parts = [
      if (listing.bedrooms != null) '${listing.bedrooms} bed',
      if (baths != null) '${baths % 1 == 0 ? baths.toInt() : baths} bath',
    ];
    return parts.isEmpty ? null : parts.join(' · ');
  }
}

/// Opens the Spotify-style share flow: preview the card first, then hand it to
/// the platform share sheet. Returns once the sheet closes.
Future<void> showShareCardSheet(BuildContext context, ShareCardData data) {
  uxTap();
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: TS.bgOf(context),
    isScrollControlled: true,
    clipBehavior: Clip.antiAlias,
    shape: RoundedRectangleBorder(
      borderRadius: const BorderRadius.vertical(
        top: Radius.circular(TS.panelRadius),
      ),
      side: BorderSide(color: TS.lineOf(context), width: 2),
    ),
    builder: (context) => _ShareCardSheet(data: data),
  );
}

/// Renders the card behind [boundaryKey] to a high-quality PNG, writes it to a
/// temp file and hands it to the platform share sheet with [data]'s caption.
///
/// Returns false — rather than throwing — whenever any link in that chain fails
/// (no boundary, a device that refuses the raster, no share sheet), so callers
/// can fall back to sharing the plain link. Sharing must never be a dead end,
/// and never a crash.
Future<bool> captureAndShareCard({
  required GlobalKey boundaryKey,
  required ShareCardData data,
  Rect? sharePositionOrigin,
}) async {
  try {
    final boundary = boundaryKey.currentContext?.findRenderObject();
    if (boundary is! RenderRepaintBoundary) return false;
    // The card is already on screen in the preview, but let the frame in
    // flight finish so we never capture a half-painted layer.
    await WidgetsBinding.instance.endOfFrame;
    final image = await boundary.toImage(pixelRatio: shareCardPixelRatio);
    final ByteData? png;
    try {
      png = await image.toByteData(format: ui.ImageByteFormat.png);
    } finally {
      image.dispose();
    }
    if (png == null) return false;
    final file = await writeShareImage(png.buffer.asUint8List(), data.fileName);
    await SharePlus.instance.share(ShareParams(
      files: [file],
      text: data.shareText,
      subject: data.title,
      sharePositionOrigin: sharePositionOrigin,
    ));
    return true;
  } catch (_) {
    // Handled by the caller: it shares the plain link instead.
    return false;
  }
}

/// The lightweight fallback: caption plus link through the same native sheet.
/// When no share sheet exists we hand off to WhatsApp, which is how deals have
/// always travelled between South African households. Returns false only when
/// even that fails, so the caller can say so out loud.
Future<bool> shareCardLink(
  ShareCardData data, {
  Rect? sharePositionOrigin,
}) async {
  try {
    await SharePlus.instance.share(ShareParams(
      text: data.shareText,
      subject: data.title,
      sharePositionOrigin: sharePositionOrigin,
    ));
    return true;
  } catch (_) {
    // No native sheet here — fall through to the WhatsApp hand-off below.
  }
  try {
    return await launchUrl(
      Uri.parse('https://wa.me/?text=${Uri.encodeComponent(data.shareText)}'),
      mode: LaunchMode.externalApplication,
    );
  } catch (_) {
    return false;
  }
}

/// The preview sheet: the card as it will be sent, then the two ways to send
/// it. Previewing first is what makes the image feel like a keepsake rather
/// than a surprise attachment — and it gives the capture a live, painted
/// boundary to read from.
class _ShareCardSheet extends StatefulWidget {
  const _ShareCardSheet({required this.data});

  final ShareCardData data;

  @override
  State<_ShareCardSheet> createState() => _ShareCardSheetState();
}

class _ShareCardSheetState extends State<_ShareCardSheet> {
  final _boundaryKey = GlobalKey();
  bool _warmed = false;
  bool _artworkSettled = false;
  bool _busy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Inherited widgets are off limits in initState, and precacheImage needs
    // them — warm the artwork here instead, once.
    if (_warmed) return;
    _warmed = true;
    _warmArtwork();
  }

  /// Decodes the artwork before the shopper can press share, so the captured
  /// PNG never catches the image mid-load.
  Future<void> _warmArtwork() async {
    final url = widget.data.imageUrl;
    if (url != null) {
      try {
        await precacheImage(NetworkImage(url), context)
            .timeout(_artworkWarmUpTimeout);
      } on TimeoutException {
        // Share anyway: the card falls back to its plate.
      } catch (_) {
        // A missing or broken photo is not a failure — same fallback.
      }
    }
    if (mounted) setState(() => _artworkSettled = true);
  }

  /// iPads and Macs anchor the share popover to whatever opened it; without an
  /// origin the platform sheet has nowhere to point.
  Rect? _shareOrigin() {
    final box = context.findRenderObject();
    if (box is! RenderBox || !box.hasSize) return null;
    return box.localToGlobal(Offset.zero) & box.size;
  }

  Future<void> _shareImage() async {
    if (_busy || !_artworkSettled) return;
    uxTap();
    setState(() => _busy = true);
    final origin = _shareOrigin();
    final shared = await captureAndShareCard(
      boundaryKey: _boundaryKey,
      data: widget.data,
      sharePositionOrigin: origin,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    // Capture is best-effort: if the device refused it, still get the deal out.
    if (!shared) {
      await _shareLink(silent: true);
      return;
    }
    Navigator.of(context).maybePop();
  }

  Future<void> _shareLink({bool silent = false}) async {
    if (_busy && !silent) return;
    if (!silent) uxTap();
    setState(() => _busy = true);
    final sent = await shareCardLink(
      widget.data,
      sharePositionOrigin: _shareOrigin(),
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (sent) {
      Navigator.of(context).maybePop();
      return;
    }
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(content: Text('Could not open the share sheet.')),
      );
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;
    return SafeArea(
      top: false,
      bottom: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 10, 16, 16 + bottomInset),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: TS.lineSoftOf(context),
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Text('Share this ${widget.data.noun}',
                style:
                    Theme.of(context).textTheme.titleLarge?.merge(TS.display)),
            const SizedBox(height: 2),
            Text(
              'Send the card, or just the link.',
              style: TextStyle(color: TS.mutedOf(context), fontSize: 13),
            ),
            const SizedBox(height: 14),
            // The card is laid out at its true size and only scaled for the
            // preview, so the capture below still reads a full-size boundary.
            Flexible(
              child: Center(
                child: FittedBox(
                  fit: BoxFit.contain,
                  child: RepaintBoundary(
                    key: _boundaryKey,
                    child: DealShareCard(data: widget.data),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              key: const Key('share-card-image'),
              style: FilledButton.styleFrom(
                minimumSize: const Size(0, 52),
                backgroundColor: TS.yellow,
                foregroundColor: TS.ink,
              ),
              onPressed: _artworkSettled && !_busy ? _shareImage : null,
              icon: _busy || !_artworkSettled
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: TS.ink),
                    )
                  : const Icon(Icons.ios_share, size: 20),
              label: Text(_artworkSettled
                  ? (_busy ? 'Preparing…' : 'Share image')
                  : 'Preparing card…'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              key: const Key('share-card-link'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 48),
                foregroundColor: TS.inkOf(context),
                side: BorderSide(color: TS.lineOf(context), width: 2),
              ),
              onPressed: _busy ? null : _shareLink,
              icon: const Icon(Icons.link, size: 20),
              label: const Text('Share link only'),
            ),
          ],
        ),
      ),
    );
  }
}

/// The poster shoppers actually send. Portrait, image-led, price loud, branded
/// at the foot — the shape Spotify and Uber taught everyone to recognise.
///
/// Text scaling is pinned inside the card because the result is a picture, not
/// a screen: it must lay out identically on every phone that sends it.
class DealShareCard extends StatelessWidget {
  const DealShareCard({super.key, required this.data});

  /// Logical size of the card. At [shareCardPixelRatio] this is a 1080x1350 PNG.
  static const double width = 360;
  static const double height = 450;

  final ShareCardData data;

  @override
  Widget build(BuildContext context) {
    return MediaQuery.withNoTextScaling(
      child: SizedBox(
        width: width,
        height: height,
        // The page colour fills the PNG's corners, so the shared image never
        // arrives with transparent edges that chat apps paint black.
        child: ColoredBox(
          color: TS.bgOf(context),
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Container(
              decoration: BoxDecoration(
                color: TS.surfaceOf(context),
                border: Border.all(color: TS.lineOf(context), width: 2),
                borderRadius: BorderRadius.circular(TS.panelRadius),
              ),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _CardHeader(data: data),
                  const SizedBox(height: 12),
                  Expanded(child: _CardArtwork(data: data)),
                  const SizedBox(height: 12),
                  Text(
                    data.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: TS.inkOf(context),
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      height: 1.18,
                    ),
                  ),
                  if (data.subtitle != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      data.subtitle!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                  const SizedBox(height: 10),
                  _CardPriceRow(data: data),
                  const SizedBox(height: 12),
                  Container(height: 1.5, color: TS.lineSoftOf(context)),
                  const SizedBox(height: 10),
                  const _CardFooter(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CardHeader extends StatelessWidget {
  const _CardHeader({required this.data});

  final ShareCardData data;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: TS.yellow,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              data.eyebrow,
              style: const TextStyle(
                color: TS.ink,
                fontSize: 10,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.1,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              data.sourceName.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.right,
              style: TS.eyebrowOf(context).copyWith(fontSize: 11),
            ),
          ),
        ],
      );
}

/// The product photo or home shot, rounded on its own plate. A missing or
/// broken image must never break the card — the plate and its icon stand in
/// and the deal still reads.
class _CardArtwork extends StatelessWidget {
  const _CardArtwork({required this.data});

  final ShareCardData data;

  @override
  Widget build(BuildContext context) {
    final url = data.imageUrl;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: TS.surfaceSoftOf(context),
        borderRadius: BorderRadius.circular(TS.cardRadius),
      ),
      foregroundDecoration: BoxDecoration(
        border: Border.all(color: TS.lineSoftOf(context), width: 1.5),
        borderRadius: BorderRadius.circular(TS.cardRadius),
      ),
      child: SizedBox.expand(
        child: url == null
            ? _fallback(context)
            : Image.network(
                url,
                fit: data.imageFit,
                errorBuilder: (context, _, __) => _fallback(context),
              ),
      ),
    );
  }

  Widget _fallback(BuildContext context) => Center(
        child: Icon(data.fallbackIcon, size: 56, color: TS.faintOf(context)),
      );
}

class _CardPriceRow extends StatelessWidget {
  const _CardPriceRow({required this.data});

  final ShareCardData data;

  @override
  Widget build(BuildContext context) {
    final was = data.previousPriceText;
    final badge = data.badgeText;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (data.priceText != null)
                Flexible(
                  child: Text(
                    data.priceText!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: TS.redOf(context),
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                      height: 1.05,
                      letterSpacing: -0.4,
                    ),
                  ),
                ),
              if (was != null) ...[
                const SizedBox(width: 8),
                Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text(
                    was,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: TS.faintOf(context),
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      decoration: TextDecoration.lineThrough,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        // Sold out takes the badge slot when it applies. A saving on something
        // nobody can buy is not the news; that it is gone is.
        if (data.soldOut) ...[
          const SizedBox(width: 8),
          Container(
            key: const ValueKey('share-card-sold-out'),
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(
              color: TS.ink,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Text(
              'SOLD OUT',
              maxLines: 1,
              style: TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.5,
              ),
            ),
          ),
        ] else if (badge != null) ...[
          const SizedBox(width: 8),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 128),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(
                color: TS.yellow,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                badge,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: TS.ink,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// The brand lock-up and the call to action, in one line of chrome: whoever
/// receives this card should know where it came from without reading twice.
class _CardFooter extends StatelessWidget {
  const _CardFooter();

  @override
  Widget build(BuildContext context) => Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: Image.asset(
              'assets/scout-logo.png',
              width: 28,
              height: 28,
              fit: BoxFit.contain,
              excludeFromSemantics: true,
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'FOUND ON TROLLEY SCOUT',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: TS.inkOf(context),
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.2,
                    height: 1.15,
                  ),
                ),
                Text(
                  'trolleyscout.co.za',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: TS.mutedOf(context),
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
        ],
      );
}
