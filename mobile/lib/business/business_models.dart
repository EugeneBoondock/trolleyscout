import '../api_models.dart';

enum BusinessPublicationKind {
  deal,
  special,
  promotion,
  post;

  String get label => switch (this) {
        deal => 'Deal',
        special => 'Special',
        promotion => 'Promotion',
        post => 'Post',
      };
}

enum BusinessPublicationPlacement {
  marketplace,
  window,
  both;

  String get label => switch (this) {
        marketplace => 'Marketplace',
        window => 'Window Shopping',
        both => 'Both',
      };
}

enum BusinessPublicationStatus {
  draft,
  submitted,
  changesRequested,
  scheduled,
  live,
  paused,
  expired,
  rejected,
  archived;

  factory BusinessPublicationStatus.fromJson(Object? value) => switch (value) {
        'submitted' => submitted,
        'changes_requested' => changesRequested,
        'scheduled' => scheduled,
        'live' => live,
        'paused' => paused,
        'expired' => expired,
        'rejected' => rejected,
        'archived' => archived,
        _ => draft,
      };

  String get apiValue => switch (this) {
        changesRequested => 'changes_requested',
        _ => name,
      };

  String get label => switch (this) {
        changesRequested => 'Changes requested',
        _ => '${name[0].toUpperCase()}${name.substring(1)}',
      };

  bool get needsAttention => this == changesRequested || this == rejected;

  bool get countsAsActive => this == live || this == scheduled;
}

class BusinessOrganization {
  const BusinessOrganization({
    required this.id,
    required this.name,
    required this.slug,
    required this.status,
  });

  factory BusinessOrganization.fromJson(Map<String, dynamic> json) =>
      BusinessOrganization(
        id: _string(json['id']),
        name: _string(json['name']),
        slug: _string(json['slug']),
        status: _string(json['status'], 'active'),
      );

  final String id;
  final String name;
  final String slug;
  final String status;
}

class BusinessGate {
  const BusinessGate({
    required this.applicationStatus,
    required this.hasOrganization,
    this.message,
    this.organization,
  });

  factory BusinessGate.fromJson(Map<String, dynamic> json) => BusinessGate(
        applicationStatus: _optionalString(json['applicationStatus']),
        hasOrganization: json['hasOrganization'] == true,
        message: _optionalString(json['message']),
        organization: json['organization'] is Map
            ? BusinessOrganization.fromJson(_map(json['organization']))
            : null,
      );

  static const signedOut = BusinessGate(
    applicationStatus: null,
    hasOrganization: false,
  );

  final String? applicationStatus;
  final bool hasOrganization;
  final String? message;
  final BusinessOrganization? organization;
}

class BusinessPublicationDraft {
  const BusinessPublicationDraft({
    required this.kind,
    required this.placement,
    required this.title,
    required this.bodyText,
    this.targetUrl,
    this.imageUrl,
    this.imageAlt,
    this.priceCents,
    this.previousPriceCents,
    this.currencyCode = 'ZAR',
    this.offerText,
    this.couponCode,
    this.startsAt,
    this.endsAt,
    this.locationIds = const [],
    this.soldOut = false,
  });

  final BusinessPublicationKind kind;
  final BusinessPublicationPlacement placement;
  final String title;
  final String bodyText;
  final String? targetUrl;
  final String? imageUrl;
  final String? imageAlt;
  final int? priceCents;
  final int? previousPriceCents;
  final String currencyCode;
  final String? offerText;
  final String? couponCode;
  final String? startsAt;
  final String? endsAt;
  final List<String> locationIds;
  final bool soldOut;

  Map<String, dynamic> toJson() => {
        'kind': kind.name,
        'placement': placement.name,
        'title': title.trim(),
        'bodyText': bodyText.trim(),
        'currencyCode': currencyCode,
        'locationIds': locationIds,
        'soldOut': soldOut,
        if (_present(targetUrl)) 'targetUrl': targetUrl!.trim(),
        if (_present(imageUrl)) 'imageUrl': imageUrl!.trim(),
        if (_present(imageAlt)) 'imageAlt': imageAlt!.trim(),
        if (priceCents != null) 'priceCents': priceCents,
        if (previousPriceCents != null)
          'previousPriceCents': previousPriceCents,
        if (_present(offerText)) 'offerText': offerText!.trim(),
        if (_present(couponCode)) 'couponCode': couponCode!.trim(),
        if (_present(startsAt)) 'startsAt': startsAt,
        if (_present(endsAt)) 'endsAt': endsAt,
      };
}

class BusinessPublication extends BusinessPublicationDraft {
  const BusinessPublication({
    required this.id,
    required this.organizationId,
    required this.organizationName,
    required this.organizationSlug,
    required this.createdBy,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    required super.kind,
    required super.placement,
    required super.title,
    required super.bodyText,
    super.targetUrl,
    super.imageUrl,
    super.imageAlt,
    super.priceCents,
    super.previousPriceCents,
    super.currencyCode,
    super.offerText,
    super.couponCode,
    super.startsAt,
    super.endsAt,
    super.locationIds,
    super.soldOut,
    this.reviewNote,
    this.reviewedAt,
  });

