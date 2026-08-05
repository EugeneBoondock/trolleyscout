import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/retail_seasons.dart';

Deal deal(String title, {String evidenceText = ''}) => Deal(
      id: title,
      retailerId: 'shop',
      retailerName: 'Example Shop',
      sourceLabel: 'Official specials',
      sourceUrl: 'https://shop.example/specials',
      capturedAt: '2026-08-02T00:00:00Z',
      evidenceText: evidenceText,
      title: title,
    );

void main() {
  test('hides dated events beyond 60 days and keeps year-round discovery lanes', () {
    final seasons = buildRetailSeasons(
      'ZA',
      now: DateTime.utc(2026, 8, 2, 12),
    );

    expect(seasons.map((season) => season.id), isNot(contains('black-friday-2026')));
    expect(seasons.map((season) => season.id), contains('travel-deals'));
    expect(seasons.map((season) => season.id), contains('student-offers'));
  });

  test('shows a dated event once it reaches the 60-day horizon', () {
    final seasons = buildRetailSeasons(
      'ZA',
      now: DateTime.utc(2026, 9, 28, 12),
    );

    expect(
      seasons.firstWhere((season) => season.id == 'black-friday-2026').timingLabel,
      'Starts in 60 days',
    );
  });

  test('uses southern and northern back-to-school windows', () {
    final south = buildRetailSeasons('ZA', now: DateTime.utc(2026, 12, 1));
    final north = buildRetailSeasons('GB', now: DateTime.utc(2026, 8, 2));

    expect(
      south.firstWhere((season) => season.id.startsWith('back-to-school')).status,
      'active',
    );
    expect(
      north.firstWhere((season) => season.id.startsWith('back-to-school')).status,
      'active',
    );
  });

  test('keeps Easter active on Easter Sunday', () {
    final seasons = buildRetailSeasons('ZA', now: DateTime.utc(2027, 3, 28));
    final easter = seasons.firstWhere((season) => season.id == 'easter-2027');

    expect(easter.status, 'active');
    expect(easter.startsOn, '2027-02-11');
  });

  test('adds a nearby local holiday and removes Christmas duplicates', () {
    final seasons = buildRetailSeasons(
      'ZA',
      now: DateTime.utc(2026, 8, 2),
      holidays: const [
        RetailHoliday(
          date: '2026-08-09',
          localName: 'National Women’s Day',
          name: 'National Women’s Day',
        ),
        RetailHoliday(date: '2026-12-25', name: 'Christmas Day'),
      ],
    );

    expect(seasons.any((season) => season.title == 'National Women’s Day'), isTrue);
    expect(seasons.where((season) => season.title.toLowerCase().contains('christmas')), isEmpty);
  });

  test('matches explicit seasonal language in live deal evidence', () {
    final season = buildRetailSeasons('ZA', now: DateTime.utc(2026, 9, 28))
        .firstWhere((season) => season.id == 'black-friday-2026');
    final deals = [
      deal('Black Friday television deal'),
      deal('Television deal', evidenceText: 'Official Cyber Monday sale'),
      deal('Friday television deal'),
    ];

    expect(matchesRetailSeason(deals.first, season), isTrue);
    expect(matchesRetailSeason(deals.last, season), isFalse);
    expect(retailSeasonMatchCount(deals, season), 2);
  });

  test('matches travel offers without broad booking noise', () {
    final season = buildRetailSeasons('ZA', now: DateTime.utc(2026, 8, 2))
        .firstWhere((season) => season.id == 'travel-deals');
    final deals = [
      deal('FlySafair flight special from Johannesburg to Cape Town'),
      deal('Cape Winelands 1-night stay for two'),
      deal('Family holiday package in Durban'),
      deal('Restaurant table booking special'),
    ];

    expect(
      deals.map((item) => matchesRetailSeason(item, season)),
      [true, true, true, false],
    );
  });
}
