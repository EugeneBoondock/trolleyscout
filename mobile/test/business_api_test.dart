import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/business/business_api.dart';
import 'package:trolley_scout/session_cookie_store.dart';

void main() {
  test('loads the authenticated business workspace and sends its cookie',
      () async {
    final paths = <String>[];
    final client = MockClient((request) async {
      paths.add(request.url.path);
      expect(request.headers['cookie'], 'ts_member_session=session-1');
      final data = switch (request.url.path) {
        '/api/member-session' => {
            'session': {
              'isAuthenticated': true,
              'account': _accountJson,
            },
          },
        '/api/organization' => {
            'applicationStatus': 'approved',
            'hasOrganization': true,
            'organization': {
              'id': 'org-1',
              'name': 'Kasi Pantry',
              'slug': 'kasi-pantry',
              'status': 'active',
            },
          },
        '/api/organization-publications' => {
            'publications': [_publicationJson],
          },
        '/api/organization-locations' => {
            'locations': [_locationJson],
          },
        '/api/organization-metrics' => {
            'metrics': {
              'rangeDays': 30,
              'totals': {
                'impressions': 1200,
                'opens': 300,
                'saves': 80,
                'outboundVisits': 40,
              },
              'days': [],
            },
          },
        _ => <String, dynamic>{},
      };
      return http.Response(
        jsonEncode({'data': data}),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = BusinessApi(
      client: client,
      cookieStore: MemorySessionCookieStore('ts_member_session=session-1'),
      useBrowserCookies: false,
      baseUrl: 'https://example.com',
    );

    final bootstrap = await api.bootstrap();

    expect(bootstrap.session.isAuthenticated, isTrue);
    expect(bootstrap.gate.organization?.name, 'Kasi Pantry');
    expect(bootstrap.publications.single.title, 'Family braai box');
    expect(bootstrap.locations.single.city, 'Johannesburg');
    expect(bootstrap.metrics.totals.saves, 80);
    expect(
        paths,
        containsAll([
          '/api/member-session',
          '/api/organization',
          '/api/organization-publications',
          '/api/organization-locations',
          '/api/organization-metrics',
        ]));
  });

  test('captures a native session cookie after sign in', () async {
    final store = MemorySessionCookieStore();
    final api = BusinessApi(
      client: MockClient((request) async => http.Response(
            jsonEncode({
              'data': {
                'session': {
                  'isAuthenticated': true,
                  'account': _accountJson,
                },
              },
            }),
            200,
            headers: {
              'content-type': 'application/json',
              'set-cookie':
                  'ts_member_session=business-session; Path=/; HttpOnly',
            },
          )),
      cookieStore: store,
      useBrowserCookies: false,
      baseUrl: 'https://example.com',
    );

    final session = await api.authenticate(
      const AuthDraft.login(
        email: 'owner@example.com',
        password: 'password123',
      ),
    );

    expect(session.isAuthenticated, isTrue);
    expect(await store.read(), 'ts_member_session=business-session');
  });

  test('sends publication actions with the server operation', () async {
    late Map<String, dynamic> sent;
    final api = BusinessApi(
      client: MockClient((request) async {
        sent = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(
          jsonEncode({
            'data': {
              'publication': _publicationJson,
              'publications': [_publicationJson],
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
      cookieStore: MemorySessionCookieStore('ts_member_session=session-1'),
      useBrowserCookies: false,
      baseUrl: 'https://example.com',
    );

    final result = await api.changePublication('org-pub-1', 'pause');

    expect(sent, {
      'operation': 'pause',
      'publicationId': 'org-pub-1',
    });
    expect(result.publication?.id, 'org-pub-1');
  });
}

const _accountJson = {
  'id': 'member-1',
  'email': 'owner@example.com',
  'displayName': 'Naledi Mokoena',
  'initials': 'NM',
  'planId': 'free',
  'planName': 'Free',
  'planStatus': 'active',
  'role': 'member',
  'propertiesAccess': false,
  'countryCode': 'ZA',
  'countryName': 'South Africa',
  'currencyCode': 'ZAR',
  'createdAt': '2026-07-26T08:00:00.000Z',
  'updatedAt': '2026-07-26T08:00:00.000Z',
};

const _publicationJson = {
  'id': 'org-pub-1',
  'organizationId': 'org-1',
  'organizationName': 'Kasi Pantry',
  'organizationSlug': 'kasi-pantry',
  'createdBy': 'member-1',
  'status': 'live',
  'kind': 'deal',
  'placement': 'both',
  'title': 'Family braai box',
  'bodyText': 'A weekend box for four people.',
  'currencyCode': 'ZAR',
  'locationIds': ['loc-1'],
  'soldOut': false,
  'createdAt': '2026-07-26T08:00:00.000Z',
  'updatedAt': '2026-07-26T09:00:00.000Z',
};

const _locationJson = {
  'id': 'loc-1',
  'organizationId': 'org-1',
  'name': 'Rosebank store',
  'addressLine': '15 Cradock Avenue',
  'city': 'Johannesburg',
  'province': 'Gauteng',
  'countryCode': 'ZA',
  'status': 'active',
  'createdAt': '2026-07-26T08:00:00.000Z',
  'updatedAt': '2026-07-26T09:00:00.000Z',
};
