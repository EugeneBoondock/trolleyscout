import 'dart:convert';

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
    this.countryCode = 'ZA',
    this.countryName = 'South Africa',
    this.currencyCode = 'ZAR',
    this.billingCycle,
    this.pendingPlanId,
    this.pendingEffectiveAt,
    this.status = 'active',
    this.bannedAt,
    this.banReason,
    this.lastSeenAt,
    this.dealViewCount = 0,
    this.propertyViewCount = 0,
    this.voucherViewCount = 0,
    this.windowShoppingSeconds = 0,
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
  final String countryCode;
  final String countryName;
  final String currencyCode;
  // The cycle this member is actually billed on. Null for free members and for
  // plans an admin granted directly, where there is no subscription behind it.
  final String? billingCycle;
  // A downgrade the member queued. They keep the plan above until this date,
  // so the app must show what they still have, not what is coming.
  final String? pendingPlanId;
  final String? pendingEffectiveAt;
  // Moderation and presence. Only the admin console reads these; a banned
  // account never resolves a session, so a signed-in member always sees
  // 'active' for themselves.
  final String status;
  final String? bannedAt;
  final String? banReason;
  final String? lastSeenAt;
  // Counters kept for the admin console. Recorded for every member, including
  // those who opted out of deal learning - how much of the app someone uses is
  // an operational figure, not a profile of their shopping.
  final int dealViewCount;
  final int propertyViewCount;
  final int voucherViewCount;
  final int windowShoppingSeconds;

  bool get isAdmin => role == 'admin';

  bool get isBanned => status == 'banned';

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
        countryCode: _string(json['countryCode'], 'ZA'),
        countryName: _string(json['countryName'], 'South Africa'),
        currencyCode: _string(json['currencyCode'], 'ZAR'),
        billingCycle: json['billingCycle'] == 'monthly' ||
                json['billingCycle'] == 'annual'
            ? json['billingCycle'] as String
            : null,
        pendingPlanId: _optionalString(json['pendingPlanId']),
        pendingEffectiveAt: _optionalString(json['pendingEffectiveAt']),
        status: _string(json['status'], 'active'),
        bannedAt: _optionalString(json['bannedAt']),
        banReason: _optionalString(json['banReason']),
        lastSeenAt: _optionalString(json['lastSeenAt']),
        dealViewCount: _int(json['dealViewCount']),
        propertyViewCount: _int(json['propertyViewCount']),
        voucherViewCount: _int(json['voucherViewCount']),
        windowShoppingSeconds: _int(json['windowShoppingSeconds']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'displayName': displayName,
        'initials': initials,
        'planId': planId,
        'planName': planName,
        'planStatus': planStatus,
        'role': role,
        'propertiesAccess': propertiesAccess,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
        'countryCode': countryCode,
        'countryName': countryName,
        'currencyCode': currencyCode,
        if (billingCycle != null) 'billingCycle': billingCycle,
        if (pendingPlanId != null) 'pendingPlanId': pendingPlanId,
        if (pendingEffectiveAt != null)
          'pendingEffectiveAt': pendingEffectiveAt,
      };
}

class MemberSession {
  const MemberSession({
    required this.isAuthenticated,
    this.account,
    this.isOffline = false,
  });

  const MemberSession.signedOut()
      : isAuthenticated = false,
        account = null,
        isOffline = false;

  final bool isAuthenticated;
  final MemberAccount? account;
  final bool isOffline;

  factory MemberSession.fromJson(Map<String, dynamic> json) {
    final account = _mapOrNull(json['account']);
    return MemberSession(
      isAuthenticated: json['isAuthenticated'] == true,
      account: account == null ? null : MemberAccount.fromJson(account),
    );
  }

  Map<String, dynamic> toJson() => {
        'isAuthenticated': isAuthenticated,
        if (account != null) 'account': account!.toJson(),
      };
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
    this.aliases = const [],
    required this.group,
    required this.program,
    required this.sourceNote,
    required this.verifiedOn,
    required this.accentColor,
    required this.sources,
    this.logoUrl,
    this.offerStatus,
    this.offersCheckedAt,
  });

  final String id;
  final String name;
  final String shortName;
  final List<String> aliases;
  final String group;
  final String program;
  final String sourceNote;
  final String verifiedOn;
  final String accentColor;
  final List<RetailerSource> sources;
  final String? logoUrl;
  final String? offerStatus;
  final String? offersCheckedAt;

  factory Retailer.fromJson(Map<String, dynamic> json) => Retailer(
        id: _string(json['id']),
        name: _string(json['name']),
        shortName: _string(json['shortName']),
        aliases:
            _mapList(json['aliases']).map((value) => value.toString()).toList(),
        group: _string(json['group']),
        program: _string(json['program']),
        sourceNote: _string(json['sourceNote']),
        verifiedOn: _string(json['verifiedOn']),
        accentColor: _string(json['accentColor'], '#0d6b3d'),
        sources:
            _mapList(json['sources']).map(RetailerSource.fromJson).toList(),
        logoUrl: _optionalString(json['logoUrl']),
        offerStatus: _optionalString(json['offerStatus']),
        offersCheckedAt: _optionalString(json['offersCheckedAt']),
      );
}

class RetailerCatalog {
  const RetailerCatalog({
    required this.retailers,
    required this.sourceKinds,
    this.totalRetailerCount,
    this.country,
  });

  final List<Retailer> retailers;
  final List<String> sourceKinds;
  final int? totalRetailerCount;
  final CountryOption? country;

  int get retailerCount => totalRetailerCount ?? retailers.length;

  factory RetailerCatalog.fromJson(Map<String, dynamic> json) {
    final summary = _mapOrEmpty(json['summary']);
    return RetailerCatalog(
      retailers: _mapList(json['retailers']).map(Retailer.fromJson).toList(),
      sourceKinds: _stringList(summary['sourceKinds']),
      totalRetailerCount: _intOrNull(summary['retailerCount']),
      country: _countryOptionOrNull(json['country']),
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
    this.capital,
    this.flag,
  });

  final String code;
  final String name;
  final String currencyCode;
  final double rateFromZar;
  final String? capital;
  final String? flag;

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
        capital: _optionalString(json['capital']),
        flag: _optionalString(json['flag']),
      );
}

class CoverageLedger {
  const CoverageLedger({
    required this.generatedAt,
    required this.markets,
    required this.summary,
  });

  final String generatedAt;
  final List<CoverageMarket> markets;
  final CoverageSummary summary;

  factory CoverageLedger.fromJson(Map<String, dynamic> json) => CoverageLedger(
        generatedAt: _string(json['generatedAt']),
        markets: _mapList(json['markets'])
            .map(CoverageMarket.fromJson)
            .toList(growable: false),
        summary: CoverageSummary.fromJson(_mapOrEmpty(json['summary'])),
      );
}

class CoverageSummary {
  const CoverageSummary({
    required this.activeCatalogueCount,
    required this.activeDealCount,
    required this.activeMarketCount,
    required this.discoveredStoreCount,
    required this.liveMarketCount,
    required this.officialSourceCount,
    required this.retailerCount,
  });

  final int activeCatalogueCount;
  final int activeDealCount;
  final int activeMarketCount;
  final int discoveredStoreCount;
  final int liveMarketCount;
  final int officialSourceCount;
  final int retailerCount;

  factory CoverageSummary.fromJson(Map<String, dynamic> json) =>
      CoverageSummary(
        activeCatalogueCount: _int(json['activeCatalogueCount']),
        activeDealCount: _int(json['activeDealCount']),
        activeMarketCount: _int(json['activeMarketCount']),
        discoveredStoreCount: _int(json['discoveredStoreCount']),
        liveMarketCount: _int(json['liveMarketCount']),
        officialSourceCount: _int(json['officialSourceCount']),
        retailerCount: _int(json['retailerCount']),
      );
}

class CoverageMarket {
  const CoverageMarket({
    required this.activeCatalogueCount,
    required this.activeCatalogueRetailerCount,
    required this.activeDealCount,
    required this.activeDealRetailerCount,
    required this.code,
    required this.discoveredStoreCount,
    required this.flag,
    required this.freshness,
    required this.name,
    required this.officialSourceCount,
    required this.retailerCount,
    required this.storesWithPromotionsCount,
    this.directoryCheckedAt,
    this.catalogueCheckedAt,
    this.lastDealCapturedAt,
  });

