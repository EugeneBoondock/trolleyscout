import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/business/business_api.dart';
import 'package:trolley_scout/business/business_app.dart';
import 'package:trolley_scout/business/business_controller.dart';
import 'package:trolley_scout/business/business_models.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final preferences = await SharedPreferences.getInstance();
  await preferences.setString('ts_business_theme_v1', 'light');
  runApp(
    TrolleyScoutBusinessApp(
      controller: BusinessController(api: _PreviewBusinessApi()),
    ),
  );
}

class _PreviewBusinessApi implements BusinessApiClient {
  BusinessAdminOverview _overview = BusinessAdminOverview.fromJson(
    _overviewJson,
  );
  List<BusinessPublication> _publications = _businessPublicationsJson
      .map(BusinessPublication.fromJson)
      .toList(growable: false);
  final List<BusinessLocation> _locations = _businessLocationsJson
      .map(BusinessLocation.fromJson)
      .toList(growable: false);

  @override
  Future<BusinessBootstrap> bootstrap() async => BusinessBootstrap(
        session: const MemberSession(
          isAuthenticated: true,
          account: MemberAccount(
            id: 'owner-jet',
            email: 'marketing@jet.example',
            displayName: 'Naledi Mokoena',
            initials: 'NM',
            planId: 'business-growth',
            planName: 'Organisation Growth',
            planStatus: 'active',
            role: 'member',
            propertiesAccess: true,
            createdAt: '2026-02-14T08:00:00.000Z',
            updatedAt: '2026-07-26T14:00:00.000Z',
          ),
        ),
        gate: const BusinessGate(
          applicationStatus: 'approved',
          hasOrganization: true,
          organization: BusinessOrganization(
            id: 'org-jet',
            name: 'Jet',
            slug: 'jet',
            status: 'active',
          ),
        ),
        publications: _publications,
        locations: _locations,
        metrics: _businessMetrics,
      );

  @override
  Future<BusinessAdminOverview> adminOverview() async => _overview;

  @override
  Future<BusinessAdminOverview> setBusinessStatus(
    String businessId,
    String status,
  ) async {
    final json = Map<String, dynamic>.from(_overviewJson);
    json['businesses'] = (json['businesses'] as List)
        .map(
          (item) => item is Map && item['id'] == businessId
              ? {...item.cast<String, dynamic>(), 'status': status}
              : item,
        )
        .toList();
    _overview = BusinessAdminOverview.fromJson(json);
    return _overview;
  }

  @override
  Future<List<BusinessAdminApplication>> adminApplications() async =>
      _applicationsJson
          .map(BusinessAdminApplication.fromJson)
          .toList(growable: false);

  @override
  Future<List<BusinessPublication>> adminPublicationQueue() async =>
      _moderationJson.map(BusinessPublication.fromJson).toList(growable: false);

  @override
  Future<List<BusinessAdminApplication>> reviewAdminApplication(
    String applicationId,
    String decision, {
    String? note,
  }) async =>
      (await adminApplications())
          .where((application) => application.id != applicationId)
          .toList();

  @override
  Future<List<BusinessPublication>> reviewAdminPublication(
    String publicationId,
    String decision, {
    String? note,
  }) async =>
      (await adminPublicationQueue())
          .where((publication) => publication.id != publicationId)
          .toList();

  @override
  Future<MemberSession> signOut() async => const MemberSession.signedOut();

  @override
  Future<MemberSession> authenticate(AuthDraft draft) async =>
      (await bootstrap()).session;

  @override
  Future<BusinessPublicationChange> changePublication(
    String publicationId,
    String operation,
  ) async {
    return BusinessPublicationChange(publications: _publications);
  }

  @override
  Future<BusinessMetrics> metrics(int days) async => BusinessMetrics(
        days: _businessMetrics.days,
        rangeDays: days,
        totals: _businessMetrics.totals,
      );

