class AuthDraft {
  const AuthDraft.login({required this.email, required this.password})
      : intent = 'login',
        displayName = '';

  const AuthDraft.signUp({
    required this.displayName,
    required this.email,
    required this.password,
  }) : intent = 'signup';

  final String intent;
  final String displayName;
  final String email;
  final String password;

  Map<String, dynamic> toJson() => {
        'intent': intent,
        'displayName': displayName,
        'email': email,
        'password': password,
      };
}

class MemberAccount {
  const MemberAccount({
    required this.id,
    required this.email,
    required this.displayName,
    required this.initials,
    required this.planId,
    required this.planName,
    required this.planStatus,
    required this.role,
    required this.propertiesAccess,
    required this.createdAt,
    required this.updatedAt,
    this.billingCycle,
    this.pendingPlanId,
    this.pendingEffectiveAt,
  });

  final String id;
  final String email;
  final String displayName;
  final String initials;
  final String planId;
  final String planName;
  final String planStatus;
  final String role;
  final bool propertiesAccess;
  final String createdAt;
  final String updatedAt;
  // The cycle this member is actually billed on. Null for free members and for
  // plans an admin granted directly, where there is no subscription behind it.
  final String? billingCycle;
  // A downgrade the member queued. They keep the plan above until this date,
  // so the app must show what they still have, not what is coming.
  final String? pendingPlanId;
  final String? pendingEffectiveAt;

  bool get isAdmin => role == 'admin';

  bool get hasScheduledPlanChange =>
      pendingPlanId != null && pendingEffectiveAt != null;

  factory MemberAccount.fromJson(Map<String, dynamic> json) => MemberAccount(
        id: _string(json['id']),
        email: _string(json['email']),
        displayName: _string(json['displayName']),
        initials: _string(json['initials']),
        planId: _string(json['planId'], 'free'),
        planName: _string(json['planName'], 'Free'),
        planStatus: _string(json['planStatus'], 'active'),
        role: _string(json['role'], 'member'),
        propertiesAccess: json['propertiesAccess'] == true,
        createdAt: _string(json['createdAt']),
        updatedAt: _string(json['updatedAt']),
        billingCycle: json['billingCycle'] == 'monthly' ||
                json['billingCycle'] == 'annual'
            ? json['billingCycle'] as String
            : null,
        pendingPlanId: _optionalString(json['pendingPlanId']),
        pendingEffectiveAt: _optionalString(json['pendingEffectiveAt']),
      );
}

class MemberSession {
  const MemberSession({required this.isAuthenticated, this.account});

  const MemberSession.signedOut()
      : isAuthenticated = false,
        account = null;

  final bool isAuthenticated;
  final MemberAccount? account;

  factory MemberSession.fromJson(Map<String, dynamic> json) {
    final account = _mapOrNull(json['account']);
    return MemberSession(
      isAuthenticated: json['isAuthenticated'] == true,
      account: account == null ? null : MemberAccount.fromJson(account),
    );
  }
}

class RetailerSource {
  const RetailerSource(
      {required this.label, required this.url, required this.kind});

  final String label;
  final String url;
  final String kind;

  factory RetailerSource.fromJson(Map<String, dynamic> json) => RetailerSource(
        label: _string(json['label']),
        url: _string(json['url']),
        kind: _string(json['kind'], 'specials'),
      );
}

class Retailer {
  const Retailer({
    required this.id,
    required this.name,
    required this.shortName,
    required this.group,
    required this.program,
    required this.sourceNote,
    required this.verifiedOn,
    required this.accentColor,
    required this.sources,
    this.logoUrl,
  });

  final String id;
  final String name;
  final String shortName;
  final String group;
  final String program;
  final String sourceNote;
  final String verifiedOn;
  final String accentColor;
  final List<RetailerSource> sources;
  final String? logoUrl;

  factory Retailer.fromJson(Map<String, dynamic> json) => Retailer(
        id: _string(json['id']),
        name: _string(json['name']),
        shortName: _string(json['shortName']),
        group: _string(json['group']),
        program: _string(json['program']),
        sourceNote: _string(json['sourceNote']),
        verifiedOn: _string(json['verifiedOn']),
        accentColor: _string(json['accentColor'], '#0d6b3d'),
        sources:
            _mapList(json['sources']).map(RetailerSource.fromJson).toList(),
        logoUrl: _optionalString(json['logoUrl']),
      );
}

class RetailerCatalog {
  const RetailerCatalog({required this.retailers, required this.sourceKinds});

  final List<Retailer> retailers;
  final List<String> sourceKinds;

  factory RetailerCatalog.fromJson(Map<String, dynamic> json) {
    final summary = _mapOrEmpty(json['summary']);
    return RetailerCatalog(
      retailers: _mapList(json['retailers']).map(Retailer.fromJson).toList(),
      sourceKinds: _stringList(summary['sourceKinds']),
    );
  }
}

class CountryOption {
  const CountryOption({
    required this.code,
    required this.currencyCode,
    required this.flag,
    required this.name,
    this.capital,
  });

  final String code;
  final String currencyCode;
  final String flag;
  final String name;
  final String? capital;

  factory CountryOption.fromJson(Map<String, dynamic> json) => CountryOption(
        code: _string(json['code'], 'ZA'),
        currencyCode: _string(json['currencyCode'], 'ZAR'),
        flag: _string(json['flag']),
        name: _string(json['name'], 'South Africa'),
        capital: _optionalString(json['capital']),
      );
}

class CountryPricing {
  const CountryPricing({
    required this.code,
    required this.name,
    required this.currencyCode,
    required this.rateFromZar,
  });

  final String code;
  final String name;
  final String currencyCode;
  final double rateFromZar;

  bool get isRand => currencyCode == 'ZAR';

  /// Local-currency estimate of a rand amount, e.g. "≈ USD 2.75".
  String? estimateFromRandCents(int cents) {
    if (isRand || rateFromZar <= 0) return null;
    final amount = (cents / 100) * rateFromZar;
    return '≈ $currencyCode ${amount.toStringAsFixed(2)}';
  }