  factory BusinessPublication.fromJson(Map<String, dynamic> json) =>
      BusinessPublication(
        id: _string(json['id']),
        organizationId: _string(json['organizationId']),
        organizationName: _string(json['organizationName']),
        organizationSlug: _string(json['organizationSlug']),
        createdBy: _string(json['createdBy']),
        status: BusinessPublicationStatus.fromJson(json['status']),
        createdAt: _string(json['createdAt']),
        updatedAt: _string(json['updatedAt']),
        kind: _kind(json['kind']),
        placement: _placement(json['placement']),
        title: _string(json['title']),
        bodyText: _string(json['bodyText']),
        targetUrl: _optionalString(json['targetUrl']),
        imageUrl: _optionalString(json['imageUrl']),
        imageAlt: _optionalString(json['imageAlt']),
        priceCents: _optionalInt(json['priceCents']),
        previousPriceCents: _optionalInt(json['previousPriceCents']),
        currencyCode: _string(json['currencyCode'], 'ZAR'),
        offerText: _optionalString(json['offerText']),
        couponCode: _optionalString(json['couponCode']),
        startsAt: _optionalString(json['startsAt']),
        endsAt: _optionalString(json['endsAt']),
        locationIds: _stringList(json['locationIds']),
        soldOut: json['soldOut'] == true,
        reviewNote: _optionalString(json['reviewNote']),
        reviewedAt: _optionalString(json['reviewedAt']),
      );

  final String id;
  final String organizationId;
  final String organizationName;
  final String organizationSlug;
  final String createdBy;
  final BusinessPublicationStatus status;
  final String createdAt;
  final String updatedAt;
  final String? reviewNote;
  final String? reviewedAt;

  BusinessPublicationDraft get draft => BusinessPublicationDraft(
        kind: kind,
        placement: placement,
        title: title,
        bodyText: bodyText,
        targetUrl: targetUrl,
        imageUrl: imageUrl,
        imageAlt: imageAlt,
        priceCents: priceCents,
        previousPriceCents: previousPriceCents,
        currencyCode: currencyCode,
        offerText: offerText,
        couponCode: couponCode,
        startsAt: startsAt,
        endsAt: endsAt,
        locationIds: locationIds,
        soldOut: soldOut,
      );
}

class BusinessLocationDraft {
  const BusinessLocationDraft({
    required this.name,
    required this.addressLine,
    required this.city,
    this.province,
    this.countryCode = 'ZA',
    this.latitude,
    this.longitude,
    this.websiteUrl,
    this.status = 'active',
  });

  final String name;
  final String addressLine;
  final String city;
  final String? province;
  final String countryCode;
  final double? latitude;
  final double? longitude;
  final String? websiteUrl;
  final String status;

  Map<String, dynamic> toJson() => {
        'name': name.trim(),
        'addressLine': addressLine.trim(),
        'city': city.trim(),
        'countryCode': countryCode,
        'status': status,
        if (_present(province)) 'province': province!.trim(),
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
        if (_present(websiteUrl)) 'websiteUrl': websiteUrl!.trim(),
      };
}

class BusinessLocation extends BusinessLocationDraft {
  const BusinessLocation({
    required this.id,
    required this.organizationId,
    required this.createdAt,
    required this.updatedAt,
    required super.name,
    required super.addressLine,
    required super.city,
    super.province,
    super.countryCode,
    super.latitude,
    super.longitude,
    super.websiteUrl,
    super.status,
  });

  factory BusinessLocation.fromJson(Map<String, dynamic> json) =>
      BusinessLocation(
        id: _string(json['id']),
        organizationId: _string(json['organizationId']),
        createdAt: _string(json['createdAt']),
        updatedAt: _string(json['updatedAt']),
        name: _string(json['name']),
        addressLine: _string(json['addressLine']),
        city: _string(json['city']),
        province: _optionalString(json['province']),
        countryCode: _string(json['countryCode'], 'ZA'),
        latitude: _optionalDouble(json['latitude']),
        longitude: _optionalDouble(json['longitude']),
        websiteUrl: _optionalString(json['websiteUrl']),
        status: _string(json['status'], 'active'),
      );

  final String id;
  final String organizationId;
  final String createdAt;
  final String updatedAt;
}

class BusinessMetricTotals {
  const BusinessMetricTotals({
    this.impressions = 0,
    this.opens = 0,
    this.saves = 0,
    this.outboundVisits = 0,
  });

  factory BusinessMetricTotals.fromJson(Map<String, dynamic> json) =>
      BusinessMetricTotals(
        impressions: _int(json['impressions']),
        opens: _int(json['opens']),
        saves: _int(json['saves']),
        outboundVisits: _int(json['outboundVisits']),
      );

