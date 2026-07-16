// Pure unit-price comparison logic for the in-store pack checker.
// A faithful port of the web app's src/services/unitPrice.ts so the mobile
// "pay less at the shelf" tool behaves identically and works fully offline.

enum PackUnit { g, kg, ml, l, each }

enum BaseUnit { kg, litre, each }

class PackDraft {
  const PackDraft({
    required this.id,
    required this.priceText,
    required this.quantityText,
    required this.unit,
  });

  final String id;
  final String priceText;
  final String quantityText;
  final PackUnit unit;
}

class PackResult {
  const PackResult({
    required this.id,
    required this.priceCents,
    required this.quantity,
    required this.unit,
    required this.baseUnit,
    required this.unitPriceCents,
    required this.isBest,
    this.percentMoreThanBest,
  });

  final String id;
  final int priceCents;
  final double quantity;
  final PackUnit unit;
  final BaseUnit baseUnit;
  final int unitPriceCents;
  final bool isBest;
  final int? percentMoreThanBest;
}

class PackComparison {
  const PackComparison({
    required this.results,
    required this.hasMixedUnits,
    this.bestId,
  });

  final List<PackResult> results;
  final bool hasMixedUnits;
  final String? bestId;
}

const Map<PackUnit, BaseUnit> _baseUnitByPackUnit = {
  PackUnit.g: BaseUnit.kg,
  PackUnit.kg: BaseUnit.kg,
  PackUnit.ml: BaseUnit.litre,
  PackUnit.l: BaseUnit.litre,
  PackUnit.each: BaseUnit.each,
};

const Map<PackUnit, double> _baseUnitFactor = {
  PackUnit.g: 1000,
  PackUnit.kg: 1,
  PackUnit.ml: 1000,
  PackUnit.l: 1,
  PackUnit.each: 1,
};

final RegExp _numberPattern = RegExp(r'^\d+(\.\d+)?$');

/// Parses a rand amount like "R24,99" or "24.99" into whole cents.
int? parseRandsToCents(String text) {
  final cleaned = text.replaceAll(RegExp(r'[rR]'), '').replaceAll(RegExp(r'\s'), '').replaceAll(',', '.').trim();

  if (cleaned.isEmpty || !_numberPattern.hasMatch(cleaned)) {
    return null;
  }

  final rands = double.tryParse(cleaned);
  if (rands == null || rands < 0) {
    return null;
  }

  return (rands * 100).round();
}

/// Parses a pack size like "1,5" or "500" into a positive quantity.
double? parseQuantity(String text) {
  final cleaned = text.replaceAll(RegExp(r'\s'), '').replaceAll(',', '.').trim();

  if (cleaned.isEmpty || !_numberPattern.hasMatch(cleaned)) {
    return null;
  }

  final quantity = double.tryParse(cleaned);
  if (quantity == null || quantity <= 0) {
    return null;
  }

  return quantity;
}

/// Compares packs by price per base unit (per kg / per L / each) and flags the
/// cheapest. Mixed base units can't be compared, so nothing is marked best.
PackComparison compareUnitPrices(List<PackDraft> drafts) {
  final parsed = <PackResult>[];

  for (final pack in drafts) {
    final priceCents = parseRandsToCents(pack.priceText);
    final quantity = parseQuantity(pack.quantityText);
    if (priceCents == null || quantity == null) {
      continue;
    }

    final baseUnit = _baseUnitByPackUnit[pack.unit]!;
    final baseQuantity = quantity / _baseUnitFactor[pack.unit]!;

    parsed.add(PackResult(
      id: pack.id,
      priceCents: priceCents,
      quantity: quantity,
      unit: pack.unit,
      baseUnit: baseUnit,
      unitPriceCents: (priceCents / baseQuantity).round(),
      isBest: false,
    ));
  }

  final baseUnits = parsed.map((pack) => pack.baseUnit).toSet();
  final hasMixedUnits = baseUnits.length > 1;

  if (hasMixedUnits || parsed.isEmpty) {
    return PackComparison(hasMixedUnits: hasMixedUnits, results: parsed);
  }

  final bestUnitPrice = parsed.map((pack) => pack.unitPriceCents).reduce((a, b) => a < b ? a : b);
  final best = parsed.firstWhere((pack) => pack.unitPriceCents == bestUnitPrice);

  final results = parsed.map((pack) {
    final isBest = pack.id == best.id;
    return PackResult(
      id: pack.id,
      priceCents: pack.priceCents,
      quantity: pack.quantity,
      unit: pack.unit,
      baseUnit: pack.baseUnit,
      unitPriceCents: pack.unitPriceCents,
      isBest: isBest,
      percentMoreThanBest: isBest || bestUnitPrice == 0
          ? null
          : (((pack.unitPriceCents - bestUnitPrice) / bestUnitPrice) * 100).round(),
    );
  }).toList();

  return PackComparison(bestId: best.id, hasMixedUnits: false, results: results);
}

String formatUnitPrice(int unitPriceCents, BaseUnit baseUnit) {
  final amount = 'R${(unitPriceCents / 100).toStringAsFixed(2)}';
  switch (baseUnit) {
    case BaseUnit.each:
      return '$amount each';
    case BaseUnit.kg:
      return '$amount / kg';
    case BaseUnit.litre:
      return '$amount / L';
  }
}

String packUnitLabel(PackUnit unit) {
  switch (unit) {
    case PackUnit.g:
      return 'g';
    case PackUnit.kg:
      return 'kg';
    case PackUnit.ml:
      return 'ml';
    case PackUnit.l:
      return 'L';
    case PackUnit.each:
      return 'each';
  }
}
