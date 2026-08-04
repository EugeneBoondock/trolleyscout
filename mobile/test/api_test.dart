import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/session_cookie_store.dart';

void main() {
  test('Mr Scout sends recent conversation turns and parses trusted cards',
      () async {
    final requests = <http.Request>[];
    final api = Api(
      client: MockClient((request) async {
        requests.add(request);
        return http.Response(
          jsonEncode({
            'data': {
              'answer': {
                'reply': 'The cereal offer saves the most.',
                'deals': [
                  {
                    'id': 'deal-1',
                    'retailerName': 'Fresh Market',
                    'title': 'Family cereal',
                    'priceText': r'$4.99',
                    'previousPriceText': r'$6.99',
                    'savingText': r'Save $2',
                    'imageUrl': 'https://img.example.test/cereal.jpg',
                    'productUrl': 'https://shop.example.test/cereal',
                  }
                ],
                'catalogues': [
                  {
                    'id': 'catalogue-1',
                    'retailerName': 'Fresh Market',
                    'name': 'Weekly savings',
                    'url': 'https://shop.example.test/catalogue',
                    'imageUrl': 'https://img.example.test/cover.jpg',
                    'pageCount': 0,
                    'pagesUrl':
                        'https://example.test/api/catalogue-pages?flyer=1',
                    'pageImageUrls': [
                      'https://img.example.test/page-1.jpg',
                    ],
                  }
                ],
                'followUps': ['Show breakfast deals'],
                'groceryPlan': {
                  'assumptions': ['Two people for three days'],
                  'currencyCode': 'ZAR',
                  'items': [
                    {
                      'assumption': 'One bag',
                      'group': 'Staple',
                      'id': 'rice',
                      'lineTotalCents': 5000,
                      'lineTotalText': 'R50.00',
                      'priceText': 'R50.00',
                      'productUrl': 'https://shop.example.test/rice',
                      'quantity': 1,
                      'retailerId': 'fresh-market',
                      'retailerName': 'Fresh Market',
                      'sourceUrl': 'https://shop.example.test/rice',
                      'title': 'Long grain rice',
                      'unitPriceCents': 5000,
                    }
                  ],
                  'maxStores': 3,
                  'missingItems': [],
                  'storeCount': 1,
                  'subtotalCents': 5000,
                  'subtotalText': 'R50.00',
                  'totalCents': 5000,
                  'totalText': 'R50.00',
                  'tradeOffs': [],
                },
              },
            },
          }),
          200,
        );
      }),
      cookieStore: MemorySessionCookieStore(
        'ts_member_session=secret-token',
      ),
      useBrowserCookies: false,
      baseUrl: 'https://example.test',
    );

    final answer = await api.scoutChat(
      'Find breakfast savings',
      const [
        ScoutChatTurn(role: ScoutChatRole.user, text: 'I have a small budget'),
        ScoutChatTurn(
          role: ScoutChatRole.assistant,
          text: 'Which meal are you planning?',
        ),
      ],
    );

    expect(answer.reply, 'The cereal offer saves the most.');
    expect(answer.deals.single.priceText, r'$4.99');
    expect(answer.catalogues.single.pageImageUrls, hasLength(1));
    expect(
      answer.catalogues.single.toCatalogue().pagesUrl,
      'https://example.test/api/catalogue-pages?flyer=1',
    );
    expect(answer.followUps, ['Show breakfast deals']);
    expect(answer.groceryPlan?.items.single.title, 'Long grain rice');
    expect(answer.groceryPlan?.maxStores, 3);
    expect(requests.single.method, 'POST');
    expect(requests.single.url.path, '/api/scout-chat');
    expect(
      jsonDecode(requests.single.body),
      {
        'message': 'Find breakfast savings',
        'history': [
          {'role': 'user', 'text': 'I have a small budget'},
          {
            'role': 'assistant',
            'text': 'Which meal are you planning?',
          },
        ],
      },
    );
  });

  test('saving a discovery deal to basket performs both operations', () async {
    final api = _SaveBasketApi();
    const deal = Deal(
      id: 'deal-1',
      retailerId: 'onedayonly',
      retailerName: 'OneDayOnly',
      sourceLabel: 'OneDayOnly',
      sourceUrl: 'https://example.test/deal-1',
      productUrl: 'https://example.test/deal-1',
      title: 'Daily deal',
      capturedAt: '2026-07-21T12:00:00.000Z',
      evidenceText: 'Found by Trolley Scout.',
    );

    await api.saveDealToBasket(deal, quantity: 3);

    expect(api.savedTitles, ['Daily deal']);
    expect(api.basketSavedDealIds, ['member-saved-1']);
    expect(api.basketQuantities, [3]);
  });

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
      expect(session.account?.countryCode, 'ZW');
      expect(api.effectiveCountryCode, 'ZW');
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

    test('sign out clears the native cookie when the server is unavailable',
        () async {
      final cookieStore =
          MemorySessionCookieStore('ts_member_session=secret-token');
      final api = Api(
        client: MockClient((request) async => throw Exception('offline')),
        cookieStore: cookieStore,
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      await expectLater(api.signOut(), throwsException);

      expect(await cookieStore.read(), isNull);
    });

    test('times out when the response body never finishes', () async {
      final api = Api(
        client: _StalledBodyClient(),
        cookieStore: MemorySessionCookieStore(),
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
        requestTimeout: const Duration(milliseconds: 20),
      );

      await expectLater(
        api.session(),
        throwsA(
          isA<ApiException>().having(
            (error) => error.message,
            'message',
            'The request took too long. Try again.',
          ),
        ),
      );
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

    test('uses the encrypted account snapshot during a network outage',
        () async {
      final snapshot = MemorySessionSnapshotStore(jsonEncode({
        'isAuthenticated': true,
        'account': _accountJson,
      }));
      final api = Api(
        client: MockClient((request) async => throw Exception('offline')),
        cookieStore: MemorySessionCookieStore(),
        sessionStore: snapshot,
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      final session = await api.session();

      expect(session.isAuthenticated, isTrue);
      expect(session.isOffline, isTrue);
      expect(session.account?.displayName, 'Sam Shopper');
    });

    test('does not use a cached account after the server rejects the session',
        () async {
      final snapshot = MemorySessionSnapshotStore(jsonEncode({
        'isAuthenticated': true,
        'account': _accountJson,
      }));
      final api = Api(
        client: MockClient((request) async => http.Response(
              jsonEncode({
                'data': {
                  'session': {'isAuthenticated': false},
                },
              }),
              401,
            )),
        cookieStore: MemorySessionCookieStore('ts_member_session=old'),
        sessionStore: snapshot,
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      await expectLater(api.session(), throwsA(isA<ApiException>()));

      expect(await snapshot.read(), isNull);
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

    test('allows the full marketplace feed to use the slow request window',
        () async {
      final api = Api(
        client: MockClient((request) async {
          await Future<void>.delayed(const Duration(milliseconds: 40));
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
        requestTimeout: const Duration(milliseconds: 20),
        slowRequestTimeout: const Duration(milliseconds: 200),
      );

      final result = await api.discovery();

      expect(result.foundDealCount, 0);
    });

    test('keeps marketplace plan allowances in the on-device discovery cache',
        () async {
      final result = DiscoveryResult.fromJson({
        'access': {
          'availableCatalogueCount': 72,
          'availableDealCount': 12000,
          'catalogueLimit': 50,
          'dealLimit': 2000,
          'planId': 'free',
        },
        'deals': [],
        'leaflets': [],
        'summary': {
          'checkedSourceCount': 0,
          'foundDealCount': 12000,
          'leafletCount': 72,
          'unavailableSourceCount': 0,
        },
      });

      expect(result.toJson()['access'], {
        'availableCatalogueCount': 72,
        'availableDealCount': 12000,
        'catalogueLimit': 50,
        'dealLimit': 2000,
        'planId': 'free',
      });
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

    test('an admin country refresh does not run South African deal sites',
        () async {
      SharedPreferences.setMockInitialValues({
        'ts_admin_country_override_v1': 'ZW',
      });
      final paths = <String>[];
      final api = Api(
        client: MockClient((request) async {
          paths.add(request.url.path);
          return http.Response(
            jsonEncode({
              'data': request.url.path == '/api/discovery'
                  ? {
                      'deals': [],
                      'sources': [],
                      'summary': {
                        'checkedSourceCount': 0,
                        'foundDealCount': 0,
                        'unavailableSourceCount': 0,
                      },
                    }
                  : {'deals': []},
            }),
            200,
          );
        }),
        cookieStore: MemorySessionCookieStore(),
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      await api.refreshDealSources();

      expect(paths, ['/api/discovery']);
    });

    test('keeps nearby country and branch website metadata', () async {
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
                  'flag': '🇿🇼',
                  'name': 'Zimbabwe',
                },
                'stores': [
                  {
                    'placeId': 'ok-harare',
                    'name': 'OK Zimbabwe Harare',
                    'countryCode': 'ZW',
                    'countryName': 'Zimbabwe',
                    'website': 'https://www.okzimbabwe.co.zw/',
                    'lat': -17.8252,
                    'lon': 31.0335,
                  },
                ],
              },
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
        cookieStore: MemorySessionCookieStore(),
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      final result = await api.nearbyStores(-17.8252, 31.0335);

      expect(result.country?.code, 'ZW');
      expect(result.stores.single.website, 'https://www.okzimbabwe.co.zw/');
      expect(result.stores.single.countryName, 'Zimbabwe');
      expect(captured.url.queryParameters['country'], 'ZW');
    });

    test('posts selected stores to the live product-price endpoint', () async {
      late http.Request captured;
      final api = Api(
        client: MockClient((request) async {
          captured = request;
          return http.Response(
            jsonEncode({
              'data': {
                'checkedAt': '2026-07-22T00:00:00.000Z',
                'country': {
                  'code': 'ZA',
                  'currencyCode': 'ZAR',
                  'flag': 'ZA',
                  'name': 'South Africa',
                },
                'foundCount': 2,
                'matches': [
                  {
                    'priceCents': 3299,
                    'productUrl': 'https://www.pnp.co.za/milk-2l',
                    'retailerId': 'pick-n-pay',
                    'retailerName': 'Pick n Pay',
                    'sourceKind': 'official-site',
                    'status': 'priced',
                    'title': 'PnP Full Cream Fresh Milk 2L',
                  },
                  {
                    'priceCents': 3499,
                    'productUrl': 'https://www.checkers.co.za/milk-2l',
                    'retailerId': 'checkers',
                    'retailerName': 'Checkers',
                    'sourceKind': 'official-site',
                    'status': 'priced',
                    'title': 'Clover Fresh Full Cream Milk 2L',
                  },
                ],
                'pricedCount': 2,
                'query': 'milk 2L',
                'savingsCents': 200,
                'unavailableCount': 0,
              },
            }),
            200,
          );
        }),
        cookieStore: MemorySessionCookieStore(),
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      final result = await api.searchProductPrices(
        query: 'milk 2L',
        retailerIds: const ['pick-n-pay', 'checkers'],
      );

      expect(captured.method, 'POST');
      expect(captured.url.path, '/api/price-compare');
      expect(jsonDecode(captured.body), {
        'query': 'milk 2L',
        'retailerIds': ['pick-n-pay', 'checkers'],
      });
      expect(result.pricedCount, 2);
      expect(result.matches.first.priceCents, 3299);
      expect(result.country.currencyCode, 'ZAR');
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

    test('cancels a reversible scheduled plan change with DELETE', () async {
      late String method;
      final api = Api(
        client: MockClient((request) async {
          method = request.method;
          return http.Response(
            jsonEncode({
              'data': {
                'account': {
                  'id': 'member-1',
                  'email': 'sam@example.test',
                  'displayName': 'Sam Shopper',
                  'initials': 'SS',
                  'planId': 'scout',
                  'planName': 'Scout',
                  'planStatus': 'active',
                  'role': 'member',
                  'propertiesAccess': false,
                  'createdAt': '2026-08-01T00:00:00.000Z',
                  'updatedAt': '2026-08-04T00:00:00.000Z',
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

      final account = await api.cancelScheduledPlanChange();

      expect(method, 'DELETE');
      expect(account.planId, 'scout');
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

    test('requests a lightweight discovered-store page and one branch detail',
        () async {
      final requests = <Uri>[];
      final api = Api(
        client: MockClient((request) async {
          requests.add(request.url);
          return http.Response(
            jsonEncode({
              'data': {
                'stores': [
                  {
                    'placeId':
                        request.url.queryParameters['placeId'] ?? 'store-1',
                    'name': 'Local Market',
                    'lat': -26.1,
                    'lon': 28.05,
                    'detailsLoaded':
                        request.url.queryParameters['details'] != '0',
                  }
                ],
                'pagination': {'hasMore': true, 'limit': 60, 'offset': 60},
                'summary': {'storeCount': 140, 'areaCount': 9},
              },
            }),
            200,
          );
        }),
        cookieStore: MemorySessionCookieStore(),
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      final page = await api.discoveredStores(
        limit: 60,
        offset: 60,
        query: 'corner shop',
        includeDetails: false,
      );
      final detail = await api.discoveredStores(placeId: 'store/1', limit: 1);

      expect(page.hasMore, isTrue);
      expect(page.stores.single.detailsLoaded, isFalse);
      expect(requests.first.queryParameters, containsPair('details', '0'));
      expect(requests.first.queryParameters, containsPair('offset', '60'));
      expect(requests.first.queryParameters, containsPair('q', 'corner shop'));
      expect(requests.last.queryParameters, containsPair('placeId', 'store/1'));
      expect(detail.stores.single.placeId, 'store/1');
    });

    test('requests compact dashboard store and voucher summaries', () async {
      final requests = <Uri>[];
      final api = Api(
        client: MockClient((request) async {
          requests.add(request.url);
          if (request.url.path == '/api/discovered-stores') {
            return http.Response(
              jsonEncode({
                'data': {
                  'stores': [],
                  'summary': {'storeCount': 42, 'areaCount': 7},
                },
              }),
              200,
            );
          }
          return http.Response(
            jsonEncode({
              'data': {
                'summary': {'activeVoucherCount': 9},
                'vouchers': [],
              },
            }),
            200,
          );
        }),
        cookieStore: MemorySessionCookieStore(),
        useBrowserCookies: false,
        baseUrl: 'https://example.test',
      );

      final stores = await api.discoveredStores(summary: true);
      final vouchers = await api.voucherCount();

      expect(stores.storeCount, 42);
      expect(vouchers, 9);
      expect(requests.map((uri) => uri.queryParameters['summary']), ['1', '1']);
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

class _StalledBodyClient extends http.BaseClient {
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async =>
      http.StreamedResponse(StreamController<List<int>>().stream, 200);
}

class _SaveBasketApi extends Api {
  _SaveBasketApi() : super(baseUrl: 'https://example.test');

  final savedTitles = <String>[];
  final basketSavedDealIds = <String>[];
  final basketQuantities = <int>[];

  @override
  Future<List<SavedDeal>> saveDeal(Deal deal) async {
    savedTitles.add(deal.title);
    return [
      SavedDeal(
        id: 'member-saved-1',
        retailerId: deal.retailerId,
        retailerName: deal.retailerName,
        sourceLabel: deal.sourceLabel,
        sourceUrl: deal.sourceUrl,
        productUrl: deal.productUrl,
        title: deal.title,
        capturedAt: deal.capturedAt,
        evidenceText: deal.evidenceText,
        savedAt: '2026-07-21T12:00:00.000Z',
      ),
    ];
  }

  @override
  Future<Basket> addBasketItem(String savedDealId, {int quantity = 1}) async {
    basketSavedDealIds.add(savedDealId);
    basketQuantities.add(quantity);
    return const Basket.empty();
  }
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
  'countryCode': 'ZW',
  'countryName': 'Zimbabwe',
  'currencyCode': 'ZWG',
  'createdAt': '2026-07-01T10:00:00.000Z',
  'updatedAt': '2026-07-01T10:00:00.000Z',
};