  final int impressions;
  final int opens;
  final int saves;
  final int outboundVisits;
}

class BusinessMetricDay extends BusinessMetricTotals {
  const BusinessMetricDay({
    required this.date,
    super.impressions,
    super.opens,
    super.saves,
    super.outboundVisits,
  });

  factory BusinessMetricDay.fromJson(Map<String, dynamic> json) =>
      BusinessMetricDay(
        date: _string(json['date']),
        impressions: _int(json['impressions']),
        opens: _int(json['opens']),
        saves: _int(json['saves']),
        outboundVisits: _int(json['outboundVisits']),
      );

  final String date;
}

class BusinessMetrics {
  const BusinessMetrics({
    required this.days,
    required this.rangeDays,
    required this.totals,
  });

  factory BusinessMetrics.fromJson(Map<String, dynamic> json) =>
      BusinessMetrics(
        days: _mapList(json['days']).map(BusinessMetricDay.fromJson).toList(),
        rangeDays: _int(json['rangeDays'], 30),
        totals: BusinessMetricTotals.fromJson(_map(json['totals'])),
      );

  static const empty = BusinessMetrics(
    days: [],
    rangeDays: 30,
    totals: BusinessMetricTotals(),
  );

  final List<BusinessMetricDay> days;
  final int rangeDays;
  final BusinessMetricTotals totals;
}

class BusinessBootstrap {
  const BusinessBootstrap({
    required this.session,
    required this.gate,
    required this.publications,
    required this.locations,
    required this.metrics,
  });

  final MemberSession session;
  final BusinessGate gate;
  final List<BusinessPublication> publications;
  final List<BusinessLocation> locations;
  final BusinessMetrics metrics;

  BusinessBootstrap copyWith({
    MemberSession? session,
    BusinessGate? gate,
    List<BusinessPublication>? publications,
    List<BusinessLocation>? locations,
    BusinessMetrics? metrics,
  }) =>
      BusinessBootstrap(
        session: session ?? this.session,
        gate: gate ?? this.gate,
        publications: publications ?? this.publications,
        locations: locations ?? this.locations,
        metrics: metrics ?? this.metrics,
      );
}

class BusinessOrganizationApplicationDraft {
  const BusinessOrganizationApplicationDraft({
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
  final String contactName;
  final String contactEmail;
  final String description;
  final String? tradingName;
  final String? registrationNumber;
  final String? contactPhone;
  final String? websiteUrl;
  final String? category;
  final String? city;
  final String? province;

  Map<String, dynamic> toJson() => {
        'organisationName': organisationName.trim(),
        'contactName': contactName.trim(),
        'contactEmail': contactEmail.trim(),
        'description': description.trim(),
        if (_present(tradingName)) 'tradingName': tradingName!.trim(),
        if (_present(registrationNumber))
          'registrationNumber': registrationNumber!.trim(),
        if (_present(contactPhone)) 'contactPhone': contactPhone!.trim(),
        if (_present(websiteUrl)) 'websiteUrl': websiteUrl!.trim(),
        if (_present(category)) 'category': category!.trim(),
        if (_present(city)) 'city': city!.trim(),
        if (_present(province)) 'province': province!.trim(),
      };
}

class BusinessImageUpload {
  const BusinessImageUpload({
    required this.id,
    required this.key,
    required this.url,
    required this.altText,
  });

  factory BusinessImageUpload.fromJson(Map<String, dynamic> json) =>
      BusinessImageUpload(
        id: _string(json['id']),
        key: _string(json['key']),
        url: _string(json['url']),
        altText: _string(json['altText']),
      );

  final String id;
  final String key;
  final String url;
  final String altText;
}

BusinessPublicationKind _kind(Object? value) => switch (value) {
      'special' => BusinessPublicationKind.special,
      'promotion' => BusinessPublicationKind.promotion,
      'post' => BusinessPublicationKind.post,
      _ => BusinessPublicationKind.deal,
    };

BusinessPublicationPlacement _placement(Object? value) => switch (value) {
      'window' => BusinessPublicationPlacement.window,
      'both' => BusinessPublicationPlacement.both,
      _ => BusinessPublicationPlacement.marketplace,
    };

Map<String, dynamic> _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

List<Map<String, dynamic>> _mapList(Object? value) => value is List
    ? value
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList()
    : const [];

String _string(Object? value, [String fallback = '']) =>
    value is String && value.isNotEmpty ? value : fallback;

String? _optionalString(Object? value) =>
    value is String && value.trim().isNotEmpty ? value.trim() : null;

int _int(Object? value, [int fallback = 0]) =>
    value is num ? value.toInt() : fallback;

int? _optionalInt(Object? value) => value is num ? value.toInt() : null;

double? _optionalDouble(Object? value) =>
    value is num ? value.toDouble() : null;

List<String> _stringList(Object? value) => value is List
    ? value.whereType<String>().toList(growable: false)
    : const [];

bool _present(String? value) => value?.trim().isNotEmpty == true;
