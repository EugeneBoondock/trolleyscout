import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/admin_screen.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('admin overview keeps the available and selected test countries', () {
    final dynamic overview = AdminOverview.fromJson(_adminOverviewJson());

    expect(overview.countries, hasLength(2));
    expect(overview.selectedCountry.code, 'ZW');
  });

  test('API sends a persisted admin test country on every later request',
      () async {
    SharedPreferences.setMockInitialValues({
      'ts_admin_country_override_v1': 'ZW',
    });
    late http.Request captured;
    final api = Api(
      client: MockClient((request) async {
        captured = request;
        return http.Response(
          jsonEncode({
            'data': {
              'country': {
                'code': 'ZW',
                'currencyCode': 'ZWG',
                'name': 'Zimbabwe',
                'rateFromZar': 1.6,
              },
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
      useBrowserCookies: true,
    );

    await api.country();

    expect(captured.headers['x-trolley-scout-test-country'], 'ZW');
  });

  testWidgets('admin console exposes an app test location control',
      (tester) async {
    final api = Api(
      client: MockClient((request) async => http.Response(
            jsonEncode({'data': _adminOverviewJson()}),
            200,
            headers: {'content-type': 'application/json'},
          )),
      useBrowserCookies: true,
    );

    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      home: Scaffold(body: AdminScreen(api: api)),
    ));
    await tester.pumpAndSettle();

    expect(find.text('App test location'), findsOneWidget);
    expect(find.textContaining('Zimbabwe'), findsWidgets);
  });
}

Map<String, dynamic> _adminOverviewJson() => {
      'accounts': <dynamic>[],
      'countries': [
        {
          'code': 'ZA',
          'currencyCode': 'ZAR',
          'flag': '🇿🇦',
          'name': 'South Africa',
        },
        {
          'code': 'ZW',
          'currencyCode': 'ZWG',
          'flag': '🇿🇼',
          'name': 'Zimbabwe',
        },
      ],
      'emailProtection': {
        'configured': true,
        'pendingAccounts': 0,
        'pendingSupport': 0,
      },
      'scout': {
        'dealCount': 0,
        'leafletCount': 0,
        'sourceCount': 0,
        'storeCount': 37,
      },
      'selectedCountry': {
        'code': 'ZW',
        'currencyCode': 'ZWG',
        'flag': '🇿🇼',
        'name': 'Zimbabwe',
      },
      'summary': {
        'accountCount': 0,
        'planCounts': <String, int>{},
        'supportOpenCount': 0,
      },
      'support': <dynamic>[],
    };