  final int activeCatalogueCount;
  final int activeCatalogueRetailerCount;
  final int activeDealCount;
  final int activeDealRetailerCount;
  final String code;
  final String? catalogueCheckedAt;
  final int discoveredStoreCount;
  final String? directoryCheckedAt;
  final String flag;
  final String freshness;
  final String? lastDealCapturedAt;
  final String name;
  final int officialSourceCount;
  final int retailerCount;
  final int storesWithPromotionsCount;

  factory CoverageMarket.fromJson(Map<String, dynamic> json) => CoverageMarket(
        activeCatalogueCount: _int(json['activeCatalogueCount']),
        activeCatalogueRetailerCount:
            _int(json['activeCatalogueRetailerCount']),
        activeDealCount: _int(json['activeDealCount']),
        activeDealRetailerCount: _int(json['activeDealRetailerCount']),
        code: _string(json['code']),
        catalogueCheckedAt: _optionalString(json['catalogueCheckedAt']),
        discoveredStoreCount: _int(json['discoveredStoreCount']),
        directoryCheckedAt: _optionalString(json['directoryCheckedAt']),
        flag: _string(json['flag']),
        freshness: _string(json['freshness'], 'building'),
        lastDealCapturedAt: _optionalString(json['lastDealCapturedAt']),
        name: _string(json['name']),
        officialSourceCount: _int(json['officialSourceCount']),
        retailerCount: _int(json['retailerCount']),
        storesWithPromotionsCount: _int(json['storesWithPromotionsCount']),
      );
}

class RetailerProductSearchMatch {
  const RetailerProductSearchMatch({
    required this.retailerId,
    required this.retailerName,
    required this.status,
    this.alternatives = const [],
    this.isCheapest = false,
    this.priceCents,
    this.productUrl,
    this.sourceKind,
    this.title,
  });

  final String retailerId;
  final String retailerName;
  final String status;

  /// Runner-up products from the same store, most relevant first, so the
  /// shopper can swap when word overlap picked the wrong item.
  final List<RetailerProductAlternative> alternatives;
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
        alternatives: _mapList(json['alternatives'])
            .map(RetailerProductAlternative.fromJson)
            .toList(),
        isCheapest: json['isCheapest'] == true,
        priceCents: _intOrNull(json['priceCents']),
        productUrl: _optionalString(json['productUrl']),
        sourceKind: _optionalString(json['sourceKind']),
        title: _optionalString(json['title']),
      );

  RetailerProductSearchMatch copyWithCheapest(bool cheapest) =>
      RetailerProductSearchMatch(
        retailerId: retailerId,
        retailerName: retailerName,
        status: status,
        alternatives: alternatives,
        isCheapest: cheapest,
        priceCents: priceCents,
        productUrl: productUrl,
        sourceKind: sourceKind,
        title: title,
      );

  /// The same store's row with an alternative product swapped in as the
  /// compared item. Cheapest flags are recomputed by the caller.
  RetailerProductSearchMatch withAlternative(
      RetailerProductAlternative alternative) {
    final remaining = [
      if (title != null && priceCents != null && productUrl != null)
        RetailerProductAlternative(
            priceCents: priceCents!, productUrl: productUrl!, title: title!),
      ...alternatives.where((option) => option != alternative),
    ];
    return RetailerProductSearchMatch(
      retailerId: retailerId,
      retailerName: retailerName,
      status: status,
      alternatives: remaining,
      priceCents: alternative.priceCents,
      productUrl: alternative.productUrl,
      sourceKind: sourceKind,
      title: alternative.title,
    );
  }
}

class RetailerProductAlternative {
  const RetailerProductAlternative({
    required this.priceCents,
    required this.productUrl,
    required this.title,
  });

  final int priceCents;
  final String productUrl;
  final String title;

  factory RetailerProductAlternative.fromJson(Map<String, dynamic> json) =>
      RetailerProductAlternative(
        priceCents: _int(json['priceCents']),
        productUrl: _string(json['productUrl']),
        title: _string(json['title']),
      );

  @override
  bool operator ==(Object other) =>
      other is RetailerProductAlternative &&
      other.priceCents == priceCents &&
      other.productUrl == productUrl &&
      other.title == title;

  @override
  int get hashCode => Object.hash(priceCents, productUrl, title);
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

class ImageCrop {
  const ImageCrop({
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });

  final double x;
  final double y;
  final double width;
  final double height;

  bool get isValid =>
      x >= 0 &&
      y >= 0 &&
      width > 0 &&
      height > 0 &&
      x + width <= 1.001 &&
      y + height <= 1.001;

  factory ImageCrop.fromJson(Map<String, dynamic> json) => ImageCrop(
        x: _double(json['x']),
        y: _double(json['y']),
        width: _double(json['width']),
        height: _double(json['height']),
      );

  Map<String, dynamic> toJson() => {
        'x': x,
        'y': y,
        'width': width,
        'height': height,
      };

  @override
  bool operator ==(Object other) =>
      other is ImageCrop &&
      x == other.x &&
      y == other.y &&
      width == other.width &&
      height == other.height;

  @override
  int get hashCode => Object.hash(x, y, width, height);
}

class Deal {
  const Deal({
    required this.title,
    required this.retailerName,
    this.id = '',
    this.retailerId = '',
    this.sourceLabel = '',
    this.sourceUrl = '',
    this.addedAt = '',
    this.capturedAt = '',
    this.evidenceText = '',
    this.priceText,
    this.previousPriceText,
    this.savingText,
    this.unitText,
    this.validFrom,
    this.validTo,
    this.productUrl,
    this.imageUrl,
    this.images = const [],
    this.imageCrop,
    this.pageNumber,
    this.catalogueDeepLink,
    this.personalizationReason,
    this.soldOut = false,
  });

  final String id;
  final String retailerId;
  final String retailerName;
  final String sourceLabel;
  final String sourceUrl;
  final String title;
  final String addedAt;
  final String capturedAt;
  final String evidenceText;
  final String? priceText;
  final String? previousPriceText;
  final String? savingText;
  final String? unitText;
  final String? validFrom;
  final String? validTo;
  final String? productUrl;
  final String? imageUrl;
  final List<String> images;
  final ImageCrop? imageCrop;

  /// Deep link back to the catalogue this deal was read from — how a page
  /// hotspot proves the deal belongs to the catalogue being viewed.
  final String? catalogueDeepLink;

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

  /// True only when the shop said every way of buying this is gone. A shop that
  /// says nothing leaves this false, because a wrong sold-out badge sends a
  /// shopper away from something they could have had.
  final bool soldOut;
  final int? pageNumber;
  final String? personalizationReason;

  factory Deal.fromJson(Map<String, dynamic> json) => Deal(
        id: _string(json['id']),
        retailerId: _string(json['retailerId']),
        retailerName: _string(json['retailerName'] ?? json['storeName']),
        sourceLabel: _string(json['sourceLabel']),
        sourceUrl: _string(json['sourceUrl']),
        title: _string(json['title']),
        addedAt: _string(json['addedAt']),
        capturedAt: _string(json['capturedAt']),
        evidenceText: _string(json['evidenceText']),
        priceText: _optionalString(json['priceText']),
        previousPriceText: _optionalString(json['previousPriceText']),
        savingText: _optionalString(json['savingText']),
        unitText: _optionalString(json['unitText']),
        validFrom: _optionalString(json['validFrom']),
        validTo: _optionalString(json['validTo']),
        productUrl: _optionalString(json['productUrl']),
        imageUrl: _optionalString(json['imageUrl']),
        images: json['images'] is List
            ? (json['images'] as List)
                .whereType<String>()
                .map((url) => url.trim())
                .where((url) => url.isNotEmpty)
                .toList()
            : const [],
        imageCrop: json['imageCrop'] is Map
            ? ImageCrop.fromJson(
                Map<String, dynamic>.from(json['imageCrop'] as Map),
              )
            : null,
        pageNumber: _intOrNull(json['pageNumber']),
        catalogueDeepLink: _optionalString(json['catalogueDeepLink']),
        personalizationReason: _optionalString(json['personalizationReason']),
        soldOut: json['soldOut'] == true,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'retailerId': retailerId,
        'retailerName': retailerName,
        'sourceLabel': sourceLabel,
        'sourceUrl': sourceUrl,
        'productUrl': productUrl ?? sourceUrl,
        'title': title,
        if (addedAt.isNotEmpty) 'addedAt': addedAt,
        'capturedAt': capturedAt,
        'priceText': priceText,
        'previousPriceText': previousPriceText,
        'savingText': savingText,
        'unitText': unitText,
        'validFrom': validFrom,
        'validTo': validTo,
        'evidenceText': evidenceText,
        'imageUrl': imageUrl,
        if (images.isNotEmpty) 'images': images,
        if (imageCrop != null) 'imageCrop': imageCrop!.toJson(),
        'pageNumber': pageNumber,
        if (catalogueDeepLink != null) 'catalogueDeepLink': catalogueDeepLink,
        'personalizationReason': personalizationReason,
        'soldOut': soldOut,
      };
}

/// Health facts for a marketplace food — AI-written once, then shared with
/// every shopper from the server cache.
class FoodFactsInfo {
  const FoodFactsInfo({
    required this.available,
    this.food = '',
    this.facts = const [],
    this.budgetTip = '',
  });

