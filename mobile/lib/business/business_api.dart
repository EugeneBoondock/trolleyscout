import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../api.dart' show ApiException;
import '../api_models.dart';
import '../platform_http_client.dart';
import '../session_cookie_store.dart';
import 'business_models.dart';

class BusinessPublicationChange {
  const BusinessPublicationChange({
    required this.publications,
    this.publication,
  });

  final BusinessPublication? publication;
  final List<BusinessPublication> publications;
}

abstract interface class BusinessApiClient {
  Future<BusinessBootstrap> bootstrap();
  Future<MemberSession> authenticate(AuthDraft draft);
  Future<MemberSession> signOut();
  Future<BusinessPublicationChange> savePublication(
    BusinessPublicationDraft draft, {
    String? publicationId,
  });
  Future<BusinessPublicationChange> changePublication(
    String publicationId,
    String operation,
  );
  Future<List<BusinessLocation>> saveLocation(
    BusinessLocationDraft draft, {
    String? locationId,
  });
  Future<BusinessMetrics> metrics(int days);
  Future<void> submitApplication(BusinessOrganizationApplicationDraft draft);
  Future<BusinessImageUpload> uploadImage(
    String path, {
    required String altText,
  });
}

class BusinessApi implements BusinessApiClient {
  BusinessApi({
    http.Client? client,
    SessionCookieStore? cookieStore,
    bool? useBrowserCookies,
    this.baseUrl = 'https://trolleyscout.co.za',
    this.requestTimeout = const Duration(seconds: 20),
  })  : _client = client ?? createPlatformHttpClient(),
        _cookieStore = cookieStore ?? SecureSessionCookieStore(),
        _useBrowserCookies = useBrowserCookies ?? platformUsesBrowserCookies;

  final http.Client _client;
  final SessionCookieStore _cookieStore;
  final bool _useBrowserCookies;
  final String baseUrl;
  final Duration requestTimeout;

  @override
  Future<BusinessBootstrap> bootstrap() async {
    final sessionData = await _request('GET', '/api/member-session');
    final session = MemberSession.fromJson(_map(sessionData['session']));
    if (!session.isAuthenticated || session.account == null) {
      return BusinessBootstrap(
        session: session,
        gate: BusinessGate.signedOut,
        publications: const [],
        locations: const [],
        metrics: BusinessMetrics.empty,
      );
    }

    final gate = BusinessGate.fromJson(
      await _request('GET', '/api/organization'),
    );
    if (!gate.hasOrganization || gate.organization == null) {
      return BusinessBootstrap(
        session: session,
        gate: gate,
        publications: const [],
        locations: const [],
        metrics: BusinessMetrics.empty,
      );
    }

    final results = await Future.wait([
      _request('GET', '/api/organization-publications'),
      _request('GET', '/api/organization-locations'),
      _request('GET', '/api/organization-metrics?days=30'),
    ]);
    return BusinessBootstrap(
      session: session,
      gate: gate,
      publications: _publications(results[0]['publications']),
      locations: _locations(results[1]['locations']),
      metrics: BusinessMetrics.fromJson(_map(results[2]['metrics'])),
    );
  }

  @override
  Future<MemberSession> authenticate(AuthDraft draft) async {
    final data = await _request(
      'POST',
      '/api/member-session',
      body: draft.toJson(),
    );
    return MemberSession.fromJson(_map(data['session']));
  }

  @override
  Future<MemberSession> signOut() async {
    try {
      final data = await _request('DELETE', '/api/member-session');
      return MemberSession.fromJson(_map(data['session']));
    } finally {
      await _cookieStore.clear();
    }
  }

  @override
  Future<BusinessPublicationChange> savePublication(
    BusinessPublicationDraft draft, {
    String? publicationId,
  }) async {
    final creating = publicationId == null || publicationId.isEmpty;
    final body = draft.toJson();
    if (!creating) {
      body['operation'] = 'update';
      body['publicationId'] = publicationId;
    }
    final data = await _request(
      creating ? 'POST' : 'PATCH',
      '/api/organization-publications',
      body: body,
    );
    return _publicationChange(data);
  }

  @override
  Future<BusinessPublicationChange> changePublication(
    String publicationId,
    String operation,
  ) async {
    final data = await _request(
      operation == 'archive' ? 'DELETE' : 'PATCH',
      '/api/organization-publications',
      body: {
        'operation': operation,
        'publicationId': publicationId,
      },
    );
    return _publicationChange(data);
  }