  @override
  Future<BusinessPublicationChange> savePublication(
    BusinessPublicationDraft draft, {
    String? publicationId,
  }) async {
    final saved = BusinessPublication(
      id: publicationId ?? 'campaign-preview-new',
      organizationId: 'org-jet',
      organizationName: 'Jet',
      organizationSlug: 'jet',
      createdBy: 'owner-jet',
      status: BusinessPublicationStatus.draft,
      createdAt: '2026-07-28T08:00:00.000Z',
      updatedAt: '2026-07-28T08:00:00.000Z',
      kind: draft.kind,
      placement: draft.placement,
      title: draft.title,
      bodyText: draft.bodyText,
      targetUrl: draft.targetUrl,
      imageUrl: draft.imageUrl,
      imageAlt: draft.imageAlt,
      priceCents: draft.priceCents,
      previousPriceCents: draft.previousPriceCents,
      currencyCode: draft.currencyCode,
      offerText: draft.offerText,
      couponCode: draft.couponCode,
      startsAt: draft.startsAt,
      endsAt: draft.endsAt,
      locationIds: draft.locationIds,
      soldOut: draft.soldOut,
    );
    _publications = [
      saved,
      ..._publications.where((publication) => publication.id != saved.id),
    ];
    return BusinessPublicationChange(
      publication: saved,
      publications: _publications,
    );
  }

  @override
  Future<List<BusinessLocation>> saveLocation(
    BusinessLocationDraft draft, {
    String? locationId,
  }) async =>
      _locations;

  @override
  Future<BusinessImageUpload> uploadImage(
    String path, {
    required String altText,
  }) =>
      throw UnsupportedError('Image upload is disabled in preview mode.');
}

const _businessPublicationsJson = <Map<String, dynamic>>[
  {
    'id': 'campaign-jet-1',
    'organizationId': 'org-jet',
    'organizationName': 'Jet',
    'organizationSlug': 'jet',
    'createdBy': 'owner-jet',
    'kind': 'promotion',
    'status': 'live',
    'placement': 'both',
    'title': 'Winter layers up to 40% off',
    'bodyText':
        'Save on selected jackets, knitwear, and winter essentials in stores and online.',
    'targetUrl': 'https://www.jetonline.co.za/',
    'imageUrl':
        'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200',
    'imageAlt': 'Winter fashion collection',
    'currencyCode': 'ZAR',
    'locationIds': <String>[],
    'soldOut': false,
    'startsAt': '2026-07-24T08:00:00.000Z',
    'endsAt': '2026-08-10T20:00:00.000Z',
    'createdAt': '2026-07-23T08:00:00.000Z',
    'updatedAt': '2026-07-28T12:40:00.000Z',
  },
  {
    'id': 'campaign-jet-2',
    'organizationId': 'org-jet',
    'organizationName': 'Jet',
    'organizationSlug': 'jet',
    'createdBy': 'owner-jet',
    'kind': 'deal',
    'status': 'scheduled',
    'placement': 'marketplace',
    'title': 'Kids denim from R129',
    'bodyText':
        'New-season denim for kids, available at participating Jet stores.',
    'targetUrl': 'https://www.jetonline.co.za/',
    'imageUrl':
        'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=1200',
    'imageAlt': 'Children wearing denim outfits',
    'priceCents': 12900,
    'previousPriceCents': 17900,
    'currencyCode': 'ZAR',
    'locationIds': <String>['location-sandton', 'location-soweto'],
    'soldOut': false,
    'startsAt': '2026-08-01T08:00:00.000Z',
    'endsAt': '2026-08-14T20:00:00.000Z',
    'createdAt': '2026-07-27T09:20:00.000Z',
    'updatedAt': '2026-07-28T09:20:00.000Z',
  },
  {
    'id': 'campaign-jet-3',
    'organizationId': 'org-jet',
    'organizationName': 'Jet',
    'organizationSlug': 'jet',
    'createdBy': 'owner-jet',
    'kind': 'post',
    'status': 'draft',
    'placement': 'window',
    'title': 'New store opening in Polokwane',
    'bodyText':
        'Meet the team and explore our newest Jet store opening this Saturday.',
    'imageUrl':
        'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200',
    'imageAlt': 'Bright fashion store interior',
    'currencyCode': 'ZAR',
    'locationIds': <String>[],
    'soldOut': false,
    'createdAt': '2026-07-28T07:40:00.000Z',
    'updatedAt': '2026-07-28T07:40:00.000Z',
  },
];