  factory CountryPricing.fromJson(Map<String, dynamic> json) => CountryPricing(
        code: _string(json['code'], 'ZA'),
        name: _string(json['name'], 'South Africa'),
        currencyCode: _string(json['currencyCode'], 'ZAR'),
        rateFromZar: _double(json['rateFromZar'], 1),
      );
}

class RetailerProductSearchMatch {
  const RetailerProductSearchMatch({
    required this.retailerId,
    required this.retailerName,
    required this.status,
    this.isCheapest = false,
    this.priceCents,
    this.productUrl,
    this.sourceKind,
    this.title,
  });

  final String retailerId;
  final String retailerName;
  final String status;
  final bool isCheapest;
  final int? priceCents;
  final String? productUrl;
  final String? sourceKind;
  final String? title;

  factory RetailerProductSearchMatch.fromJson(Map<String, dynamic> json) =>
      RetailerProductSearchMatch(
        retailerId: _string(json['retailerId']),
        retailerName: _string(json['retailerName']),
        status: _string(json['status'], 'unavailable'),
        isCheapest: json['isCheapest'] == true,
        priceCents: _intOrNull(json['priceCents']),
        productUrl: _optionalString(json['productUrl']),
        sourceKind: _optionalString(json['sourceKind']),
        title: _optionalString(json['title']),
      );
}

class ProductComparisonResult {
  const ProductComparisonResult({
    required this.checkedAt,
    required this.country,
    required this.foundCount,
    required this.matches,
    required this.pricedCount,
    required this.query,
    required this.savingsCents,
    required this.unavailableCount,
    this.cheapestRetailerId,
  });

  final String checkedAt;
  final CountryOption country;
  final int foundCount;
  final List<RetailerProductSearchMatch> matches;
  final int pricedCount;
  final String query;
  final int savingsCents;
  final int unavailableCount;
  final String? cheapestRetailerId;

  factory ProductComparisonResult.fromJson(Map<String, dynamic> json) =>
      ProductComparisonResult(
        checkedAt: _string(json['checkedAt']),
        country: CountryOption.fromJson(_mapOrEmpty(json['country'])),
        foundCount: _int(json['foundCount']),
        matches: _mapList(json['matches'])
            .map(RetailerProductSearchMatch.fromJson)
            .toList(),
        pricedCount: _int(json['pricedCount']),
        query: _string(json['query']),
        savingsCents: _int(json['savingsCents']),
        unavailableCount: _int(json['unavailableCount']),
        cheapestRetailerId: _optionalString(json['cheapestRetailerId']),
      );
}

class Deal {
  const Deal({
    required this.title,
    required this.retailerName,
    this.id = '',
    this.retailerId = '',
    this.sourceLabel = '',
    this.sourceUrl = '',
    this.capturedAt = '',
    this.evidenceText = '',
    this.priceText,
    this.previousPriceText,
    this.savingText,
    this.productUrl,
    this.imageUrl,
    this.pageNumber,
    this.personalizationReason,
  });

  final String id;
  final String retailerId;
  final String retailerName;
  final String sourceLabel;
  final String sourceUrl;
  final String title;
  final String capturedAt;
  final String evidenceText;
  final String? priceText;
  final String? previousPriceText;
  final String? savingText;
  final String? productUrl;
  final String? imageUrl;
  final int? pageNumber;
  final String? personalizationReason;

  factory Deal.fromJson(Map<String, dynamic> json) => Deal(
        id: _string(json['id']),
        retailerId: _string(json['retailerId']),
        retailerName: _string(json['retailerName']),
        sourceLabel: _string(json['sourceLabel']),
        sourceUrl: _string(json['sourceUrl']),
        title: _string(json['title']),
        capturedAt: _string(json['capturedAt']),
        evidenceText: _string(json['evidenceText']),
        priceText: _optionalString(json['priceText']),
        previousPriceText: _optionalString(json['previousPriceText']),
        savingText: _optionalString(json['savingText']),
        productUrl: _optionalString(json['productUrl']),
        imageUrl: _optionalString(json['imageUrl']),
        pageNumber: _intOrNull(json['pageNumber']),
        personalizationReason: _optionalString(json['personalizationReason']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'retailerId': retailerId,
        'retailerName': retailerName,
        'sourceLabel': sourceLabel,
        'sourceUrl': sourceUrl,
        'productUrl': productUrl ?? sourceUrl,
        'title': title,
        'capturedAt': capturedAt,
        'priceText': priceText,
        'previousPriceText': previousPriceText,
        'savingText': savingText,
        'evidenceText': evidenceText,
        'imageUrl': imageUrl,
        'pageNumber': pageNumber,
        'personalizationReason': personalizationReason,
      };
}

class DiscoveryResult {
  const DiscoveryResult({
    required this.deals,
    required this.foundDealCount,
    required this.checkedSourceCount,
    required this.unavailableSourceCount,
    required this.leafletCount,
    this.catalogues = const [],
    this.refreshedAt,
  });

  final List<Deal> deals;
  final int foundDealCount;
  final int checkedSourceCount;
  final int unavailableSourceCount;
  final int leafletCount;
  final List<Catalogue> catalogues;
  final String? refreshedAt;

  factory DiscoveryResult.fromJson(Map<String, dynamic> json) {
    final summary = _mapOrEmpty(json['summary']);
    return DiscoveryResult(
      deals: _mapList(json['deals']).map(Deal.fromJson).toList(),
      foundDealCount: _int(summary['foundDealCount']),
      checkedSourceCount: _int(summary['checkedSourceCount']),
      unavailableSourceCount: _int(summary['unavailableSourceCount']),
      leafletCount: _int(summary['leafletCount']),
      catalogues:
          _mapList(json['leaflets']).map(Catalogue.fromLeaflet).toList(),
      refreshedAt: _optionalString(json['refreshedAt']),
    );
  }

