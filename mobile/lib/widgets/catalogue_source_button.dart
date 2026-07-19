import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

typedef CatalogueUriOpener = Future<void> Function(Uri uri);

Future<void> launchCatalogueSource(Uri uri) async {
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

Uri? catalogueSourceUri(String? value) {
  final uri = value == null ? null : Uri.tryParse(value.trim());
  if (uri == null ||
      (uri.scheme != 'https' && uri.scheme != 'http') ||
      uri.host.isEmpty) {
    return null;
  }
  return uri;
}

class CatalogueSourceButton extends StatelessWidget {
  const CatalogueSourceButton({
    super.key,
    required this.sourceUrl,
    this.openExternal = launchCatalogueSource,
  });

  final String? sourceUrl;
  final CatalogueUriOpener openExternal;

  @override
  Widget build(BuildContext context) {
    final uri = catalogueSourceUri(sourceUrl);
    if (uri == null) return const SizedBox.shrink();

    return SizedBox(
      width: double.infinity,
      child: FilledButton.icon(
        onPressed: () => openExternal(uri),
        icon: const Icon(Icons.open_in_new),
        label: const Text('Open official source'),
      ),
    );
  }
}