  factory FoodFactsInfo.fromJson(Map<String, dynamic> json) => FoodFactsInfo(
        available: json['available'] == true,
        food: json['food']?.toString() ?? '',
        facts: json['facts'] is List
            ? (json['facts'] as List).map((fact) => fact.toString()).toList()
            : const [],
        budgetTip: json['budgetTip']?.toString() ?? '',
      );

  final bool available;
  final String food;
  final List<String> facts;
  final String budgetTip;
}

/// Star rating and shopper comments pulled from the retailer's own site.
class ProductReviewInfo {
  const ProductReviewInfo({
    required this.available,
    this.rating,
    this.reviewCount = 0,
    this.reviews = const [],
  });

  factory ProductReviewInfo.fromJson(Map<String, dynamic> json) =>
      ProductReviewInfo(
        available: json['available'] == true,
        rating: json['rating'] is num
            ? (json['rating'] as num).toDouble()
            : null,
        reviewCount:
            json['reviewCount'] is num ? (json['reviewCount'] as num).toInt() : 0,
        reviews: json['reviews'] is List
            ? (json['reviews'] as List)
                .whereType<Map<String, dynamic>>()
                .map(ProductReviewEntry.fromJson)
                .toList()
            : const [],
      );

  final bool available;
  final double? rating;
  final int reviewCount;
  final List<ProductReviewEntry> reviews;
}

class ProductReviewEntry {
  const ProductReviewEntry({
    required this.rating,
    this.author = '',
    this.body = '',
    this.title = '',
    this.date = '',
  });

  factory ProductReviewEntry.fromJson(Map<String, dynamic> json) =>
      ProductReviewEntry(
        rating: json['rating'] is num ? (json['rating'] as num).toDouble() : 0,
        author: json['author']?.toString() ?? '',
        body: json['body']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        date: json['date']?.toString() ?? '',
      );

  final double rating;
  final String author;
  final String body;
  final String title;
  final String date;
}

/// One YouTube review surfaced for a Window Shopping product.
class ProductVideo {
  const ProductVideo({
    required this.videoId,
    required this.title,
    this.channel = '',
    this.thumbnailUrl,
    this.viewCount = 0,
  });

  factory ProductVideo.fromJson(Map<String, dynamic> json) => ProductVideo(
        videoId: json['videoId']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        channel: json['channel']?.toString() ?? '',
        thumbnailUrl: json['thumbnailUrl']?.toString(),
        viewCount: json['viewCount'] is num
            ? (json['viewCount'] as num).toInt()
            : 0,
      );

  final String videoId;
  final String title;
  final String channel;
  final String? thumbnailUrl;
  final int viewCount;
}

class DealReport {
  const DealReport({
    required this.id,
    required this.dealId,
    required this.countryCode,
    required this.retailerName,
    required this.title,
    required this.sourceUrl,
    required this.reason,
    required this.status,
    required this.createdAt,
    this.productUrl,
    this.note,
  });

  factory DealReport.fromJson(Map<String, dynamic> json) => DealReport(
        id: _string(json['id']),
        dealId: _string(json['dealId']),
        countryCode: _string(json['countryCode']),
        retailerName: _string(json['retailerName']),
        title: _string(json['title']),
        sourceUrl: _string(json['sourceUrl']),
        productUrl: _optionalString(json['productUrl']),
        reason: _string(json['reason']),
        note: _optionalString(json['note']),
        status: _string(json['status']),
        createdAt: _string(json['createdAt']),
      );

  final String id;
  final String dealId;
  final String countryCode;
  final String retailerName;
  final String title;
  final String sourceUrl;
  final String? productUrl;
  final String reason;
  final String? note;
  final String status;
  final String createdAt;
}

class DiscoveryAccess {
  const DiscoveryAccess({
    required this.availableCatalogueCount,
    required this.availableDealCount,
    required this.catalogueLimit,
    required this.dealLimit,
    required this.planId,
  });

  final int availableCatalogueCount;
  final int availableDealCount;
  final int catalogueLimit;
  final int dealLimit;
  final String planId;

  bool get cataloguesLimited => availableCatalogueCount > catalogueLimit;
  bool get dealsLimited => availableDealCount > dealLimit;
  bool get isLimited => cataloguesLimited || dealsLimited;

  factory DiscoveryAccess.fromJson(Map<String, dynamic> json) =>
      DiscoveryAccess(
        availableCatalogueCount: _int(json['availableCatalogueCount']),
        availableDealCount: _int(json['availableDealCount']),
        catalogueLimit: _int(json['catalogueLimit']),
        dealLimit: _int(json['dealLimit']),
        planId: _string(json['planId'], 'free'),
      );

  Map<String, dynamic> toJson() => {
        'availableCatalogueCount': availableCatalogueCount,
        'availableDealCount': availableDealCount,
        'catalogueLimit': catalogueLimit,
        'dealLimit': dealLimit,
        'planId': planId,
      };
}

class BusinessStoryPublication {
  const BusinessStoryPublication({
    required this.id,
    required this.organizationName,
    required this.organizationSlug,
    required this.title,
    required this.bodyText,
    required this.imageUrl,
    required this.targetUrl,
    this.imageAlt,
    this.offerText,
    this.priceText,
  });

  final String id;
  final String organizationName;
  final String organizationSlug;
  final String title;
  final String bodyText;
  final String imageUrl;
  final String targetUrl;
  final String? imageAlt;
  final String? offerText;
  final String? priceText;

  factory BusinessStoryPublication.fromJson(Map<String, dynamic> json) =>
      BusinessStoryPublication(
        id: _string(json['id']),
        organizationName: _string(json['organizationName'], 'Business'),
        organizationSlug: _string(json['organizationSlug']),
        title: _string(json['title']),
        bodyText: _string(json['bodyText']),
        imageUrl: _string(json['imageUrl']),
        targetUrl: _string(json['targetUrl']),
        imageAlt: _optionalString(json['imageAlt']),
        offerText: _optionalString(json['offerText']),
        priceText: _optionalString(json['priceText']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'organizationName': organizationName,
        'organizationSlug': organizationSlug,
        'title': title,
        'bodyText': bodyText,
        'imageUrl': imageUrl,
        'targetUrl': targetUrl,
        'imageAlt': imageAlt,
        'offerText': offerText,
        'priceText': priceText,
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
    this.businessStories = const [],
    this.access,
    this.refreshedAt,
  });

  final List<Deal> deals;
  final int foundDealCount;
  final int checkedSourceCount;
  final int unavailableSourceCount;
  final int leafletCount;
  final List<Catalogue> catalogues;
  final List<BusinessStoryPublication> businessStories;
  final DiscoveryAccess? access;
  final String? refreshedAt;

