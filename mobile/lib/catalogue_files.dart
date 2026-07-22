// Catalogue files live on retailer CDNs that often refuse hotlinks or
// forbid framing. The server's /api/catalogue-file endpoint re-fetches them
// with a browser identity and serves them from trolleyscout.co.za, so
// readers fall back to it whenever a direct URL fails.

const String _apiOrigin = 'https://trolleyscout.co.za';

String? catalogueFileUrl(String url) {
  final parsed = Uri.tryParse(url);
  if (parsed == null || parsed.scheme != 'https') return null;
  if (parsed.host == Uri.parse(_apiOrigin).host) return null;
  return '$_apiOrigin/api/catalogue-file?u=${Uri.encodeComponent(parsed.toString())}';
}

/// Direct URLs first (fastest when the CDN allows hotlinks), then the
/// same-origin relay for each, deduped and in order.
List<String> withProxiedFallbacks(Iterable<String> urls) {
  final ordered = <String>[];
  for (final url in urls) {
    final trimmed = url.trim();
    if (trimmed.isNotEmpty && !ordered.contains(trimmed)) ordered.add(trimmed);
  }
  for (final url in List<String>.of(ordered)) {
    final proxied = catalogueFileUrl(url);
    if (proxied != null && !ordered.contains(proxied)) ordered.add(proxied);
  }
  return ordered;
}
