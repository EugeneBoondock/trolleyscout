import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/properties_screen.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets(
      'search filters collapse from the Buy and Rent row without losing values',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(_wrap(PropertiesScreen(
      api: _PropertiesApi(),
      account: _memberAccount,
      isAuthenticated: true,
      onWantsAuth: () {},
      onUpgrade: () {},
    )));
    await tester.pumpAndSettle();

    expect(find.text('Buy'), findsOneWidget);
    expect(find.text('Rent'), findsOneWidget);
    expect(find.byTooltip('Hide search filters'), findsOneWidget);

    final hideButton = find.byTooltip('Hide search filters');
    final hideRect = tester.getRect(hideButton);
    expect(hideRect.width, greaterThanOrEqualTo(48));
    expect(hideRect.height, greaterThanOrEqualTo(48));
    expect(hideRect.right, greaterThanOrEqualTo(417));

    await tester.enterText(
        find.widgetWithText(TextField, 'City, suburb or area, e.g. Pretoria'),
        'Cape Town');
    await tester.enterText(
        find.widgetWithText(TextField, 'Min price (ZAR)'), '1000');
    await tester.enterText(
        find.widgetWithText(TextField, 'Max price (ZAR)'), '5000');
    await tester.tap(find.text('Rent'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Search'));
    await tester.pumpAndSettle();

    expect(find.text('Example rental'), findsOneWidget);
    final expandedHeight = tester.getSize(find.byType(ListView)).height;

    await tester.tap(hideButton);
    await tester.pump();

    expect(find.text('Buy'), findsOneWidget);
    expect(find.text('Rent'), findsOneWidget);
    expect(find.byTooltip('Show search filters'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Cape Town'), findsNothing);
    expect(find.text('Search near me'), findsNothing);
    expect(find.text('Min beds'), findsNothing);
    expect(find.text('Sort'), findsNothing);
    expect(find.text('Min price (ZAR)'), findsNothing);
    expect(find.text('Max price (ZAR)'), findsNothing);
    expect(find.text('Example rental'), findsOneWidget);
    expect(tester.getSize(find.byType(ListView)).height,
        greaterThan(expandedHeight + 200));

    await tester.tap(find.byTooltip('Show search filters'));
    await tester.pump();

    expect(
        tester
            .widget<TextField>(find.widgetWithText(TextField, 'Cape Town'))
            .controller
            ?.text,
        'Cape Town');
    expect(
        tester
            .widget<TextField>(find.widgetWithText(TextField, '1000'))
            .controller
            ?.text,
        '1000');
    expect(
        tester
            .widget<TextField>(find.widgetWithText(TextField, '5000'))
            .controller
            ?.text,
        '5000');
    final segmented = tester.widget<SegmentedButton<String>>(find.ancestor(
      of: find.text('Rent'),
      matching: find.byType(SegmentedButton<String>),
    ));
    expect(segmented.selected, {'rent'});
  });

  for (final brightness in Brightness.values) {
    testWidgets(
        'collapse control uses $brightness theme and skips motion when requested',
        (tester) async {
      await tester.pumpWidget(_wrap(
        PropertiesScreen(
          api: _PropertiesApi(),
          account: _memberAccount,
          isAuthenticated: true,
          onWantsAuth: () {},
          onUpgrade: () {},
        ),
        brightness: brightness,
      ));
      await tester.pumpAndSettle();

      expect(find.byType(AnimatedSize), findsNothing);

      final button = tester.widget<IconButton>(find.byType(IconButton));
      final context = tester.element(find.byTooltip('Hide search filters'));
      expect(button.style?.foregroundColor?.resolve({}), TS.inkOf(context));

      final viewSwitch = tester.widget<SegmentedButton<String>>(find.ancestor(
        of: find.text('Search').first,
        matching: find.byType(SegmentedButton<String>),
      ));
      final selectedBackground =
          viewSwitch.style?.backgroundColor?.resolve({WidgetState.selected});
      final selectedForeground =
          viewSwitch.style?.foregroundColor?.resolve({WidgetState.selected});
      expect(selectedBackground, TS.inkOf(context));
      expect(selectedForeground, TS.bgOf(context));
      expect(_contrast(selectedBackground!, selectedForeground!),
          greaterThanOrEqualTo(4.5));
    });
  }

  testWidgets('compact phone and enlarged text remain overflow-free',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 568));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(_wrap(
      PropertiesScreen(
        api: _PropertiesApi(),
        account: _memberAccount,
        isAuthenticated: true,
        onWantsAuth: () {},
        onUpgrade: () {},
      ),
      textScaler: const TextScaler.linear(1.3),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    await tester.tap(find.byTooltip('Hide search filters'));
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.byTooltip('Show search filters'), findsOneWidget);
  });

  testWidgets('international country changes property hints and starter city',
      (tester) async {
    await tester.pumpWidget(_wrap(PropertiesScreen(
      api: _PropertiesApi(
        pricing: const CountryPricing(
          code: 'ZW',
          name: 'Zimbabwe',
          currencyCode: 'ZWG',
          rateFromZar: 1,
          capital: 'Harare',
          flag: '🇿🇼',
        ),
      ),
      account: _memberAccount,
      isAuthenticated: true,
      onWantsAuth: () {},
      onUpgrade: () {},
    )));
    await tester.pumpAndSettle();

    expect(find.text('Harare'), findsOneWidget);
    expect(find.text('Min price (ZWG)'), findsOneWidget);
    expect(find.text('Max price (ZWG)'), findsOneWidget);
    expect(find.textContaining('in Zimbabwe'), findsOneWidget);
    expect(find.text('Cape Town'), findsNothing);
  });
}