  factory DiscoveryResult.fromJson(Map<String, dynamic> json) {
    final summary = _mapOrEmpty(json['summary']);
    final access = _mapOrNull(json['access']);
    return DiscoveryResult(
      deals: _mapList(json['deals']).map(Deal.fromJson).toList(),
      foundDealCount: _int(summary['foundDealCount']),
      checkedSourceCount: _int(summary['checkedSourceCount']),
      unavailableSourceCount: _int(summary['unavailableSourceCount']),
      leafletCount: _int(summary['leafletCount']),
      catalogues:
          _mapList(json['leaflets']).map(Catalogue.fromLeaflet).toList(),
      businessStories: _mapList(json['businessStories'])
          .map(BusinessStoryPublication.fromJson)
          .toList(),
      access: access == null ? null : DiscoveryAccess.fromJson(access),
      refreshedAt: _optionalString(json['refreshedAt']),
    );
  }

  /// Round-trips through the same shape [DiscoveryResult.fromJson] reads, so
  /// the on-device cache can replay a previous payload byte-for-byte.
  Map<String, dynamic> toJson() => {
        'deals': deals.map((deal) => deal.toJson()).toList(),
        'leaflets': catalogues.map((catalogue) => catalogue.toJson()).toList(),
        'businessStories':
            businessStories.map((story) => story.toJson()).toList(),
        if (access != null) 'access': access!.toJson(),
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
    super.unitText,
    super.productUrl,
    super.imageUrl,
    super.pageNumber,
    super.personalizationReason,
    super.soldOut,
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
      unitText: deal.unitText,
      productUrl: deal.productUrl,
      imageUrl: deal.imageUrl,
      pageNumber: deal.pageNumber,
      personalizationReason: deal.personalizationReason,
      soldOut: deal.soldOut,
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
    this.localCurrency,
    this.localMonthly,
    this.localAnnual,
  });

  final String id;
  final String name;
  final String description;
  final String badge;
  final bool isPaid;
  final String statusText;
  final List<String> features;
  // Rand cents: what PayFast debits, whatever currency the price was quoted in.
  final int monthlyCents;
  final int annualCents;
  // The whole-number price the shopper was quoted, in their own money. Null on
  // the free plan and on any response from an older server.
  final String? localCurrency;
  final int? localMonthly;
  final int? localAnnual;

  bool get isQuotedInRand => localCurrency == null || localCurrency == 'ZAR';

  factory MemberPlan.fromJson(Map<String, dynamic> json) {
    final prices = _mapOrEmpty(json['prices']);
    final localPrices = _mapOrEmpty(json['localPrices']);
    final localCurrency = _string(localPrices['currencyCode']);
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
      localCurrency: localCurrency.isEmpty ? null : localCurrency,
      localMonthly: localCurrency.isEmpty ? null : _int(localPrices['monthly']),
      localAnnual: localCurrency.isEmpty ? null : _int(localPrices['annual']),
    );
  }
}

class SubscriptionData {
  const SubscriptionData({
    required this.billingReady,
    required this.plans,
    this.account,
    this.businessApplications = const [],
  });

  final bool billingReady;
  final List<MemberPlan> plans;
  final MemberAccount? account;
  final List<OrganizationApplication> businessApplications;

  factory SubscriptionData.fromJson(Map<String, dynamic> json) {
    final account = _mapOrNull(json['account']);
    return SubscriptionData(
      billingReady: json['billingReady'] == true,
      plans: _mapList(json['plans']).map(MemberPlan.fromJson).toList(),
      account: account == null ? null : MemberAccount.fromJson(account),
      businessApplications: _mapList(json['businessApplications'])
          .map(OrganizationApplication.fromJson)
          .toList(),
    );
  }
}

class DeveloperAllowance {
  const DeveloperAllowance({
    required this.callsPerMinute,
    required this.callsPerMonth,
  });

  final int callsPerMinute;
  final int callsPerMonth;

  factory DeveloperAllowance.fromJson(Map<String, dynamic> json) =>
      DeveloperAllowance(
        callsPerMinute: _int(json['callsPerMinute']),
        callsPerMonth: _int(json['callsPerMonth']),
      );
}

class DeveloperApiKeySummary {
  const DeveloperApiKeySummary({
    required this.id,
    required this.keyPrefix,
    required this.name,
    required this.scopes,
    required this.createdAt,
    this.expiresAt,
    this.lastUsedAt,
    this.revokedAt,
  });

  final String id;
  final String keyPrefix;
  final String name;
  final List<String> scopes;
  final String createdAt;
  final String? expiresAt;
  final String? lastUsedAt;
  final String? revokedAt;

  bool get isRevoked => revokedAt != null;

  factory DeveloperApiKeySummary.fromJson(Map<String, dynamic> json) =>
      DeveloperApiKeySummary(
        id: _string(json['id']),
        keyPrefix: _string(json['keyPrefix']),
        name: _string(json['name']),
        scopes: (json['scopes'] as List? ?? const [])
            .whereType<String>()
            .toList(growable: false),
        createdAt: _string(json['createdAt']),
        expiresAt: _optionalString(json['expiresAt']),
        lastUsedAt: _optionalString(json['lastUsedAt']),
        revokedAt: _optionalString(json['revokedAt']),
      );
}

class DeveloperKeyResource {
  const DeveloperKeyResource({
    required this.allowance,
    required this.keys,
    required this.scopes,
    required this.usage,
    this.secret,
  });

  final DeveloperAllowance allowance;
  final List<DeveloperApiKeySummary> keys;
  final List<String> scopes;
  final int usage;
  final String? secret;

  factory DeveloperKeyResource.fromJson(Map<String, dynamic> json) =>
      DeveloperKeyResource(
        allowance: DeveloperAllowance.fromJson(
            _mapOrNull(json['allowance']) ?? const {}),
        keys: _mapList(json['keys'])
            .map(DeveloperApiKeySummary.fromJson)
            .toList(growable: false),
        scopes: (json['scopes'] as List? ?? const [])
            .whereType<String>()
            .toList(growable: false),
        usage: _int(json['usage']),
        secret: _optionalString(json['secret']),
      );
}

class OrganizationApplicationDraft {
  const OrganizationApplicationDraft({
    required this.organisationName,
    required this.contactName,
    required this.contactEmail,
    required this.description,
    this.tradingName,
    this.registrationNumber,
    this.contactPhone,
    this.websiteUrl,
    this.category,
    this.city,
    this.province,
  });

  final String organisationName;
  final String? tradingName;
  final String? registrationNumber;
  final String contactName;
  final String contactEmail;
  final String? contactPhone;
  final String? websiteUrl;
  final String? category;
  final String description;
  final String? city;
  final String? province;

  Map<String, dynamic> toJson() => {
        'organisationName': organisationName,
        'contactName': contactName,
        'contactEmail': contactEmail,
        'description': description,
        if (tradingName != null && tradingName!.isNotEmpty)
          'tradingName': tradingName,
        if (registrationNumber != null && registrationNumber!.isNotEmpty)
          'registrationNumber': registrationNumber,
        if (contactPhone != null && contactPhone!.isNotEmpty)
          'contactPhone': contactPhone,
        if (websiteUrl != null && websiteUrl!.isNotEmpty)
          'websiteUrl': websiteUrl,
        if (category != null && category!.isNotEmpty) 'category': category,
        if (city != null && city!.isNotEmpty) 'city': city,
        if (province != null && province!.isNotEmpty) 'province': province,
      };
}

class OrganizationApplication {
  const OrganizationApplication({
    required this.id,
    required this.organisationName,
    required this.contactName,
    required this.contactEmail,
    required this.description,
    required this.status,
    required this.businessSubscriptionActive,
    this.tradingName,
    this.registrationNumber,
    this.contactPhone,
    this.websiteUrl,
    this.category,
    this.city,
    this.province,
    this.planId,
    this.planStatus,
    this.reviewNote,
    this.reviewedAt,
    this.createdAt = '',
    this.updatedAt = '',
  });

  final String id;
  final String organisationName;
  final String? tradingName;
  final String? registrationNumber;
  final String contactName;
  final String contactEmail;
  final String? contactPhone;
  final String? websiteUrl;
  final String? category;
  final String description;
  final String? city;
  final String? province;
  final String status;
  final String? planId;
  final String? planStatus;
  final bool businessSubscriptionActive;
  final String? reviewNote;
  final String? reviewedAt;
  final String createdAt;
  final String updatedAt;