const _businessLocationsJson = <Map<String, dynamic>>[
  {
    'id': 'location-sandton',
    'organizationId': 'org-jet',
    'name': 'Jet Sandton City',
    'addressLine': '83 Rivonia Road',
    'city': 'Sandton',
    'province': 'Gauteng',
    'countryCode': 'ZA',
    'websiteUrl': 'https://www.jetonline.co.za/',
    'status': 'active',
    'createdAt': '2026-02-14T08:00:00.000Z',
    'updatedAt': '2026-07-28T08:00:00.000Z',
  },
  {
    'id': 'location-soweto',
    'organizationId': 'org-jet',
    'name': 'Jet Maponya Mall',
    'addressLine': '2127 Chris Hani Road',
    'city': 'Soweto',
    'province': 'Gauteng',
    'countryCode': 'ZA',
    'websiteUrl': 'https://www.jetonline.co.za/',
    'status': 'active',
    'createdAt': '2026-02-14T08:00:00.000Z',
    'updatedAt': '2026-07-28T08:00:00.000Z',
  },
];

const _businessMetrics = BusinessMetrics(
  rangeDays: 30,
  totals: BusinessMetricTotals(
    impressions: 484200,
    opens: 132800,
    saves: 28600,
    outboundVisits: 19400,
  ),
  days: [
    BusinessMetricDay(
      date: '2026-07-24',
      impressions: 68200,
      opens: 18100,
      saves: 3900,
      outboundVisits: 2400,
    ),
    BusinessMetricDay(
      date: '2026-07-25',
      impressions: 79400,
      opens: 21600,
      saves: 4700,
      outboundVisits: 3200,
    ),
    BusinessMetricDay(
      date: '2026-07-26',
      impressions: 92300,
      opens: 25800,
      saves: 5600,
      outboundVisits: 3900,
    ),
    BusinessMetricDay(
      date: '2026-07-27',
      impressions: 108100,
      opens: 30100,
      saves: 6500,
      outboundVisits: 4500,
    ),
    BusinessMetricDay(
      date: '2026-07-28',
      impressions: 136200,
      opens: 37200,
      saves: 7900,
      outboundVisits: 5400,
    ),
  ],
);

