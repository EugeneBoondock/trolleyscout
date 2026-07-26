import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/business/business_models.dart';

void main() {
  test('parses business publications and keeps shopper placement data', () {
    final publication = BusinessPublication.fromJson({
      'id': 'org-pub-1',
      'organizationId': 'org-1',
      'organizationName': 'Kasi Pantry',
      'organizationSlug': 'kasi-pantry',
      'createdBy': 'member-1',
      'status': 'changes_requested',
      'kind': 'special',
      'placement': 'both',
      'title': 'Family braai box',
      'bodyText': 'A weekend box for four people.',
      'priceCents': 39900,
      'previousPriceCents': 49900,
      'currencyCode': 'ZAR',
      'locationIds': ['loc-1'],
      'soldOut': false,
      'reviewNote': 'Add the end date.',
      'createdAt': '2026-07-26T08:00:00.000Z',
      'updatedAt': '2026-07-26T09:00:00.000Z',
    });

    expect(publication.kind, BusinessPublicationKind.special);
    expect(publication.placement, BusinessPublicationPlacement.both);
    expect(publication.status, BusinessPublicationStatus.changesRequested);
    expect(publication.status.needsAttention, isTrue);
    expect(publication.locationIds, ['loc-1']);
    expect(publication.draft.priceCents, 39900);
  });

  test('serializes a clean publication draft for the API', () {
    const draft = BusinessPublicationDraft(
      kind: BusinessPublicationKind.deal,
      placement: BusinessPublicationPlacement.marketplace,
      title: '  Weekend potatoes  ',
      bodyText: '  Five kilograms while stock lasts.  ',
      imageUrl: ' https://example.com/potatoes.jpg ',
      imageAlt: ' Bag of potatoes ',
      priceCents: 7999,
      locationIds: ['loc-1'],
    );

    expect(draft.toJson(), containsPair('title', 'Weekend potatoes'));
    expect(
      draft.toJson(),
      containsPair('bodyText', 'Five kilograms while stock lasts.'),
    );
    expect(
      draft.toJson(),
      containsPair('imageUrl', 'https://example.com/potatoes.jpg'),
    );
    expect(draft.toJson(), containsPair('priceCents', 7999));
  });

  test('parses daily and total business metrics', () {
    final metrics = BusinessMetrics.fromJson({
      'rangeDays': 7,
      'totals': {
        'impressions': 1200,
        'opens': 300,
        'saves': 80,
        'outboundVisits': 40,
      },
      'days': [
        {
          'date': '2026-07-26',
          'impressions': 200,
          'opens': 50,
          'saves': 12,
          'outboundVisits': 7,
        },
      ],
    });

    expect(metrics.rangeDays, 7);
    expect(metrics.totals.impressions, 1200);
    expect(metrics.days.single.saves, 12);
  });
}
