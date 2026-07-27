String canonicalRetailerId(String retailerId, String retailerName) {
  final id = retailerId.trim().toLowerCase();
  final name = _storeWords(retailerName);

  if (_containsWord(name, 'usave') || id == 'shoprite-usave') {
    return 'usave';
  }
  if (name == 'spar' ||
      name.startsWith('spar ') ||
      name.contains(' kwikspar') ||
      name.startsWith('kwikspar') ||
      name.contains(' superspar') ||
      name.startsWith('superspar') ||
      id.startsWith('spar:')) {
    return 'spar';
  }
  if (name == 'ok' ||
      name.startsWith('ok ') ||
      name.startsWith('okfoods') ||
      id == 'ok') {
    return 'ok-foods';
  }
  if (name.contains('food lovers')) return 'food-lovers';
  if (name.contains('roots butchery')) return 'roots-butchery';
  if (name.contains('sneaker factory')) return 'sneaker-factory';
  if (name.contains('sportsmans warehouse') ||
      name.contains('sportsman s warehouse')) {
    return 'sportsmans-warehouse';
  }

  return id;
}

String retailerNameKey(String value) => _storeWords(value);

bool _containsWord(String words, String value) =>
    words == value ||
    words.startsWith('$value ') ||
    words.endsWith(' $value') ||
    words.contains(' $value ');

String _storeWords(String value) => value
    .trim()
    .toLowerCase()
    .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();