  factory OrganizationApplication.fromJson(Map<String, dynamic> json) =>
      OrganizationApplication(
        id: _string(json['id']),
        organisationName: _string(json['organisationName']),
        tradingName: _optionalString(json['tradingName']),
        registrationNumber: _optionalString(json['registrationNumber']),
        contactName: _string(json['contactName']),
        contactEmail: _string(json['contactEmail']),
        contactPhone: _optionalString(json['contactPhone']),
        websiteUrl: _optionalString(json['websiteUrl']),
        category: _optionalString(json['category']),
        description: _string(json['description']),
        city: _optionalString(json['city']),
        province: _optionalString(json['province']),
        status: _string(json['status']),
        planId: _optionalString(json['planId']),
        planStatus: _optionalString(json['planStatus']),
        businessSubscriptionActive: json['businessSubscriptionActive'] == true,
        reviewNote: _optionalString(json['reviewNote']),
        reviewedAt: _optionalString(json['reviewedAt']),
        createdAt: _string(json['createdAt']),
        updatedAt: _string(json['updatedAt']),
      );
}

class OrganizationReviewResult {
  const OrganizationReviewResult({
    required this.applications,
    required this.changed,
    required this.emailSent,
    this.emailIssue,
  });

  final List<OrganizationApplication> applications;
  final bool changed;
  final bool emailSent;
  final String? emailIssue;

  factory OrganizationReviewResult.fromJson(Map<String, dynamic> json) =>
      OrganizationReviewResult(
        applications: _mapList(json['applications'])
            .map(OrganizationApplication.fromJson)
            .toList(),
        changed: json['changed'] == true,
        emailSent: json['emailSent'] == true,
        emailIssue: _optionalString(json['emailIssue']),
      );
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

/// One message from the public support inbox (bug reports, feature requests,
/// questions). Admins read and resolve these in the admin console.
class SupportMessage {
  const SupportMessage({
    required this.id,
    required this.name,
    required this.email,
    required this.topic,
    required this.message,
    required this.status,
    required this.createdAt,
    this.accountId,
    this.adminNote,
    this.channel = 'form',
    this.aiBrief,
    this.category,
    this.severity,
  });

  final String id;
  final String name;
  final String email;
  final String topic;
  final String message;
  final String status;
  final String createdAt;
  final String? accountId;
  final String? adminNote;
  // Where it came from. A chat report carries a brief the model wrote from the
  // member's own words; the words themselves stay in [message].
  final String channel;
  final String? aiBrief;
  final String? category;
  final String? severity;

  bool get isOpen => status == 'open';

  factory SupportMessage.fromJson(Map<String, dynamic> json) => SupportMessage(
        id: _string(json['id']),
        name: _string(json['name']),
        email: _string(json['email']),
        topic: _string(json['topic']),
        message: _string(json['message']),
        status: _string(json['status']),
        createdAt: _string(json['createdAt']),
        accountId: _optionalString(json['accountId']),
        adminNote: _optionalString(json['adminNote']),
        channel: _string(json['channel'], 'form'),
        aiBrief: _optionalString(json['aiBrief']),
        category: _optionalString(json['category']),
        severity: _optionalString(json['severity']),
      );
}

/// One reply from the help chat. [filedTopic] is set on the turn where the
/// chat handed the report to the admin.
class SupportChatAnswer {
  const SupportChatAnswer({
    required this.reply,
    this.filedTopic,
    this.filedCategory,
    this.filedSeverity,
  });

  final String reply;
  final String? filedTopic;
  final String? filedCategory;
  final String? filedSeverity;

  bool get wasFiled => filedTopic != null;

  factory SupportChatAnswer.fromJson(Map<String, dynamic> json) {
    final answer = _mapOrEmpty(json['answer']);
    final filed = _mapOrEmpty(answer['filed']);
    return SupportChatAnswer(
      reply: _string(answer['reply']),
      filedTopic: _optionalString(filed['topic']),
      filedCategory: _optionalString(filed['category']),
      filedSeverity: _optionalString(filed['severity']),
    );
  }
}

/// One day of Cloudflare zone traffic.
class AdminTrafficDay {
  const AdminTrafficDay({
    required this.date,
    required this.requests,
    required this.pageViews,
    required this.uniques,
    required this.bytes,
  });

  final String date;
  final int requests;
  final int pageViews;
  final int uniques;
  final int bytes;

  factory AdminTrafficDay.fromJson(Map<String, dynamic> json) =>
      AdminTrafficDay(
        date: _string(json['date']),
        requests: _int(json['requests']),
        pageViews: _int(json['pageViews']),
        uniques: _int(json['uniques']),
        bytes: _int(json['bytes']),
      );
}

/// Cloudflare traffic. [configured] is false until a read token is set on the
/// server, in which case [issue] says what to set.
class AdminTrafficReport {
  const AdminTrafficReport({
    required this.configured,
    this.days = const [],
    this.issue,
    this.requests = 0,
    this.pageViews = 0,
    this.uniques = 0,
    this.bytes = 0,
  });

  final bool configured;
  final List<AdminTrafficDay> days;
  final String? issue;
  final int requests;
  final int pageViews;
  final int uniques;
  final int bytes;

  bool get hasData => configured && issue == null && days.isNotEmpty;

  factory AdminTrafficReport.fromJson(Map<String, dynamic> json) {
    final totals = _mapOrEmpty(json['totals']);
    return AdminTrafficReport(
      configured: json['configured'] == true,
      days: _mapList(json['days']).map(AdminTrafficDay.fromJson).toList(),
      issue: _optionalString(json['issue']),
      requests: _int(totals['requests']),
      pageViews: _int(totals['pageViews']),
      uniques: _int(totals['uniques']),
      bytes: _int(totals['bytes']),
    );
  }
}

/// Member-side analytics. Every series is aligned to [days], oldest first.
class AdminAnalyticsReport {
  const AdminAnalyticsReport({
    required this.windowDays,
    required this.days,
    required this.signups,
    required this.activeMembers,
    required this.dealViews,
    required this.topSearches,
    required this.traffic,
    this.accountCount = 0,
    this.activeToday = 0,
    this.activeThisWeek = 0,
    this.bannedCount = 0,
    this.neverSeenCount = 0,
    this.dealViewsInWindow = 0,
  });

  final int windowDays;
  final List<String> days;
  final List<int> signups;
  final List<int> activeMembers;
  final List<int> dealViews;
  final List<({String term, int count})> topSearches;
  final AdminTrafficReport traffic;
  final int accountCount;
  final int activeToday;
  final int activeThisWeek;
  final int bannedCount;
  final int neverSeenCount;
  final int dealViewsInWindow;

  factory AdminAnalyticsReport.fromJson(Map<String, dynamic> json) {
    final members = _mapOrEmpty(json['members']);
    final totals = _mapOrEmpty(members['totals']);
    List<int> series(Object? value) =>
        (value is List ? value : const []).map(_int).toList();
    return AdminAnalyticsReport(
      windowDays: _int(json['windowDays']),
      days: (members['days'] is List ? members['days'] as List : const [])
          .map(_string)
          .toList(),
      signups: series(members['signups']),
      activeMembers: series(members['activeMembers']),
      dealViews: series(members['dealViews']),
      topSearches: _mapList(members['topSearches'])
          .map((row) => (term: _string(row['term']), count: _int(row['count'])))
          .toList(),
      traffic: AdminTrafficReport.fromJson(_mapOrEmpty(json['traffic'])),
      accountCount: _int(totals['accountCount']),
      activeToday: _int(totals['activeToday']),
      activeThisWeek: _int(totals['activeThisWeek']),
      bannedCount: _int(totals['bannedCount']),
      neverSeenCount: _int(totals['neverSeenCount']),
      dealViewsInWindow: _int(totals['dealViewsInWindow']),
    );
  }
}

class AdminOverview {
  const AdminOverview({
    required this.accounts,
    required this.accountCount,
    required this.planCounts,
    required this.dealCount,
    required this.leafletCount,
    required this.sourceCount,
    this.countries = const [
      CountryOption(
        code: 'ZA',
        currencyCode: 'ZAR',
        flag: '🇿🇦',
        name: 'South Africa',
      ),
    ],
    this.selectedCountry = const CountryOption(
      code: 'ZA',
      currencyCode: 'ZAR',
      flag: '🇿🇦',
      name: 'South Africa',
    ),
    this.memberCountries = const [],
    this.storeCount = 0,
    this.support = const [],
    this.supportOpenCount = 0,
    this.lastScoutedAt,
  });

