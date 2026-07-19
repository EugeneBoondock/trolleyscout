import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/session_cookie_store.dart';

void main() {
  group('authenticated API', () {
    test('captures the member cookie and sends it on the next native request',
        () async {
      final requests = <http.Request>[];
      final cookieStore = MemorySessionCookieStore();
      final client = MockClient((request) async {
        requests.add(request);
        if (request.method == 'POST') {
          return http.Response(
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
              'set-cookie':
                  'ts_member_session=secret-token; Path=/; HttpOnly; SameSite=Lax'
            },
          );
        }

        return http.Response(
          jsonEncode({
            'data': {
              'session': {'isAuthenticated': true, 'account': _accountJson},
            },
          }),
          200,
        );
      });
      final api = Api(
        client: client,
        cookieStore: cookieStore,
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      final session = await api.authenticate(
        const AuthDraft.login(email: 'sam@example.com', password: 'password1'),
      );
      await api.session();

      expect(session.account?.displayName, 'Sam Shopper');
      expect(await cookieStore.read(), 'ts_member_session=secret-token');
      expect(requests.last.headers['cookie'], 'ts_member_session=secret-token');
    });

    test('sign out clears the native session cookie', () async {
      final cookieStore =
          MemorySessionCookieStore('ts_member_session=secret-token');
      final api = Api(
        client: MockClient((request) async => http.Response(
              jsonEncode({
                'data': {
                  'session': {'isAuthenticated': false},
                },
              }),
              200,
              headers: {'set-cookie': 'ts_member_session=; Path=/; Max-Age=0'},
            )),
        cookieStore: cookieStore,
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      final session = await api.signOut();

      expect(session.isAuthenticated, isFalse);
      expect(await cookieStore.read(), isNull);
    });

    test('surfaces the first API issue', () async {
      final api = Api(
        client: MockClient((request) async => http.Response(
              jsonEncode({
                'data': {
                  'issues': [
                    'That email and password do not match an account.'
                  ],
                  'session': {'isAuthenticated': false},
                },
              }),
              422,
            )),
        cookieStore: MemorySessionCookieStore(),
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      expect(
        () => api.authenticate(
          const AuthDraft.login(
              email: 'sam@example.com', password: 'wrong-pass'),
        ),
        throwsA(
          isA<ApiException>().having(
            (error) => error.message,
            'message',
            'That email and password do not match an account.',
          ),
        ),
      );
    });

    test('uses the server refresh flag for a forced discovery run', () async {
      late Uri requestUri;
      final api = Api(
        client: MockClient((request) async {
          requestUri = request.url;
          return http.Response(
            jsonEncode({
              'data': {
                'deals': [],
                'sources': [],
                'summary': {
                  'checkedSourceCount': 0,
                  'foundDealCount': 0,
                  'unavailableSourceCount': 0,
                },
              },
            }),
            200,
          );
        }),
        cookieStore: MemorySessionCookieStore(),
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      await api.discovery(forceLive: true);

      expect(requestUri.queryParameters['refresh'], '1');
    });

    test('uses the server refresh flag for a forced deal-site run', () async {
      late Uri requestUri;
      final api = Api(
        client: MockClient((request) async {
          requestUri = request.url;
          return http.Response(
            jsonEncode({
              'data': {'deals': []},
            }),
            200,
          );
        }),
        cookieStore: MemorySessionCookieStore(),
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      await api.dealSites(forceLive: true);

      expect(requestUri.queryParameters['refresh'], '1');
    });

    test('requests the redirect checkout that works in native WebViews',
        () async {
      late Map<String, dynamic> requestBody;
      final api = Api(
        client: MockClient((request) async {
          requestBody =
              Map<String, dynamic>.from(jsonDecode(request.body) as Map);
          return http.Response(
            jsonEncode({
              'data': {
                'checkout': {
                  'message': 'Redirecting to PayFast.',
                  'planId': 'scout',
                  'billingCycle': 'monthly',
                  'status': 'checkout_required',
                  'redirectUrl': 'https://www.payfast.co.za/eng/process',
                  'redirectFields': {'signature': 'signed'},
                },
              },
            }),
            200,
          );
        }),
        cookieStore: MemorySessionCookieStore(),
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      final checkout = await api.checkout('scout', 'monthly');

      expect(requestBody['checkoutMode'], 'redirect');
      expect(checkout.redirectFields, {'signature': 'signed'});
    });

    test('reads the permanent discovered store directory', () async {
      late Uri requestUri;
      final api = Api(
        client: MockClient((request) async {
          requestUri = request.url;
          return http.Response(
            jsonEncode({
              'data': {
                'stores': [
                  {
                    'placeId': 'store-1',
                    'name': 'Local Market',
                    'lat': -26.1,
                    'lon': 28.05,
                    'logoUrl': 'https://market.test/favicon.ico',
                  }
                ],
                'summary': {'storeCount': 1, 'areaCount': 1}
              },
            }),
            200,
          );
        }),
        cookieStore: MemorySessionCookieStore(),
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      final result = await api.discoveredStores();

      expect(requestUri.path, '/api/discovered-stores');
      expect(result.stores.single.logoUrl, 'https://market.test/favicon.ico');
      expect(result.storeCount, 1);
    });

    test('lists, saves, and removes vouchers through the member API', () async {
      final requests = <http.Request>[];
      final api = Api(
        client: MockClient((request) async {
          requests.add(request);
          if (request.method == 'GET') {
            return http.Response(
              jsonEncode({
                'data': {
                  'vouchers': [
                    {
                      'id': 'voucher-1',
                      'retailerId': 'shoprite',
                      'externalId': 'winter',
                      'title': 'Winter voucher',
                      'benefitText': 'Save R25',
                      'evidenceText': 'Official voucher.',
                      'voucherKind': 'public_code',
                      'redemptionMode': 'code',
                      'redemptionUrl': 'https://shop.test/redeem',
                      'sourceUrl': 'https://shop.test/vouchers',
                      'publicReusable': true,
                      'accountRequired': false,
                      'claimed': false,
                      'capturedAt': '2026-07-16T10:00:00.000Z',
                      'createdAt': '2026-07-16T10:00:00.000Z',
                      'updatedAt': '2026-07-16T10:00:00.000Z',
                      'lastSeenAt': '2026-07-16T10:00:00.000Z',
                      'expiresAt': '2026-07-31T21:59:59.999Z',
                      'status': 'active',
                    }
                  ],
                },
              }),
              200,
            );
          }
          return http.Response(
            jsonEncode({
              'data': request.method == 'POST'
                  ? {'claimed': true, 'voucherId': 'voucher-1'}
                  : {'removed': true, 'voucherId': 'voucher-1'},
            }),
            200,
          );
        }),
        cookieStore: MemorySessionCookieStore(),
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      final vouchers = await api.vouchers();
      expect(vouchers.single.title, 'Winter voucher');
      expect(await api.claimVoucher('voucher-1'), isTrue);
      expect(await api.removeVoucherClaim('voucher-1'), isTrue);
      expect(
          requests.map((request) => request.method), ['GET', 'POST', 'DELETE']);
    });
  });
}

const _accountJson = {
  'id': 'member-1',
  'email': 'sam@example.com',
  'displayName': 'Sam Shopper',
  'initials': 'SS',
  'planId': 'free',
  'planName': 'Free',
  'planStatus': 'active',
  'role': 'member',
  'createdAt': '2026-07-01T10:00:00.000Z',
  'updatedAt': '2026-07-01T10:00:00.000Z',
};