  /// Round-trips through the same shape [DiscoveryResult.fromJson] reads, so
  /// the on-device cache can replay a previous payload byte-for-byte.
  Map<String, dynamic> toJson() => {
        'deals': deals.map((deal) => deal.toJson()).toList(),
        'leaflets': catalogues.map((catalogue) => catalogue.toJson()).toList(),
        'refreshedAt': refreshedAt,
        'summary': {
          'foundDealCount': foundDealCount,
          'checkedSourceCount': checkedSourceCount,
          'unavailableSourceCount': unavailableSourceCount,
          'leafletCount': leafletCount,
        },
      };
}

class SavedDeal extends Deal {
  const SavedDeal({
    required super.title,
    required super.retailerName,
    required this.savedAt,
    super.id,
    super.retailerId,
    super.sourceLabel,
    super.sourceUrl,
    super.capturedAt,
    super.evidenceText,
    super.priceText,
    super.previousPriceText,
    super.savingText,
    super.productUrl,
    super.imageUrl,
    super.pageNumber,
    super.personalizationReason,
  });

  final String savedAt;

  factory SavedDeal.fromJson(Map<String, dynamic> json) {
    final deal = Deal.fromJson(json);
    return SavedDeal(
      id: deal.id,
      retailerId: deal.retailerId,
      retailerName: deal.retailerName,
      sourceLabel: deal.sourceLabel,
      sourceUrl: deal.sourceUrl,
      title: deal.title,
      capturedAt: deal.capturedAt,
      evidenceText: deal.evidenceText,
      priceText: deal.priceText,
      previousPriceText: deal.previousPriceText,
      savingText: deal.savingText,
      productUrl: deal.productUrl,
      imageUrl: deal.imageUrl,
      pageNumber: deal.pageNumber,
      personalizationReason: deal.personalizationReason,
      savedAt: _string(json['savedAt']),
    );
  }
}

class SavedSource {
  const SavedSource({
    required this.id,
    required this.createdAt,
    required this.retailerId,
    required this.retailerName,
    required this.sourceLabel,
    required this.sourceKind,
    required this.sourceUrl,
  });

  final String id;
  final String createdAt;
  final String retailerId;
  final String retailerName;
  final String sourceLabel;
  final String sourceKind;
  final String sourceUrl;

  factory SavedSource.fromJson(Map<String, dynamic> json) => SavedSource(
        id: _string(json['id']),
        createdAt: _string(json['createdAt']),
        retailerId: _string(json['retailerId']),
        retailerName: _string(json['retailerName']),
        sourceLabel: _string(json['sourceLabel']),
        sourceKind: _string(json['sourceKind']),
        sourceUrl: _string(json['sourceUrl']),
      );
}

class BasketItem {
  const BasketItem({
    required this.id,
    required this.savedDealId,
    required this.quantity,
    required this.deal,
    this.linePriceCents,
    this.lineSavingCents,
  });

  final String id;
  final String savedDealId;
  final int quantity;
  final SavedDeal deal;
  final int? linePriceCents;
  final int? lineSavingCents;

  factory BasketItem.fromJson(Map<String, dynamic> json) => BasketItem(
        id: _string(json['id']),
        savedDealId: _string(json['savedDealId']),
        quantity: _int(json['quantity'], 1),
        deal: SavedDeal.fromJson(_mapOrEmpty(json['deal'])),
        linePriceCents: _intOrNull(json['linePriceCents']),
        lineSavingCents: _intOrNull(json['lineSavingCents']),
      );
}

class BasketSummary {
  const BasketSummary({
    required this.itemCount,
    required this.knownPriceItemCount,
    required this.totalCents,
    required this.savingsCents,
  });

  const BasketSummary.empty()
      : itemCount = 0,
        knownPriceItemCount = 0,
        totalCents = 0,
        savingsCents = 0;

  final int itemCount;
  final int knownPriceItemCount;
  final int totalCents;
  final int savingsCents;

  factory BasketSummary.fromJson(Map<String, dynamic> json) => BasketSummary(
        itemCount: _int(json['itemCount']),
        knownPriceItemCount: _int(json['knownPriceItemCount']),
        totalCents: _int(json['totalCents']),
        savingsCents: _int(json['savingsCents']),
      );
}

class Basket {
  const Basket({required this.items, required this.summary});

  const Basket.empty()
      : items = const [],
        summary = const BasketSummary.empty();

  final List<BasketItem> items;
  final BasketSummary summary;

  factory Basket.fromJson(Map<String, dynamic> json) => Basket(
        items: _mapList(json['items']).map(BasketItem.fromJson).toList(),
        summary: BasketSummary.fromJson(_mapOrEmpty(json['summary'])),
      );
}

class VerifiedOffer {
  const VerifiedOffer({
    required this.id,
    required this.retailerId,
    required this.title,
    required this.sourceUrl,
    required this.capturedAt,
    this.validFrom,
    this.validTo,
    this.priceText,
    this.savingText,
    this.termsText,
    this.imageUrl,
  });

  final String id;
  final String retailerId;
  final String title;
  final String sourceUrl;
  final String capturedAt;
  final String? validFrom;
  final String? validTo;
  final String? priceText;
  final String? savingText;
  final String? termsText;
  final String? imageUrl;

  factory VerifiedOffer.fromJson(Map<String, dynamic> json) => VerifiedOffer(
        id: _string(json['id']),
        retailerId: _string(json['retailerId']),
        title: _string(json['title']),
        sourceUrl: _string(json['sourceUrl']),
        capturedAt: _string(json['capturedAt']),
        validFrom: _optionalString(json['validFrom']),
        validTo: _optionalString(json['validTo']),
        priceText: _optionalString(json['priceText']),
        savingText: _optionalString(json['savingText']),
        termsText: _optionalString(json['termsText']),
        imageUrl: _optionalString(json['imageUrl']),
      );
}

class OfferDraft {
  const OfferDraft({
    required this.retailerId,
    required this.title,
    required this.sourceUrl,
    required this.capturedAt,
    required this.priceText,
    required this.termsText,
    this.validFrom,
    this.validTo,
    this.savingText,
  });