const _overviewJson = <String, dynamic>{
  'generatedAt': '2026-07-26T14:00:00.000Z',
  'totals': {
    'activeBusinesses': 128,
    'businesses': 134,
    'suspendedBusinesses': 6,
    'pendingApplications': 9,
    'pendingModeration': 17,
    'campaigns': 486,
    'liveCampaigns': 74,
    'completedCampaigns': 351,
    'paidCents': 24867000,
    'paidTransactions': 219,
  },
  'businesses': [
    {
      'id': 'org-jet',
      'name': 'Jet',
      'slug': 'jet',
      'status': 'active',
      'ownerName': 'Jet Stores',
      'planId': 'business-growth',
      'planStatus': 'active',
      'category': 'Fashion',
      'locations': 156,
      'campaigns': 28,
      'activeCampaigns': 6,
      'completedCampaigns': 21,
      'impressions': 484200,
      'opens': 132800,
      'saves': 28600,
      'visits': 19400,
      'paidCents': 449700,
      'paidTransactions': 3,
      'createdAt': '2026-02-14T08:00:00.000Z',
      'updatedAt': '2026-07-26T12:40:00.000Z',
      'lastCampaignAt': '2026-07-26T12:40:00.000Z',
    },
    {
      'id': 'org-food-lovers',
      'name': 'Food Lover’s Market',
      'slug': 'food-lovers-market',
      'status': 'active',
      'ownerName': 'Food Lover’s Holdings',
      'planId': 'business-pro',
      'planStatus': 'active',
      'category': 'Groceries',
      'locations': 94,
      'campaigns': 43,
      'activeCampaigns': 8,
      'completedCampaigns': 34,
      'impressions': 738900,
      'opens': 210400,
      'saves': 44800,
      'visits': 31700,
      'paidCents': 749700,
      'paidTransactions': 3,
      'createdAt': '2026-01-22T08:00:00.000Z',
      'updatedAt': '2026-07-26T11:05:00.000Z',
      'lastCampaignAt': '2026-07-26T11:05:00.000Z',
    },
    {
      'id': 'org-bathu',
      'name': 'Bathu',
      'slug': 'bathu',
      'status': 'active',
      'ownerName': 'Bathu Group',
      'planId': 'business-growth',
      'planStatus': 'active',
      'category': 'Footwear',
      'locations': 38,
      'campaigns': 19,
      'activeCampaigns': 3,
      'completedCampaigns': 15,
      'impressions': 326500,
      'opens': 98100,
      'saves': 22100,
      'visits': 14600,
      'paidCents': 449700,
      'paidTransactions': 3,
      'createdAt': '2026-03-04T08:00:00.000Z',
      'updatedAt': '2026-07-25T15:20:00.000Z',
      'lastCampaignAt': '2026-07-25T15:20:00.000Z',
    },
    {
      'id': 'org-mzansi-mobile',
      'name': 'Mzansi Mobile',
      'slug': 'mzansi-mobile',
      'status': 'suspended',
      'ownerName': 'Mzansi Mobile Trading',
      'planId': 'business-starter',
      'planStatus': 'past_due',
      'category': 'Mobile',
      'locations': 8,
      'campaigns': 7,
      'activeCampaigns': 0,
      'completedCampaigns': 5,
      'impressions': 41800,
      'opens': 7200,
      'saves': 960,
      'visits': 340,
      'paidCents': 99900,
      'paidTransactions': 1,
      'createdAt': '2026-05-18T08:00:00.000Z',
      'updatedAt': '2026-07-24T10:00:00.000Z',
      'lastCampaignAt': '2026-07-20T10:00:00.000Z',
    },
  ],
  'campaigns': [
    {
      'id': 'campaign-jet-1',
      'organizationId': 'org-jet',
      'organizationName': 'Jet',
      'kind': 'promotion',
      'status': 'live',
      'placement': 'both',
      'title': 'Winter layers up to 40% off',
      'targetUrl': 'https://www.jetonline.co.za/',
      'imageUrl':
          'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200',
      'imageAlt': 'Winter fashion collection',
      'soldOut': false,
      'impressions': 128400,
      'opens': 38700,
      'saves': 8200,
      'visits': 5100,
      'createdAt': '2026-07-23T08:00:00.000Z',
      'updatedAt': '2026-07-26T12:40:00.000Z',
    },
    {
      'id': 'campaign-food-1',
      'organizationId': 'org-food-lovers',
      'organizationName': 'Food Lover’s Market',
      'kind': 'special',
      'status': 'scheduled',
      'placement': 'marketplace',
      'title': 'Fresh produce weekend',
      'imageUrl':
          'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200',
      'imageAlt': 'Fresh produce display',
      'soldOut': false,
      'impressions': 84200,
      'opens': 23100,
      'saves': 6200,
      'visits': 3100,
      'createdAt': '2026-07-24T08:00:00.000Z',
      'updatedAt': '2026-07-26T11:05:00.000Z',
    },
    {
      'id': 'campaign-bathu-1',
      'organizationId': 'org-bathu',
      'organizationName': 'Bathu',
      'kind': 'deal',
      'status': 'live',
      'placement': 'window',
      'title': 'Mesh Edition sneaker',
      'targetUrl': 'https://www.bathu.co.za/',
      'imageUrl':
          'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=1200',
      'imageAlt': 'Sneaker on display',
      'soldOut': true,
      'impressions': 93200,
      'opens': 34600,
      'saves': 9100,
      'visits': 4700,
      'createdAt': '2026-07-22T08:00:00.000Z',
      'updatedAt': '2026-07-25T15:20:00.000Z',
    },
  ],
  'payments': [
    {
      'id': 'payment-1',
      'paymentId': 'PF-492810',
      'businessId': 'org-food-lovers',
      'businessName': 'Food Lover’s Market',
      'planId': 'business-pro',
      'status': 'COMPLETE',
      'amountCents': 249900,
      'createdAt': '2026-07-26T09:15:00.000Z',
    },
    {
      'id': 'payment-2',
      'paymentId': 'PF-492768',
      'businessId': 'org-jet',
      'businessName': 'Jet',
      'planId': 'business-growth',
      'status': 'COMPLETE',
      'amountCents': 149900,
      'createdAt': '2026-07-25T14:32:00.000Z',
    },
    {
      'id': 'payment-3',
      'paymentId': 'PF-492611',
      'businessId': 'org-bathu',
      'businessName': 'Bathu',
      'planId': 'business-growth',
      'status': 'COMPLETE',
      'amountCents': 149900,
      'createdAt': '2026-07-24T10:10:00.000Z',
    },
  ],
};