  final List<MemberAccount> accounts;
  final int accountCount;
  final Map<String, int> planCounts;
  final int dealCount;
  final int leafletCount;
  final int sourceCount;
  final List<CountryOption> countries;

  /// Countries that actually have members, most populous first.
  final List<MemberCountryTally> memberCountries;
  final CountryOption selectedCountry;
  final int storeCount;
  final List<SupportMessage> support;
  final int supportOpenCount;
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
      countries:
          _mapList(json['countries']).map(CountryOption.fromJson).toList(),
      memberCountries: _mapList(json['memberCountries'])
          .map(MemberCountryTally.fromJson)
          .toList(),
      selectedCountry:
          CountryOption.fromJson(_mapOrEmpty(json['selectedCountry'])),
      storeCount: _int(scout['storeCount']),
      support: _mapList(json['support']).map(SupportMessage.fromJson).toList(),
      supportOpenCount: _int(summary['supportOpenCount']),
      lastScoutedAt: _optionalString(scout['lastScoutedAt']),
    );
  }
}

/// A country that has members, with how many. Drives the console's country
/// filter, so it offers the countries worth picking rather than the world.
class MemberCountryTally {
  const MemberCountryTally({
    required this.code,
    required this.memberCount,
    required this.name,
  });

  final String code;
  final int memberCount;
  final String name;

  factory MemberCountryTally.fromJson(Map<String, dynamic> json) =>
      MemberCountryTally(
        code: _string(json['code']).toUpperCase(),
        memberCount: _int(json['memberCount']),
        name: _string(json['name']),
      );

  Map<String, dynamic> toJson() =>
      {'code': code, 'memberCount': memberCount, 'name': name};
}

/// A regional-indicator pair renders as the country's flag on every platform.
String countryFlag(String code) {
  final upper = code.trim().toUpperCase();
  if (upper.length != 2 || !RegExp(r'^[A-Z]{2}$').hasMatch(upper)) return '🏳️';
  return String.fromCharCodes([
    for (final unit in upper.codeUnits) 0x1F1E6 + unit - 65,
  ]);
}

class NearbyResult {
  const NearbyResult({required this.stores, this.country});
  final List<NearbyStore> stores;
  final CountryOption? country;

  Map<String, dynamic> toJson() => {
        'stores': stores.map((store) => store.toJson()).toList(),
        if (country != null) 'country': _countryToJson(country!),
      };

  factory NearbyResult.fromJson(Map<String, dynamic> json) => NearbyResult(
        stores: _mapList(json['stores']).map(NearbyStore.fromJson).toList(),
        country: _countryOptionOrNull(json['country']),
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
    this.countryCode,
    this.countryName,
    this.firstSeenAt,
    this.lastSeenAt,
    this.promotionCount = 0,
    this.detailsLoaded = true,
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
  final String? countryCode;
  final String? countryName;
  final String? firstSeenAt;
  final String? lastSeenAt;
  final int promotionCount;
  final bool detailsLoaded;
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
      countryCode: _optionalString(json['countryCode']),
      countryName: _optionalString(json['countryName']),
      firstSeenAt: _optionalString(json['firstSeenAt']),
      lastSeenAt: _optionalString(json['lastSeenAt']),
      promotionCount: _int(json['promotionCount']),
      detailsLoaded: json['detailsLoaded'] != false,
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
        'countryCode': countryCode,
        'countryName': countryName,
        'firstSeenAt': firstSeenAt,
        'lastSeenAt': lastSeenAt,
        'promotionCount': promotionCount,
        'detailsLoaded': detailsLoaded,
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
    this.id,
    this.retailerId,
    this.sourceUrl,
    this.sourceLabel,
    this.pagesUrl,
    this.capturedAt,
    this.validFrom,
    this.validTo,
    this.imageUrl,
    this.retailerLogoUrl,
    this.retailerName,
    this.pages = const [],
  });
  final String name;
  final String url;
  final String? id;
  final String? retailerId;
  final String? sourceUrl;
  final String? sourceLabel;
  final String? pagesUrl;
  final String? capturedAt;
  final String? validFrom;
  final String? validTo;
  final String? imageUrl;
  final String? retailerLogoUrl;
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
        id: _optionalString(json['id']),
        retailerId: _optionalString(json['retailerId']),
        name: _string(json['name'], 'Catalogue'),
        url: _string(json['documentUrl'] ?? json['url']),
        sourceUrl: _optionalString(json['sourceUrl'] ?? json['url']),
        sourceLabel: _optionalString(json['sourceLabel']),
        pagesUrl: _optionalString(json['pagesUrl']),
        capturedAt: _optionalString(json['capturedAt']),
        validFrom: _optionalString(json['validFrom']),
        validTo: _optionalString(json['validTo']),
        imageUrl: _optionalString(json['imageUrl']),
        retailerLogoUrl: _optionalString(json['retailerLogoUrl']),
        retailerName: _optionalString(json['retailerName']),
        pages: _mapList(json['pages']).map(CataloguePage.fromJson).toList(),
      );

  factory Catalogue.fromPromotion(Map<String, dynamic> json) => Catalogue(
        id: _optionalString(json['id']),
        retailerId: _optionalString(json['retailerId']),
        name: _string(json['title'], 'Specials'),
        url: _string(json['productUrl'] ?? json['sourceUrl']),
        sourceUrl: _optionalString(json['sourceUrl']),
        sourceLabel: _optionalString(json['sourceLabel']),
        capturedAt: _optionalString(json['capturedAt']),
        validFrom: _optionalString(json['validFrom']),
        validTo: _optionalString(json['validTo']),
        imageUrl: _optionalString(json['imageUrl']),
        retailerLogoUrl: _optionalString(json['retailerLogoUrl']),
        retailerName: _optionalString(json['storeName']),
        pages: _mapList(json['pages']).map(CataloguePage.fromJson).toList(),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'retailerId': retailerId,
        'name': name,
        'documentUrl': url,
        'url': sourceUrl ?? url,
        'sourceUrl': sourceUrl,
        'sourceLabel': sourceLabel,
        'pagesUrl': pagesUrl,
        'capturedAt': capturedAt,
        'validFrom': validFrom,
        'validTo': validTo,
        'imageUrl': imageUrl,
        'retailerLogoUrl': retailerLogoUrl,
        'retailerName': retailerName,
        'pages': pages.map((page) => page.toJson()).toList(),
      };

  Catalogue copyWith({List<CataloguePage>? pages}) => Catalogue(
        id: id,
        retailerId: retailerId,
        name: name,
        url: url,
        sourceUrl: sourceUrl,
        sourceLabel: sourceLabel,
        pagesUrl: pagesUrl,
        capturedAt: capturedAt,
        validFrom: validFrom,
        validTo: validTo,
        imageUrl: imageUrl,
        retailerLogoUrl: retailerLogoUrl,
        retailerName: retailerName,
        pages: pages ?? this.pages,
      );
}

enum ScoutChatRole { assistant, user }

class ScoutChatTurn {
  const ScoutChatTurn({required this.role, required this.text});

  final ScoutChatRole role;
  final String text;

  Map<String, dynamic> toJson() => {
        'role': role.name,
        'text': text,
      };
}

class ScoutChatDealCard {
  const ScoutChatDealCard({
    required this.id,
    required this.retailerName,
    required this.title,
    required this.priceText,
    required this.productUrl,
    this.previousPriceText,
    this.savingText,
    this.imageUrl,
    this.soldOut = false,
  });

  final String id;
  final String retailerName;
  final String title;
  final String priceText;
  final String productUrl;
  final String? previousPriceText;
  final String? savingText;
  final String? imageUrl;
  final bool soldOut;