  final String retailerId;
  final String title;
  final String sourceUrl;
  final String capturedAt;
  final String priceText;
  final String termsText;
  final String? validFrom;
  final String? validTo;
  final String? savingText;

  Map<String, dynamic> toJson() => {
        'retailerId': retailerId,
        'title': title,
        'sourceUrl': sourceUrl,
        'capturedAt': capturedAt,
        'priceText': priceText,
        'termsText': termsText,
        'validFrom': validFrom,
        'validTo': validTo,
        'savingText': savingText,
      };
}

class OfferValidationIssue {
  const OfferValidationIssue(
      {required this.field, required this.message, required this.severity});

  final String field;
  final String message;
  final String severity;

  factory OfferValidationIssue.fromJson(Map<String, dynamic> json) =>
      OfferValidationIssue(
        field: _string(json['field']),
        message: _string(json['message']),
        severity: _string(json['severity']),
      );
}

class OfferValidationResult {
  const OfferValidationResult(
      {required this.accepted, required this.issues, this.normalizedOffer});

  final bool accepted;
  final List<OfferValidationIssue> issues;
  final VerifiedOffer? normalizedOffer;

  factory OfferValidationResult.fromJson(Map<String, dynamic> json) {
    final normalized = _mapOrNull(json['normalizedOffer']);
    return OfferValidationResult(
      accepted: json['accepted'] == true,
      issues:
          _mapList(json['issues']).map(OfferValidationIssue.fromJson).toList(),
      normalizedOffer:
          normalized == null ? null : VerifiedOffer.fromJson(normalized),
    );
  }
}

class MemberPlan {
  const MemberPlan({
    required this.id,
    required this.name,
    required this.description,
    required this.badge,
    required this.isPaid,
    required this.statusText,
    required this.features,
    required this.monthlyCents,
    required this.annualCents,
  });

  final String id;
  final String name;
  final String description;
  final String badge;
  final bool isPaid;
  final String statusText;
  final List<String> features;
  final int monthlyCents;
  final int annualCents;

  factory MemberPlan.fromJson(Map<String, dynamic> json) {
    final prices = _mapOrEmpty(json['prices']);
    return MemberPlan(
      id: _string(json['id']),
      name: _string(json['name']),
      description: _string(json['description']),
      badge: _string(json['badge']),
      isPaid: json['isPaid'] == true,
      statusText: _string(json['statusText']),
      features: _stringList(json['features']),
      monthlyCents: _int(prices['monthly']),
      annualCents: _int(prices['annual']),
    );
  }
}

class SubscriptionData {
  const SubscriptionData(
      {required this.billingReady, required this.plans, this.account});

  final bool billingReady;
  final List<MemberPlan> plans;
  final MemberAccount? account;

  factory SubscriptionData.fromJson(Map<String, dynamic> json) {
    final account = _mapOrNull(json['account']);
    return SubscriptionData(
      billingReady: json['billingReady'] == true,
      plans: _mapList(json['plans']).map(MemberPlan.fromJson).toList(),
      account: account == null ? null : MemberAccount.fromJson(account),
    );
  }
}

class SubscriptionCheckout {
  const SubscriptionCheckout({
    required this.message,
    required this.planId,
    required this.billingCycle,
    required this.status,
    this.redirectUrl,
    this.redirectFields = const {},
    this.engineUrl,
    this.onsiteUuid,
  });

  final String message;
  final String planId;
  final String billingCycle;
  final String status;
  final String? redirectUrl;
  final Map<String, String> redirectFields;
  final String? engineUrl;
  final String? onsiteUuid;

  factory SubscriptionCheckout.fromJson(Map<String, dynamic> json) =>
      SubscriptionCheckout(
        message: _string(json['message']),
        planId: _string(json['planId']),
        billingCycle: _string(json['billingCycle']),
        status: _string(json['status']),
        redirectUrl: _optionalString(json['redirectUrl']),
        redirectFields: _stringMap(json['redirectFields']),
        engineUrl: _optionalString(json['engineUrl']),
        onsiteUuid: _optionalString(json['onsiteUuid']),
      );
}

class AdminOverview {
  const AdminOverview({
    required this.accounts,
    required this.accountCount,
    required this.planCounts,
    required this.dealCount,
    required this.leafletCount,
    required this.sourceCount,
    this.lastScoutedAt,
  });

  final List<MemberAccount> accounts;
  final int accountCount;
  final Map<String, int> planCounts;
  final int dealCount;
  final int leafletCount;
  final int sourceCount;
  final String? lastScoutedAt;

  factory AdminOverview.fromJson(Map<String, dynamic> json) {
    final summary = _mapOrEmpty(json['summary']);
    final scout = _mapOrEmpty(json['scout']);
    return AdminOverview(
      accounts: _mapList(json['accounts']).map(MemberAccount.fromJson).toList(),
      accountCount: _int(summary['accountCount']),
      planCounts: _intMap(summary['planCounts']),
      dealCount: _int(scout['dealCount']),
      leafletCount: _int(scout['leafletCount']),
      sourceCount: _int(scout['sourceCount']),
      lastScoutedAt: _optionalString(scout['lastScoutedAt']),
    );
  }
}

class NearbyResult {
  const NearbyResult({required this.stores});
  final List<NearbyStore> stores;

  Map<String, dynamic> toJson() => {
        'stores': stores.map((store) => store.toJson()).toList(),
      };