const _applicationsJson = <Map<String, dynamic>>[
  {
    'id': 'application-1',
    'organisationName': 'Urban Harvest',
    'tradingName': 'Urban Harvest Market',
    'contactName': 'Anele Dlamini',
    'contactEmail': 'anele@urbanharvest.example',
    'contactPhone': '+27 11 555 0198',
    'websiteUrl': 'https://urbanharvest.example',
    'category': 'Groceries',
    'description': 'Neighbourhood fresh food stores with local delivery.',
    'city': 'Johannesburg',
    'province': 'Gauteng',
    'status': 'pending',
    'businessSubscriptionActive': true,
    'createdAt': '2026-07-26T08:30:00.000Z',
  },
  {
    'id': 'application-2',
    'organisationName': 'North Star Cellular',
    'contactName': 'Lerato Mokoena',
    'contactEmail': 'lerato@northstar.example',
    'category': 'Mobile',
    'description': 'Mobile devices, prepaid bundles, and accessories.',
    'city': 'Pretoria',
    'province': 'Gauteng',
    'status': 'pending',
    'businessSubscriptionActive': true,
    'createdAt': '2026-07-25T13:10:00.000Z',
  },
];

const _moderationJson = <Map<String, dynamic>>[
  {
    'id': 'review-1',
    'organizationId': 'org-jet',
    'organizationName': 'Jet',
    'organizationSlug': 'jet',
    'createdBy': 'owner-jet',
    'status': 'submitted',
    'kind': 'promotion',
    'placement': 'both',
    'title': 'Payday fashion edit',
    'bodyText': 'Selected fashion for the final weekend of the month.',
    'imageUrl':
        'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200',
    'imageAlt': 'Payday fashion collection',
    'currencyCode': 'ZAR',
    'locationIds': <String>[],
    'soldOut': false,
    'createdAt': '2026-07-26T10:00:00.000Z',
    'updatedAt': '2026-07-26T10:00:00.000Z',
  },
  {
    'id': 'review-2',
    'organizationId': 'org-food-lovers',
    'organizationName': 'Food Lover’s Market',
    'organizationSlug': 'food-lovers-market',
    'createdBy': 'owner-food',
    'status': 'submitted',
    'kind': 'special',
    'placement': 'marketplace',
    'title': 'Butchery combo',
    'bodyText': 'A family meat combo available at participating stores.',
    'imageUrl':
        'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=1200',
    'imageAlt': 'Butchery selection',
    'currencyCode': 'ZAR',
    'locationIds': <String>[],
    'soldOut': false,
    'createdAt': '2026-07-25T15:00:00.000Z',
    'updatedAt': '2026-07-25T15:00:00.000Z',
  },
];