  @override
  Future<List<BusinessLocation>> saveLocation(
    BusinessLocationDraft draft, {
    String? locationId,
  }) async {
    final creating = locationId == null || locationId.isEmpty;
    final body = draft.toJson();
    if (!creating) body['locationId'] = locationId;
    final data = await _request(
      creating ? 'POST' : 'PATCH',
      '/api/organization-locations',
      body: body,
    );
    return _locations(data['locations']);
  }

  @override
  Future<BusinessMetrics> metrics(int days) async {
    final safeDays = days == 7 || days == 90 ? days : 30;
    final data = await _request(
      'GET',
      '/api/organization-metrics?days=$safeDays',
    );
    return BusinessMetrics.fromJson(_map(data['metrics']));
  }

  @override
  Future<void> submitApplication(
    BusinessOrganizationApplicationDraft draft,
  ) async {
    await _request(
      'POST',
      '/api/organization-applications',
      body: draft.toJson(),
    );
  }

  @override
  Future<BusinessImageUpload> uploadImage(
    String path, {
    required String altText,
  }) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$baseUrl/api/organization-media'),
    );
    request.headers['accept'] = 'application/json';
    if (!_useBrowserCookies) {
      final cookie = await _cookieStore.read();
      if (cookie != null && cookie.isNotEmpty) {
        request.headers['cookie'] = cookie;
      }
    }
    request.fields['altText'] = altText.trim();
    request.files.add(await http.MultipartFile.fromPath('image', path));

    late final http.Response response;
    try {
      final streamed = await _client.send(request).timeout(requestTimeout);
      response = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw const ApiException('The image upload took too long. Try again.');
    } catch (_) {
      throw const ApiException(
        'Could not upload the image. Check your connection and try again.',
      );
    }
    await _captureCookie(response);
    final data = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        _firstIssue(data) ?? 'The image could not be uploaded.',
        statusCode: response.statusCode,
      );
    }
    return BusinessImageUpload.fromJson(_map(data['media']));
  }

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final request = http.Request(method, Uri.parse('$baseUrl$path'));
    request.headers['accept'] = 'application/json';
    if (body != null) {
      request.headers['content-type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    if (!_useBrowserCookies) {
      final cookie = await _cookieStore.read();
      if (cookie != null && cookie.isNotEmpty) {
        request.headers['cookie'] = cookie;
      }
    }

    late final http.Response response;
    try {
      final streamed = await _client.send(request).timeout(requestTimeout);
      response = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw const ApiException('The request took too long. Try again.');
    } catch (_) {
      throw const ApiException(
        'Could not connect. Check your connection and try again.',
      );
    }
    await _captureCookie(response);
    final data = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      if (response.statusCode == 401) await _cookieStore.clear();
      throw ApiException(
        _firstIssue(data) ?? 'The server returned ${response.statusCode}.',
        statusCode: response.statusCode,
      );
    }
    return data;
  }

  Map<String, dynamic> _decode(http.Response response) {
    if (response.body.isEmpty) return const {};
    late final Object? decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw const ApiException(
        'The server returned an invalid response. Try again.',
      );
    }
    final envelope = _map(decoded);
    return _map(envelope['data']);
  }

  Future<void> _captureCookie(http.Response response) async {
    if (_useBrowserCookies) return;
    final header = response.headers['set-cookie'];
    if (header == null || !header.contains('ts_member_session=')) return;
    final cookie = header.split(';').first.trim();
    final value = cookie.substring(cookie.indexOf('=') + 1);
    if (value.isEmpty || header.toLowerCase().contains('max-age=0')) {
      await _cookieStore.clear();
    } else {
      await _cookieStore.write(cookie);
    }
  }
}

BusinessPublicationChange _publicationChange(Map<String, dynamic> data) =>
    BusinessPublicationChange(
      publication: data['publication'] is Map
          ? BusinessPublication.fromJson(_map(data['publication']))
          : null,
      publications: _publications(data['publications']),
    );

List<BusinessPublication> _publications(Object? value) =>
    _mapList(value).map(BusinessPublication.fromJson).toList(growable: false);

List<BusinessLocation> _locations(Object? value) =>
    _mapList(value).map(BusinessLocation.fromJson).toList(growable: false);

String? _firstIssue(Map<String, dynamic> data) {
  final issues = data['issues'];
  if (issues is List) {
    for (final issue in issues) {
      if (issue is String && issue.trim().isNotEmpty) return issue.trim();
    }
  }
  final message = data['message'];
  return message is String && message.trim().isNotEmpty ? message.trim() : null;
}

Map<String, dynamic> _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

List<Map<String, dynamic>> _mapList(Object? value) => value is List
    ? value
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false)
    : const [];