  factory NearbyResult.fromJson(Map<String, dynamic> json) => NearbyResult(
        stores: _mapList(json['stores']).map(NearbyStore.fromJson).toList(),
      );
}

class NearbyStore {
  const NearbyStore({
    required this.placeId,
    required this.name,
    this.address,
    this.website,
    this.distanceM,
    this.retailerId,
    this.lat = 0,
    this.lon = 0,
    this.logoUrl,
    this.firstSeenAt,
    this.lastSeenAt,
    this.promotionCount = 0,
    this.deals = const [],
    this.catalogues = const [],
  });

  final String placeId;
  final String name;
  final String? address;
  final String? website;
  final num? distanceM;
  final String? retailerId;
  final num lat;
  final num lon;
  final String? logoUrl;
  final String? firstSeenAt;
  final String? lastSeenAt;
  final int promotionCount;
  final List<Deal> deals;
  final List<Catalogue> catalogues;

  bool get isKnownChain => retailerId?.trim().isNotEmpty == true;
  bool get hasSomething => deals.isNotEmpty || catalogues.isNotEmpty;

  factory NearbyStore.fromJson(Map<String, dynamic> json) {
    final leaflets = _mapList(json['leaflets']).map(Catalogue.fromLeaflet);
    final promotions = _mapList(json['promotions']);
    final catalogues = promotions
        .where((promotion) => promotion['kind'] == 'catalogue')
        .map(Catalogue.fromPromotion);
    final promotionDeals = promotions
        .where((promotion) => promotion['kind'] == 'deal')
        .map(Deal.fromJson);
    return NearbyStore(
      placeId: _string(json['placeId']),
      name: _string(json['name']),
      address: _optionalString(json['address']),
      website: _optionalString(json['website']),
      distanceM: json['distanceM'] as num?,
      retailerId: _optionalString(json['retailerId']),
      lat: json['lat'] is num ? json['lat'] as num : 0,
      lon: json['lon'] is num ? json['lon'] as num : 0,
      logoUrl: _optionalString(json['logoUrl']),
      firstSeenAt: _optionalString(json['firstSeenAt']),
      lastSeenAt: _optionalString(json['lastSeenAt']),
      promotionCount: _int(json['promotionCount']),
      deals: [..._mapList(json['deals']).map(Deal.fromJson), ...promotionDeals],
      catalogues: [...leaflets, ...catalogues],
    );
  }

  Map<String, dynamic> toJson() => {
        'placeId': placeId,
        'name': name,
        'address': address,
        'website': website,
        'distanceM': distanceM,
        'retailerId': retailerId,
        'lat': lat,
        'lon': lon,
        'logoUrl': logoUrl,
        'firstSeenAt': firstSeenAt,
        'lastSeenAt': lastSeenAt,
        'promotionCount': promotionCount,
        'deals': deals.map((deal) => deal.toJson()).toList(),
        'leaflets': catalogues.map((catalogue) => catalogue.toJson()).toList(),
      };
}

class CataloguePage {
  const CataloguePage({
    required this.pageNumber,
    required this.imageUrl,
    this.width,
    this.height,
    this.fallbacks = const [],
  });

  final int pageNumber;
  final String imageUrl;
  final int? width;
  final int? height;
  final List<String> fallbacks;

  List<String> get imageUrls {
    final urls = <String>[];
    for (final value in [imageUrl, ...fallbacks]) {
      final url = value.trim();
      if (url.isNotEmpty && !urls.contains(url)) urls.add(url);
    }
    return urls;
  }

  factory CataloguePage.fromJson(Map<String, dynamic> json) => CataloguePage(
        pageNumber: _int(json['pageNumber'], 1),
        imageUrl: _string(json['imageUrl']),
        width: _intOrNull(json['width']),
        height: _intOrNull(json['height']),
        fallbacks: _stringList(json['fallbacks']),
      );

  Map<String, dynamic> toJson() => {
        'pageNumber': pageNumber,
        'imageUrl': imageUrl,
        'width': width,
        'height': height,
        'fallbacks': fallbacks,
      };
}

class Catalogue {
  const Catalogue({
    required this.name,
    required this.url,
    this.sourceUrl,
    this.capturedAt,
    this.validFrom,
    this.validTo,
    this.imageUrl,
    this.retailerName,
    this.pages = const [],
  });
  final String name;
  final String url;
  final String? sourceUrl;
  final String? capturedAt;
  final String? validFrom;
  final String? validTo;
  final String? imageUrl;
  final String? retailerName;
  final List<CataloguePage> pages;

  bool get isDirectPdf {
    final uri = Uri.tryParse(url);
    return uri != null &&
        (uri.scheme == 'https' || uri.scheme == 'http') &&
        uri.path.toLowerCase().endsWith('.pdf');
  }

  String? get coverImageUrl =>
      imageUrl ??
      (pages.isNotEmpty && pages.first.imageUrl.isNotEmpty
          ? pages.first.imageUrl
          : null);

  factory Catalogue.fromLeaflet(Map<String, dynamic> json) => Catalogue(
        name: _string(json['name'], 'Catalogue'),
        url: _string(json['documentUrl'] ?? json['url']),
        sourceUrl: _optionalString(json['sourceUrl'] ?? json['url']),
        capturedAt: _optionalString(json['capturedAt']),
        validFrom: _optionalString(json['validFrom']),
        validTo: _optionalString(json['validTo']),
        imageUrl: _optionalString(json['imageUrl']),
        retailerName: _optionalString(json['retailerName']),
        pages: _mapList(json['pages']).map(CataloguePage.fromJson).toList(),
      );

  factory Catalogue.fromPromotion(Map<String, dynamic> json) => Catalogue(
        name: _string(json['title'], 'Specials'),
        url: _string(json['productUrl'] ?? json['sourceUrl']),
        sourceUrl: _optionalString(json['sourceUrl']),
        capturedAt: _optionalString(json['capturedAt']),
        validFrom: _optionalString(json['validFrom']),
        validTo: _optionalString(json['validTo']),
        imageUrl: _optionalString(json['imageUrl']),
        retailerName: _optionalString(json['storeName']),
        pages: _mapList(json['pages']).map(CataloguePage.fromJson).toList(),
      );

