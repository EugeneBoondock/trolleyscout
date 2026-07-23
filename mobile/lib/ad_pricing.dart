// Client mirror of src/services/adPricing.ts. Same formula so the price an
// advertiser sees while choosing reach is exactly what the server charges: the
// server stays authoritative, this only powers the live estimate. The rate card
// itself is fetched from the API and drives the pickers; this file just prices a
// choice locally and formats rand.

import 'widgets/common.dart' show formatMoney;

class AdRateCard {
  const AdRateCard({
    required this.perPersonCents,
    required this.minCents,
    required this.minReach,
    required this.maxReach,
    required this.reachOptions,
    required this.placements,
    required this.provinces,
  });

  final int perPersonCents;
  final int minCents;
  final int minReach;
  final int maxReach;
  final List<int> reachOptions;
  final List<AdPlacementOption> placements;
  final List<String> provinces;

  static const fallback = AdRateCard(
    perPersonCents: 8,
    minCents: 10000,
    minReach: 500,
    maxReach: 100000,
    reachOptions: [1000, 2500, 5000, 10000, 25000],
    placements: [
      AdPlacementOption(id: 'feed', label: 'Deals feed', multiplierPct: 100),
      AdPlacementOption(id: 'near_me', label: 'Near me', multiplierPct: 120),
    ],
    provinces: [
      'Eastern Cape',
      'Free State',
      'Gauteng',
      'KwaZulu-Natal',
      'Limpopo',
      'Mpumalanga',
      'North West',
      'Northern Cape',
      'Western Cape',
    ],
  );

  int clampReach(int reach) {
    if (reach < minReach) return minReach;
    if (reach > maxReach) return maxReach;
    return reach;
  }

  /// The live price estimate for a choice, matching computeAdPriceCents on the
  /// server byte-for-byte.
  int priceCents({required int reach, required String placementId}) {
    final placement = placements.firstWhere(
      (option) => option.id == placementId,
      orElse: () => placements.isNotEmpty
          ? placements.first
          : const AdPlacementOption(id: 'feed', label: 'Deals feed', multiplierPct: 100),
    );
    final clamped = clampReach(reach);
    final raw = (clamped * perPersonCents * placement.multiplierPct / 100).round();
    return raw < minCents ? minCents : raw;
  }

  factory AdRateCard.fromJson(Map<String, dynamic> json) {
    final placements = (json['placements'] as List?)
            ?.whereType<Map>()
            .map((item) =>
                AdPlacementOption.fromJson(Map<String, dynamic>.from(item)))
            .toList() ??
        fallback.placements;
    final reachOptions = (json['reachOptions'] as List?)
            ?.whereType<num>()
            .map((value) => value.toInt())
            .toList() ??
        fallback.reachOptions;
    final provinces = (json['provinces'] as List?)
            ?.whereType<String>()
            .toList() ??
        fallback.provinces;
    return AdRateCard(
      perPersonCents: (json['perPersonCents'] as num?)?.toInt() ?? fallback.perPersonCents,
      minCents: (json['minCents'] as num?)?.toInt() ?? fallback.minCents,
      minReach: (json['minReach'] as num?)?.toInt() ?? fallback.minReach,
      maxReach: (json['maxReach'] as num?)?.toInt() ?? fallback.maxReach,
      reachOptions: reachOptions.isEmpty ? fallback.reachOptions : reachOptions,
      placements: placements.isEmpty ? fallback.placements : placements,
      provinces: provinces.isEmpty ? fallback.provinces : provinces,
    );
  }
}

class AdPlacementOption {
  const AdPlacementOption({
    required this.id,
    required this.label,
    required this.multiplierPct,
  });

  final String id;
  final String label;
  final int multiplierPct;

  factory AdPlacementOption.fromJson(Map<String, dynamic> json) => AdPlacementOption(
        id: json['id']?.toString() ?? 'feed',
        label: json['label']?.toString() ?? 'Deals feed',
        multiplierPct: (json['multiplierPct'] as num?)?.toInt() ?? 100,
      );
}

/// "R2000" for whole rand, "R100.50" when there are cents.
String formatRandFromCents(int cents) => formatMoney(cents);