Widget _wrap(
  Widget child, {
  Brightness brightness = Brightness.light,
  TextScaler textScaler = TextScaler.noScaling,
}) {
  return MaterialApp(
    theme: brightness == Brightness.light ? TS.lightTheme() : TS.darkTheme(),
    home: Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          disableAnimations: true,
          textScaler: textScaler,
        ),
        child: Scaffold(body: child),
      ),
    ),
  );
}

double _contrast(Color first, Color second) {
  final lighter = first.computeLuminance() > second.computeLuminance()
      ? first.computeLuminance()
      : second.computeLuminance();
  final darker = first.computeLuminance() > second.computeLuminance()
      ? second.computeLuminance()
      : first.computeLuminance();
  return (lighter + 0.05) / (darker + 0.05);
}

class _PropertiesApi extends Api {
  _PropertiesApi({
    this.pricing = const CountryPricing(
      code: 'ZA',
      name: 'South Africa',
      currencyCode: 'ZAR',
      rateFromZar: 1,
      capital: 'Pretoria',
    ),
  }) : super(baseUrl: 'https://example.test');

  final CountryPricing pricing;

  @override
  Future<CountryPricing> country() async => pricing;

  @override
  Future<PropertySearchResult> searchProperties({
    required String query,
    required String listingType,
    double? lat,
    double? lon,
    int page = 1,
    int? minBeds,
    int? minPrice,
    int? maxPrice,
    String? sort,
  }) async =>
      PropertySearchResult(
        listings: [
          PropertyListing(
            id: 'property-1',
            portal: 'example',
            portalName: 'Example Homes',
            title: 'Example rental',
            listingUrl: 'https://example.test/property-1',
            listingType: listingType,
            priceText: 'R5,000',
            location: query,
            bedrooms: 2,
          ),
        ],
        sources: const [],
        listingType: listingType,
        page: page,
        locationText: query,
        country: CountryOption(
          code: pricing.code,
          currencyCode: pricing.currencyCode,
          flag: pricing.flag ?? '',
          name: pricing.name,
          capital: pricing.capital,
        ),
      );
}

const _memberAccount = MemberAccount(
  id: 'member-1',
  email: 'shopper@example.test',
  displayName: 'Test Shopper',
  initials: 'TS',
  planId: 'household',
  planName: 'Household',
  planStatus: 'active',
  role: 'member',
  propertiesAccess: true,
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:00:00.000Z',
);