  Map<String, dynamic> toJson() => {
        'name': name,
        'documentUrl': url,
        'url': sourceUrl ?? url,
        'sourceUrl': sourceUrl,
        'capturedAt': capturedAt,
        'validFrom': validFrom,
        'validTo': validTo,
        'imageUrl': imageUrl,
        'retailerName': retailerName,
        'pages': pages.map((page) => page.toJson()).toList(),
      };
}

class DiscoveredStoresResult {
  const DiscoveredStoresResult({
    required this.stores,
    required this.storeCount,
    required this.areaCount,
    required this.knownChainCount,
    required this.withPromotionsCount,
  });

  final List<NearbyStore> stores;
  final int storeCount;
  final int areaCount;
  final int knownChainCount;
  final int withPromotionsCount;

  factory DiscoveredStoresResult.fromJson(Map<String, dynamic> json) {
    final summary = _mapOrEmpty(json['summary']);
    return DiscoveredStoresResult(
      stores: _mapList(json['stores']).map(NearbyStore.fromJson).toList(),
      storeCount: _int(summary['storeCount']),
      areaCount: _int(summary['areaCount']),
      knownChainCount: _int(summary['knownChainCount']),
      withPromotionsCount: _int(summary['withPromotionsCount']),
    );
  }
}

/// One deal that answered a watched item.
class DealWatchMatch {
  const DealWatchMatch({
    required this.title,
    this.retailerName,
    this.priceText,
    this.productUrl,
    this.imageUrl,
  });

  final String title;
  final String? retailerName;
  final String? priceText;
  final String? productUrl;
  final String? imageUrl;

  factory DealWatchMatch.fromJson(Map<String, dynamic> json) => DealWatchMatch(
        title: _string(json['title']),
        retailerName: _optionalString(json['retailerName']),
        priceText: _optionalString(json['priceText']),
        productUrl: _optionalString(json['productUrl']),
        imageUrl: _optionalString(json['imageUrl']),
      );
}

/// An item a member is watching for a deal. Matched watches with no seenAt
/// are the member's unread alerts.
class DealWatch {
  const DealWatch({
    required this.id,
    required this.queryText,
    required this.createdAt,
    this.matchedAt,
    this.seenAt,
    this.matches = const [],
  });

  final String id;
  final String queryText;
  final String createdAt;
  final String? matchedAt;
  final String? seenAt;
  final List<DealWatchMatch> matches;

  bool get isMatched => matchedAt != null;
  bool get isUnreadAlert => isMatched && seenAt == null;

  factory DealWatch.fromJson(Map<String, dynamic> json) => DealWatch(
        id: _string(json['id']),
        queryText: _string(json['queryText']),
        createdAt: _string(json['createdAt']),
        matchedAt: _optionalString(json['matchedAt']),
        seenAt: _optionalString(json['seenAt']),
        matches:
            _mapList(json['matches']).map(DealWatchMatch.fromJson).toList(),
      );
}

/// Server response to creating a watch: either instant matches (the item is
/// already on special) or confirmation that the watch was saved.
class DealWatchResult {
  const DealWatchResult({
    required this.message,
    required this.matches,
    required this.watches,
  });

  final String message;
  final List<DealWatchMatch> matches;
  final List<DealWatch> watches;

  bool get foundImmediately => matches.isNotEmpty;

  factory DealWatchResult.fromJson(Map<String, dynamic> json) =>
      DealWatchResult(
        message: _string(json['message']),
        matches:
            _mapList(json['matches']).map(DealWatchMatch.fromJson).toList(),
        watches: _mapList(json['watches']).map(DealWatch.fromJson).toList(),
      );
}

/// A geocoded point returned by /api/geocode when a shopper types an address.
class GeoPoint {
  const GeoPoint({required this.lat, required this.lon, this.formatted});

  final double lat;
  final double lon;
  final String? formatted;

  factory GeoPoint.fromJson(Map<String, dynamic> json) => GeoPoint(
        lat: (json['lat'] as num?)?.toDouble() ?? 0,
        lon: (json['lon'] as num?)?.toDouble() ?? 0,
        formatted: _optionalString(json['formatted']),
      );
}

/// An advertiser's own ad through its lifecycle: pending review, approved and
/// awaiting payment, rejected, live (active), or expired.
class AdSubmission {
  const AdSubmission({
    required this.id,
    required this.title,
    required this.bodyText,
    required this.targetUrl,
    required this.placement,
    required this.reach,
    required this.amountCents,
    required this.status,
    required this.createdAt,
    this.imageUrl,
    this.province,
    this.reviewNote,
  });

  final String id;
  final String title;
  final String bodyText;
  final String targetUrl;
  final String placement;
  final int reach;
  final int amountCents;
  final String status;
  final String createdAt;
  final String? imageUrl;
  final String? province;
  final String? reviewNote;

  bool get awaitingPayment => status == 'approved';
  bool get isLive => status == 'active';

  factory AdSubmission.fromJson(Map<String, dynamic> json) => AdSubmission(
        id: _string(json['id']),
        title: _string(json['title']),
        bodyText: _string(json['bodyText']),
        targetUrl: _string(json['targetUrl']),
        placement: _string(json['placement'], 'feed'),
        reach: _int(json['reach']),
        amountCents: _int(json['amountCents']),
        status: _string(json['status'], 'pending'),
        createdAt: _string(json['createdAt']),
        imageUrl: _optionalString(json['imageUrl']),
        province: _optionalString(json['province']),
        reviewNote: _optionalString(json['reviewNote']),
      );
}

/// A paid, live ad as the public feed exposes it — the sponsored card content.
class PublicAd {
  const PublicAd({
    required this.id,
    required this.title,
    required this.bodyText,
    required this.targetUrl,
    required this.placement,
    this.imageUrl,
    this.province,
  });

  final String id;
  final String title;
  final String bodyText;
  final String targetUrl;
  final String placement;
  final String? imageUrl;
  final String? province;