  factory ScoutChatDealCard.fromJson(Map<String, dynamic> json) =>
      ScoutChatDealCard(
        id: _string(json['id']),
        retailerName: _string(json['retailerName'], 'Retailer'),
        title: _string(json['title'], 'Deal'),
        priceText: _string(json['priceText']),
        productUrl: _string(json['productUrl']),
        previousPriceText: _optionalString(json['previousPriceText']),
        savingText: _optionalString(json['savingText']),
        imageUrl: _optionalString(json['imageUrl']),
        soldOut: json['soldOut'] == true,
      );
}

class ScoutChatCatalogueCard {
  const ScoutChatCatalogueCard({
    required this.id,
    required this.retailerName,
    required this.name,
    required this.url,
    required this.pageCount,
    this.imageUrl,
    this.pageImageUrls = const [],
    this.pagesUrl,
    this.validTo,
  });

  final String id;
  final String retailerName;
  final String name;
  final String url;
  final int pageCount;
  final String? imageUrl;
  final List<String> pageImageUrls;
  final String? pagesUrl;
  final String? validTo;

  factory ScoutChatCatalogueCard.fromJson(Map<String, dynamic> json) =>
      ScoutChatCatalogueCard(
        id: _string(json['id']),
        retailerName: _string(json['retailerName'], 'Retailer'),
        name: _string(json['name'], 'Catalogue'),
        url: _string(json['url']),
        pageCount: _int(json['pageCount']),
        imageUrl: _optionalString(json['imageUrl']),
        pageImageUrls: _stringList(json['pageImageUrls']),
        pagesUrl: _optionalString(json['pagesUrl']),
        validTo: _optionalString(json['validTo']),
      );

  Catalogue toCatalogue() => Catalogue(
        id: id,
        name: name,
        url: url,
        sourceUrl: url,
        validTo: validTo,
        imageUrl: imageUrl,
        retailerName: retailerName,
        pagesUrl: pagesUrl,
        pages: [
          for (var index = 0; index < pageImageUrls.length; index++)
            CataloguePage(
              pageNumber: index + 1,
              imageUrl: pageImageUrls[index],
            ),
        ],
      );
}

class ScoutGroceryPlanItem {
  const ScoutGroceryPlanItem({
    required this.assumption,
    required this.group,
    required this.id,
    required this.lineTotalCents,
    required this.lineTotalText,
    required this.priceText,
    required this.productUrl,
    required this.quantity,
    required this.retailerId,
    required this.retailerName,
    required this.sourceUrl,
    required this.title,
    required this.unitPriceCents,
    this.imageUrl,
    this.previousPriceText,
    this.promotionText,
  });

  final String assumption;
  final String group;
  final String id;
  final String? imageUrl;
  final int lineTotalCents;
  final String lineTotalText;
  final String? previousPriceText;
  final String priceText;
  final String productUrl;
  final String? promotionText;
  final int quantity;
  final String retailerId;
  final String retailerName;
  final String sourceUrl;
  final String title;
  final int unitPriceCents;

  factory ScoutGroceryPlanItem.fromJson(Map<String, dynamic> json) =>
      ScoutGroceryPlanItem(
        assumption: _string(json['assumption']),
        group: _string(json['group'], 'Grocery'),
        id: _string(json['id']),
        imageUrl: _optionalString(json['imageUrl']),
        lineTotalCents: _int(json['lineTotalCents']),
        lineTotalText: _string(json['lineTotalText']),
        previousPriceText: _optionalString(json['previousPriceText']),
        priceText: _string(json['priceText']),
        productUrl: _string(json['productUrl']),
        promotionText: _optionalString(json['promotionText']),
        quantity: _int(json['quantity']).clamp(1, 99),
        retailerId: _string(json['retailerId']),
        retailerName: _string(json['retailerName'], 'Store'),
        sourceUrl: _string(json['sourceUrl']),
        title: _string(json['title'], 'Grocery item'),
        unitPriceCents: _int(json['unitPriceCents']),
      );

  ScoutGroceryPlanItem copyWithQuantity(int value) => ScoutGroceryPlanItem(
        assumption: assumption,
        group: group,
        id: id,
        imageUrl: imageUrl,
        lineTotalCents: unitPriceCents * value.clamp(1, 99),
        lineTotalText: lineTotalText,
        previousPriceText: previousPriceText,
        priceText: priceText,
        productUrl: productUrl,
        promotionText: promotionText,
        quantity: value.clamp(1, 99),
        retailerId: retailerId,
        retailerName: retailerName,
        sourceUrl: sourceUrl,
        title: title,
        unitPriceCents: unitPriceCents,
      );

  Map<String, dynamic> toJson() => {
        'assumption': assumption,
        'group': group,
        'id': id,
        if (imageUrl != null) 'imageUrl': imageUrl,
        'lineTotalCents': unitPriceCents * quantity,
        'lineTotalText': lineTotalText,
        if (previousPriceText != null) 'previousPriceText': previousPriceText,
        'priceText': priceText,
        'productUrl': productUrl,
        if (promotionText != null) 'promotionText': promotionText,
        'quantity': quantity,
        'retailerId': retailerId,
        'retailerName': retailerName,
        'sourceUrl': sourceUrl,
        'title': title,
        'unitPriceCents': unitPriceCents,
      };
}

class ScoutGroceryPlan {
  const ScoutGroceryPlan({
    required this.assumptions,
    required this.currencyCode,
    required this.items,
    required this.maxStores,
    required this.missingItems,
    required this.storeCount,
    required this.subtotalCents,
    required this.subtotalText,
    required this.totalCents,
    required this.totalText,
    required this.tradeOffs,
  });

  final List<String> assumptions;
  final String currencyCode;
  final List<ScoutGroceryPlanItem> items;
  final int maxStores;
  final List<String> missingItems;
  final int storeCount;
  final int subtotalCents;
  final String subtotalText;
  final int totalCents;
  final String totalText;
  final List<String> tradeOffs;

  factory ScoutGroceryPlan.fromJson(Map<String, dynamic> json) =>
      ScoutGroceryPlan(
        assumptions: _stringList(json['assumptions']),
        currencyCode: _string(json['currencyCode'], 'ZAR'),
        items: _mapList(json['items'])
            .map(ScoutGroceryPlanItem.fromJson)
            .toList(growable: false),
        maxStores: _int(json['maxStores']),
        missingItems: _stringList(json['missingItems']),
        storeCount: _int(json['storeCount']),
        subtotalCents: _int(json['subtotalCents']),
        subtotalText: _string(json['subtotalText']),
        totalCents: _int(json['totalCents']),
        totalText: _string(json['totalText']),
        tradeOffs: _stringList(json['tradeOffs']),
      );

  Map<String, dynamic> toJson() => {
        'assumptions': assumptions,
        'currencyCode': currencyCode,
        'items': items.map((item) => item.toJson()).toList(growable: false),
        'maxStores': maxStores,
        'missingItems': missingItems,
        'storeCount': storeCount,
        'subtotalCents': subtotalCents,
        'subtotalText': subtotalText,
        'totalCents': totalCents,
        'totalText': totalText,
        'tradeOffs': tradeOffs,
      };
}

class ScoutChatAnswer {
  const ScoutChatAnswer({
    required this.reply,
    this.deals = const [],
    this.catalogues = const [],
    this.followUps = const [],
    this.groceryPlan,
  });

  final String reply;
  final List<ScoutChatDealCard> deals;
  final List<ScoutChatCatalogueCard> catalogues;
  final List<String> followUps;
  final ScoutGroceryPlan? groceryPlan;

  factory ScoutChatAnswer.fromJson(Map<String, dynamic> json) =>
      ScoutChatAnswer(
        reply: _string(
          json['reply'],
          'Mr Scout could not answer right now.',
        ),
        deals: _mapList(json['deals'])
            .map(ScoutChatDealCard.fromJson)
            .toList(growable: false),
        catalogues: _mapList(json['catalogues'])
            .map(ScoutChatCatalogueCard.fromJson)
            .toList(growable: false),
        followUps: _stringList(json['followUps']),
        groceryPlan: json['groceryPlan'] is Map
            ? ScoutGroceryPlan.fromJson(_mapOrEmpty(json['groceryPlan']))
            : null,
      );
}

class ScoutVoiceSource {
  const ScoutVoiceSource({required this.title, required this.url});

  final String title;
  final String url;

