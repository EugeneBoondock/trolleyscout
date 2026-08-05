import 'dart:convert';

class AssistedStoreCartItem {
  const AssistedStoreCartItem({
    required this.title,
    required this.productUri,
    required this.quantity,
    this.priceText,
  });

  final String title;
  final Uri productUri;
  final int quantity;
  final String? priceText;

  static AssistedStoreCartItem? tryCreate({
    required String title,
    required String productUrl,
    int quantity = 1,
    String? priceText,
  }) {
    final uri = Uri.tryParse(productUrl.trim());
    final cleanTitle = title.trim();
    if (uri == null ||
        (uri.scheme != 'https' && uri.scheme != 'http') ||
        uri.host.isEmpty ||
        cleanTitle.isEmpty) {
      return null;
    }
    return AssistedStoreCartItem(
      title: cleanTitle,
      productUri: uri,
      quantity: quantity.clamp(1, 99),
      priceText: priceText?.trim(),
    );
  }
}

enum AssistedStoreCartStatus {
  clicked,
  ambiguous,
  noControl,
  noBasketLink,
  invalid,
}

class AssistedStoreCartResult {
  const AssistedStoreCartResult({
    required this.status,
    this.label,
  });

  final AssistedStoreCartStatus status;
  final String? label;

  @override
  bool operator ==(Object other) =>
      other is AssistedStoreCartResult &&
      other.status == status &&
      other.label == label;

  @override
  int get hashCode => Object.hash(status, label);
}

/// Where "proceed to checkout" lives per retailer platform. Most South
/// African storefronts answer at /cart; the exceptions are named. Anything
/// unknown still gets the /cart guess — landing on a 404 inside the assisted
/// browser is recoverable, landing nowhere is not.
const Map<String, String> _checkoutPathByHost = {
  'dischem.co.za': '/checkout/cart',
  'woolworths.co.za': '/check-out',
};

Uri checkoutUriFor(Uri productUri) {
  final host =
      productUri.host.toLowerCase().replaceFirst(RegExp(r'^www\.'), '');
  var path = '/cart';
  for (final entry in _checkoutPathByHost.entries) {
    if (host == entry.key || host.endsWith('.${entry.key}')) {
      path = entry.value;
      break;
    }
  }
  return Uri(scheme: productUri.scheme, host: productUri.host, path: path);
}

bool isSameRetailerSite(Uri current, Uri product) {
  String clean(String host) =>
      host.toLowerCase().replaceFirst(RegExp(r'^www\.'), '');
  final currentHost = clean(current.host);
  final productHost = clean(product.host);
  if (currentHost.isEmpty || productHost.isEmpty) return false;
  return currentHost == productHost ||
      currentHost.endsWith('.$productHost') ||
      productHost.endsWith('.$currentHost');
}

AssistedStoreCartResult parseAssistedStoreCartResult(Object? value) {
  dynamic decoded = value;
  for (var attempt = 0; attempt < 2 && decoded is String; attempt++) {
    try {
      decoded = jsonDecode(decoded);
    } catch (_) {
      break;
    }
  }
  if (decoded is! Map) {
    return const AssistedStoreCartResult(
      status: AssistedStoreCartStatus.invalid,
    );
  }
  final status = switch (decoded['status']) {
    'clicked' => AssistedStoreCartStatus.clicked,
    'ambiguous' => AssistedStoreCartStatus.ambiguous,
    'no-control' => AssistedStoreCartStatus.noControl,
    'no-basket-link' => AssistedStoreCartStatus.noBasketLink,
    _ => AssistedStoreCartStatus.invalid,
  };
  final label = decoded['label'];
  return AssistedStoreCartResult(
    status: status,
    label: label is String && label.trim().isNotEmpty ? label.trim() : null,
  );
}

String assistedAddOneScript() => r'''
(() => {
  const visible = (node) => {
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    if (style.visibility === 'hidden' || style.display === 'none' ||
        rect.width <= 2 || rect.height <= 2) return false;
    const x = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
    const top = document.elementFromPoint(x, y);
    return top === node || (top && node.contains(top));
  };
  const textOf = (node) => [
    node.innerText,
    node.textContent,
    node.getAttribute('aria-label'),
    node.getAttribute('title'),
    node.getAttribute('data-testid'),
    node.value,
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const exactLabels = ['add to cart', 'add to basket', 'add to trolley', 'add to bag'];
  const positive = /\b(add|put)\b.{0,24}\b(cart|basket|trolley|bag)\b/;
  const negative = /wishlist|wish list|save for later|registry|compare|notify|remove/;
  const candidates = [...document.querySelectorAll(
    'button, [role="button"], input[type="button"], input[type="submit"], a'
  )].filter((node) => visible(node) && !node.disabled &&
    node.getAttribute('aria-disabled') !== 'true')
    .map((node) => ({ node, label: textOf(node) }))
    .filter((entry) => positive.test(entry.label) && !negative.test(entry.label))
    .map((entry) => ({
      ...entry,
      score: (exactLabels.includes(entry.label) ? 7 : 0) +
        (/^(add|put).*(cart|basket|trolley|bag)$/.test(entry.label) ? 5 : 0) +
        (entry.node.tagName === 'BUTTON' ? 3 : 0) +
        (/add.to.(cart|basket|trolley|bag)/.test(entry.label) ? 2 : 0),
    }))
    .sort((left, right) => right.score - left.score);
  if (!candidates.length) {
    return JSON.stringify({ status: 'no-control' });
  }
  if (candidates.length > 1 && candidates[0].score === candidates[1].score &&
      candidates[0].label !== candidates[1].label) {
    return JSON.stringify({ status: 'ambiguous', label: candidates[0].label });
  }
  candidates[0].node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  candidates[0].node.click();
  return JSON.stringify({ status: 'clicked', label: candidates[0].label });
})()
''';

String assistedOpenBasketScript() => r'''
(() => {
  const visible = (node) => {
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' &&
      rect.width > 2 && rect.height > 2;
  };
  const links = [...document.querySelectorAll('a[href]')]
    .filter(visible)
    .map((node) => ({
      node,
      label: [node.innerText, node.textContent, node.getAttribute('aria-label'),
        node.getAttribute('title'), node.getAttribute('href')]
        .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase(),
    }))
    .filter((entry) => /\b(cart|basket|trolley|bag)\b/.test(entry.label) &&
      !/add to|remove|wishlist|empty/.test(entry.label));
  if (!links.length) {
    return JSON.stringify({ status: 'no-basket-link' });
  }
  links[0].node.click();
  return JSON.stringify({ status: 'clicked', label: links[0].label });
})()
''';