  factory PublicAd.fromJson(Map<String, dynamic> json) => PublicAd(
        id: _string(json['id']),
        title: _string(json['title']),
        bodyText: _string(json['bodyText']),
        targetUrl: _string(json['targetUrl']),
        placement: _string(json['placement'], 'feed'),
        imageUrl: _optionalString(json['imageUrl']),
        province: _optionalString(json['province']),
      );
}

/// One deal in the endless "Scroll" window-shopping reel. Sourced from the
/// external deal sites (OneDayOnly, Hyperli, Daddy's Deals, MyRunway) and from
/// the platform's own discovery feed.
class ScrollDeal {
  const ScrollDeal({
    required this.id,
    required this.title,
    required this.retailerName,
    required this.sourceLabel,
    required this.source,
    required this.productUrl,
    this.priceText,
    this.previousPriceText,
    this.savingText,
    this.imageUrl,
    this.images = const [],
    this.category,
    this.expiresAt,
  });

  final String id;
  final String title;
  final String retailerName;
  final String sourceLabel;
  final String source;
  final String productUrl;
  final String? priceText;
  final String? previousPriceText;
  final String? savingText;
  final String? imageUrl;
  final List<String> images;
  final String? category;
  final String? expiresAt;

  List<String> get gallery {
    final seen = <String>{};
    return <String>[
      if (imageUrl != null) imageUrl!,
      ...images,
    ]
        .map((url) => url.trim())
        .where((url) => url.isNotEmpty && seen.add(url))
        .toList(growable: false);
  }

  bool get hasImage => gallery.isNotEmpty;

  factory ScrollDeal.fromJson(Map<String, dynamic> json) => ScrollDeal(
        id: _string(json['id']),
        title: _string(json['title']),
        retailerName: _string(json['retailerName']),
        sourceLabel: _string(json['sourceLabel']),
        source: _string(json['source']),
        productUrl: _string(json['productUrl']),
        priceText: _optionalString(json['priceText']),
        previousPriceText: _optionalString(json['previousPriceText']),
        savingText: _optionalString(json['savingText']),
        imageUrl: _optionalString(json['imageUrl']),
        images: json['images'] is List
            ? (json['images'] as List)
                .whereType<String>()
                .map((url) => url.trim())
                .where((url) => url.isNotEmpty)
                .toList()
            : const [],
        category: _optionalString(json['category']),
        expiresAt: _optionalString(json['expiresAt']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'retailerName': retailerName,
        'sourceLabel': sourceLabel,
        'source': source,
        'productUrl': productUrl,
        'priceText': priceText,
        'previousPriceText': previousPriceText,
        'savingText': savingText,
        'imageUrl': imageUrl,
        if (images.isNotEmpty) 'images': images,
        'category': category,
        'expiresAt': expiresAt,
      };

  /// Renders this deal-site item as a regular [Deal] so it can appear in the
  /// Find-a-deal list alongside grocery specials.
  Deal toDeal({DateTime? capturedAt}) => Deal(
        id: id,
        title: title,
        retailerName: retailerName,
        retailerId: source,
        sourceLabel: sourceLabel,
        sourceUrl: productUrl,
        capturedAt: (capturedAt ?? DateTime.now()).toUtc().toIso8601String(),
        evidenceText: 'Found by Trolley Scout from the $sourceLabel feed.',
        priceText: priceText,
        previousPriceText: previousPriceText,
        savingText: savingText,
        productUrl: productUrl,
        imageUrl: imageUrl,
      );

  /// Builds a scroll deal from a regular discovery [Deal] so the reel can mix in
  /// the platform's own grocery finds.
  factory ScrollDeal.fromDeal(Deal deal) => ScrollDeal(
        id: deal.id.isNotEmpty ? deal.id : deal.productUrl ?? deal.title,
        title: deal.title,
        retailerName: deal.retailerName,
        sourceLabel: deal.sourceLabel,
        source: deal.retailerId.isNotEmpty ? deal.retailerId : 'discovery',
        productUrl: deal.productUrl ?? deal.sourceUrl,
        priceText: deal.priceText,
        previousPriceText: deal.previousPriceText,
        savingText: deal.savingText,
        imageUrl: deal.imageUrl,
        category: null,
        expiresAt: null,
      );
}

/// One home for sale or rent, found by Properties Scout on Property24 or
/// Private Property.
class PropertyListing {
  const PropertyListing({
    required this.id,
    required this.portal,
    required this.portalName,
    required this.title,
    required this.listingUrl,
    required this.listingType,
    this.priceText,
    this.priceValue,
    this.location,
    this.province,
    this.bedrooms,
    this.bathrooms,
    this.garages,
    this.propertyType,
    this.imageUrl,
    this.images = const [],
  });

  final String id;
  final String portal;
  final String portalName;
  final String title;
  final String listingUrl;
  final String listingType;
  final String? priceText;
  final num? priceValue;
  final String? location;
  final String? province;
  final int? bedrooms;
  final num? bathrooms;
  final int? garages;
  final String? propertyType;
  final String? imageUrl;

  /// Full gallery when the portal exposes more than one image; otherwise empty.
  final List<String> images;

  bool get hasImage => imageUrl != null && imageUrl!.isNotEmpty;

  /// Every image to show in the carousel — the gallery, or the single cover.
  List<String> get gallery =>
      images.isNotEmpty ? images : (hasImage ? [imageUrl!] : const []);

  /// A stable key that identifies this listing across searches (for favourites).
  String get favouriteKey => '$portal:$id';