  factory ScoutVoiceSource.fromJson(Map<String, dynamic> json) =>
      ScoutVoiceSource(
        title: _string(json['title'], 'Source'),
        url: _string(json['url']),
      );
}

class ScoutVoiceReply {
  const ScoutVoiceReply({
    required this.answer,
    required this.audioBytes,
    required this.mediaType,
    required this.model,
    this.sources = const [],
  });

  final String answer;
  final List<int> audioBytes;
  final String mediaType;
  final String model;
  final List<ScoutVoiceSource> sources;

  factory ScoutVoiceReply.fromJson(Map<String, dynamic> json) {
    final encoded = _string(json['audioBase64']);
    return ScoutVoiceReply(
      answer: _string(json['answer'], 'Mr Scout could not answer right now.'),
      audioBytes: encoded.isEmpty ? const [] : base64Decode(encoded),
      mediaType: _string(json['mediaType'], 'audio/mpeg'),
      model: _string(json['model'], 's2.1-pro-free'),
      sources: _mapList(json['sources'])
          .map(ScoutVoiceSource.fromJson)
          .toList(growable: false),
    );
  }
}

class DiscoveredStoresResult {
  const DiscoveredStoresResult({
    required this.stores,
    required this.storeCount,
    required this.areaCount,
    required this.knownChainCount,
    required this.withPromotionsCount,
    this.hasMore = false,
    this.limit = 0,
    this.offset = 0,
    this.country,
  });

  final List<NearbyStore> stores;
  final int storeCount;
  final int areaCount;
  final int knownChainCount;
  final int withPromotionsCount;
  final bool hasMore;
  final int limit;
  final int offset;
  final CountryOption? country;

  factory DiscoveredStoresResult.fromJson(Map<String, dynamic> json) {
    final summary = _mapOrEmpty(json['summary']);
    final pagination = _mapOrEmpty(json['pagination']);
    return DiscoveredStoresResult(
      stores: _mapList(json['stores']).map(NearbyStore.fromJson).toList(),
      storeCount: _int(summary['storeCount']),
      areaCount: _int(summary['areaCount']),
      knownChainCount: _int(summary['knownChainCount']),
      withPromotionsCount: _int(summary['withPromotionsCount']),
      hasMore: pagination['hasMore'] == true,
      limit: _int(pagination['limit']),
      offset: _int(pagination['offset']),
      country: _countryOptionOrNull(json['country']),
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
/// external deal sites, verified Trolley Scout business posts, and the
/// platform's own discovery feed.
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
    this.unitText,
    this.imageUrl,
    this.images = const [],
    this.category,
    this.expiresAt,
    this.capturedAt,
    this.soldOut = false,
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
  final String? unitText;
  final String? imageUrl;
  final List<String> images;
  final String? category;
  final String? expiresAt;
  final String? capturedAt;

  /// Only ever true because the site said so. The reel sources that say nothing
  /// about stock leave this false rather than guessing.
  final bool soldOut;

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

  bool get isBusinessPublication =>
      source == 'trolleyscout-business' && id.startsWith('org-pub-');

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
        unitText: _optionalString(json['unitText']),
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
        capturedAt: _optionalString(json['capturedAt']),
        soldOut: json['soldOut'] == true,
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
        'unitText': unitText,
        'imageUrl': imageUrl,
        if (images.isNotEmpty) 'images': images,
        'category': category,
        'expiresAt': expiresAt,
        if (capturedAt != null) 'capturedAt': capturedAt,
        // Round-trips so a saved deal keeps saying it is gone.
        if (soldOut) 'soldOut': true,
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
        addedAt: this.capturedAt ?? '',
        capturedAt:
            capturedAt?.toUtc().toIso8601String() ?? this.capturedAt ?? '',
        evidenceText: 'Found by Trolley Scout from the $sourceLabel feed.',
        priceText: priceText,
        previousPriceText: previousPriceText,
        savingText: savingText,
        unitText: unitText,
        productUrl: productUrl,
        imageUrl: imageUrl,
        images: gallery,
        soldOut: soldOut,
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
        unitText: deal.unitText,
        imageUrl: deal.imageUrl,
        images: deal.gallery,
        category: null,
        expiresAt: null,
        capturedAt: deal.capturedAt.isEmpty ? null : deal.capturedAt,
        soldOut: deal.soldOut,
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
    this.country,
  });

  final List<PropertyListing> listings;
  final List<PropertyPortalSource> sources;
  final String listingType;
  final int page;
  final String? locationText;
  final CountryOption? country;

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
        country: _countryOptionOrNull(json['country']),
      );
}

/// How many shoppers saved a deal, and whether the current shopper did.
/// How a Window Shopping deal is doing socially: how many shoppers saved it,
/// whether this shopper did, and how busy its comment thread is. The comment
/// total is shown on the card so nobody has to open a thread to find it empty.
class SaveStat {
  const SaveStat({
    required this.count,
    required this.saved,
    this.commentCount = 0,
  });

  final int count;
  final bool saved;
  final int commentCount;

  factory SaveStat.fromJson(Map<String, dynamic> json) =>
      SaveStat(count: _int(json['count']), saved: json['saved'] == true);

  SaveStat withCommentCount(int value) =>
      SaveStat(count: count, saved: saved, commentCount: value);
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
    this.expiringSavedDealCount = 0,
    this.expiringSavedDealTitle,
    this.priceDropCount = 0,
    this.priceDropTitle,
  });

  final bool enabled;
  final int latestCursor;
  final int totalNewDealCount;
  final bool countCapped;

  /// Saved deals whose live price fell meaningfully below the saved price.
  final int priceDropCount;

  /// The biggest of those drops, named so a single alert can be specific.
  final String? priceDropTitle;

  /// Saved offers closing within the next few days, so the shopper can be
  /// told before the price they saved disappears.
  final int expiringSavedDealCount;

  /// The soonest of those, named so a single-deal warning can be specific.
  final String? expiringSavedDealTitle;

  factory DealAlertSummary.fromJson(Map<String, dynamic> json) {
    final expiring = json['expiringSavedDeals'];
    final first =
        expiring is List && expiring.isNotEmpty ? expiring.first : null;
    final drops = json['priceDrops'];
    final firstDrop = drops is List && drops.isNotEmpty ? drops.first : null;

    return DealAlertSummary(
      enabled: json['enabled'] == true,
      latestCursor: _int(json['latestCursor']),
      totalNewDealCount: _int(json['totalNewDealCount']),
      countCapped: json['countCapped'] == true,
      expiringSavedDealCount: _int(json['expiringSavedDealCount']),
      expiringSavedDealTitle:
          first is Map<String, dynamic> ? _string(first['title']) : null,
      priceDropCount: _int(json['priceDropCount']),
      priceDropTitle:
          firstDrop is Map<String, dynamic> ? _string(firstDrop['title']) : null,
    );
  }
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

CountryOption? _countryOptionOrNull(Object? value) {
  final map = _mapOrNull(value);
  return map == null ? null : CountryOption.fromJson(map);
}

Map<String, dynamic> _countryToJson(CountryOption country) => {
      'code': country.code,
      'currencyCode': country.currencyCode,
      'flag': country.flag,
      'name': country.name,
      if (country.capital != null) 'capital': country.capital,
    };

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
    this.steps = const [],
  });

  final List<List<double>> path; // [lat, lon] pairs
  final double distanceMeters;
  final double durationSeconds;
  final List<MapRouteStep> steps;
}

class MapRouteStep {
  const MapRouteStep({
    required this.type,
    required this.modifier,
    required this.name,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.location,
  });

  final String type;
  final String modifier;
  final String name;
  final double distanceMeters;
  final double durationSeconds;
  final List<double> location; // [lat, lon]

  factory MapRouteStep.fromJson(Map<String, dynamic> json) => MapRouteStep(
        type: _string(json['type'], 'turn'),
        modifier: _string(json['modifier']),
        name: _string(json['name']),
        distanceMeters: (json['distanceMeters'] as num?)?.toDouble() ?? 0,
        durationSeconds: (json['durationSeconds'] as num?)?.toDouble() ?? 0,
        location: (json['location'] as List?)
                ?.whereType<num>()
                .map((value) => value.toDouble())
                .take(2)
                .toList(growable: false) ??
            const [],
      );
}