  factory PropertyListing.fromJson(Map<String, dynamic> json) =>
      PropertyListing(
        id: _string(json['id']),
        portal: _string(json['portal']),
        portalName: _string(json['portalName']),
        title: _string(json['title'], 'Property'),
        listingUrl: _string(json['listingUrl']),
        listingType: _string(json['listingType'], 'sale'),
        priceText: _optionalString(json['priceText']),
        priceValue:
            json['priceValue'] is num ? json['priceValue'] as num : null,
        location: _optionalString(json['location']),
        province: _optionalString(json['province']),
        bedrooms: _intOrNull(json['bedrooms']),
        bathrooms: json['bathrooms'] is num ? json['bathrooms'] as num : null,
        garages: _intOrNull(json['garages']),
        propertyType: _optionalString(json['propertyType']),
        imageUrl: _optionalString(json['imageUrl']),
        images: json['images'] is List
            ? (json['images'] as List)
                .whereType<String>()
                .where((s) => s.isNotEmpty)
                .toList()
            : const [],
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'portal': portal,
        'portalName': portalName,
        'title': title,
        'listingUrl': listingUrl,
        'listingType': listingType,
        if (priceText != null) 'priceText': priceText,
        if (priceValue != null) 'priceValue': priceValue,
        if (location != null) 'location': location,
        if (province != null) 'province': province,
        if (bedrooms != null) 'bedrooms': bedrooms,
        if (bathrooms != null) 'bathrooms': bathrooms,
        if (garages != null) 'garages': garages,
        if (propertyType != null) 'propertyType': propertyType,
        if (imageUrl != null) 'imageUrl': imageUrl,
        if (images.isNotEmpty) 'images': images,
      };
}

/// Which portals answered a Properties Scout search, and how many each returned.
class PropertyPortalSource {
  const PropertyPortalSource({
    required this.id,
    required this.label,
    required this.count,
    required this.ok,
  });

  final String id;
  final String label;
  final int count;
  final bool ok;

  factory PropertyPortalSource.fromJson(Map<String, dynamic> json) =>
      PropertyPortalSource(
        id: _string(json['id']),
        label: _string(json['label']),
        count: _int(json['count']),
        ok: json['ok'] == true,
      );
}

/// The result of a Properties Scout search: listings plus per-portal metadata.
class PropertySearchResult {
  const PropertySearchResult({
    required this.listings,
    required this.sources,
    required this.listingType,
    required this.page,
    this.locationText,
  });

  final List<PropertyListing> listings;
  final List<PropertyPortalSource> sources;
  final String listingType;
  final int page;
  final String? locationText;

  factory PropertySearchResult.fromJson(Map<String, dynamic> json) =>
      PropertySearchResult(
        listings:
            _mapList(json['listings']).map(PropertyListing.fromJson).toList(),
        sources: _mapList(json['sources'])
            .map(PropertyPortalSource.fromJson)
            .toList(),
        listingType: _string(json['listingType'], 'sale'),
        page: _int(json['page'], 1),
        locationText: _optionalString(json['locationText']),
      );
}

/// How many shoppers saved a deal, and whether the current shopper did.
class SaveStat {
  const SaveStat({required this.count, required this.saved});

  final int count;
  final bool saved;

  factory SaveStat.fromJson(Map<String, dynamic> json) =>
      SaveStat(count: _int(json['count']), saved: json['saved'] == true);
}

/// One comment on a Window Shopping deal. Comments live with the deal and are
/// pruned once it leaves the feed.
class DealComment {
  const DealComment({
    required this.id,
    required this.author,
    required this.body,
    required this.createdAt,
  });

  final String id;
  final String author;
  final String body;
  final String createdAt;

  factory DealComment.fromJson(Map<String, dynamic> json) => DealComment(
        id: _string(json['id']),
        author: _string(json['author'], 'Shopper'),
        body: _string(json['body']),
        createdAt: _string(json['createdAt']),
      );
}

/// Member notification opt-ins. Today the only channel is new-deal alerts.
class NotificationPreferences {
  const NotificationPreferences({required this.newDeals});

  const NotificationPreferences.off() : newDeals = false;

  final bool newDeals;

  factory NotificationPreferences.fromJson(Map<String, dynamic> json) =>
      NotificationPreferences(newDeals: json['newDeals'] == true);
}

/// New-deal batches recorded by the scheduled scout after this device cursor.
class DealAlertSummary {
  const DealAlertSummary({
    required this.enabled,
    required this.latestCursor,
    required this.totalNewDealCount,
    this.countCapped = false,
  });

  final bool enabled;
  final int latestCursor;
  final int totalNewDealCount;
  final bool countCapped;

  factory DealAlertSummary.fromJson(Map<String, dynamic> json) =>
      DealAlertSummary(
        enabled: json['enabled'] == true,
        latestCursor: _int(json['latestCursor']),
        totalNewDealCount: _int(json['totalNewDealCount']),
        countCapped: json['countCapped'] == true,
      );
}

String _string(Object? value, [String fallback = '']) =>
    value is String ? value : fallback;

String? _optionalString(Object? value) =>
    value is String && value.isNotEmpty ? value : null;

int _int(Object? value, [int fallback = 0]) =>
    value is num ? value.toInt() : fallback;

int? _intOrNull(Object? value) => value is num ? value.toInt() : null;

double _double(Object? value, [double fallback = 0]) =>
    value is num ? value.toDouble() : fallback;

Map<String, dynamic> _mapOrEmpty(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

Map<String, dynamic>? _mapOrNull(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : null;

List<Map<String, dynamic>> _mapList(Object? value) => value is List
    ? value
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList()
    : <Map<String, dynamic>>[];

List<String> _stringList(Object? value) =>
    value is List ? value.whereType<String>().toList() : <String>[];

Map<String, String> _stringMap(Object? value) => value is Map
    ? value.map((key, item) => MapEntry(key.toString(), item.toString()))
    : <String, String>{};

Map<String, int> _intMap(Object? value) => value is Map
    ? value.map((key, item) => MapEntry(key.toString(), _int(item)))
    : <String, int>{};

class MapRoute {
  const MapRoute({
    required this.path,
    required this.distanceMeters,
    required this.durationSeconds,
  });

  final List<List<double>> path; // [lat, lon] pairs
  final double distanceMeters;
  final double durationSeconds;
}
