import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api.dart' show ApiException;
import '../api_models.dart';
import 'business_api.dart';
import 'business_models.dart';

enum BusinessLoadState { loading, ready, error }

class BusinessController extends ChangeNotifier {
  BusinessController({BusinessApiClient? api}) : api = api ?? BusinessApi();

  static const _themeKey = 'ts_business_theme_v1';

  final BusinessApiClient api;
  BusinessLoadState state = BusinessLoadState.loading;
  BusinessBootstrap? bootstrap;
  BusinessAdminOverview? adminOverview;
  List<BusinessAdminApplication>? adminApplications;
  List<BusinessPublication>? adminPublicationQueue;
  ThemeMode themeMode = ThemeMode.system;
  String? error;
  String? notice;
  bool busy = false;

  bool get isAuthenticated =>
      bootstrap?.session.isAuthenticated == true &&
      bootstrap?.session.account != null;

  bool get isAdmin => bootstrap?.session.account?.isAdmin == true;

  Future<void> restore() async {
    state = BusinessLoadState.loading;
    error = null;
    notifyListeners();
    await _loadTheme();
    try {
      bootstrap = await api.bootstrap();
      if (isAdmin) {
        adminOverview = await api.adminOverview();
      } else {
        adminOverview = null;
        adminApplications = null;
        adminPublicationQueue = null;
      }
      state = BusinessLoadState.ready;
    } on ApiException catch (caught) {
      error = caught.message;
      state = BusinessLoadState.error;
    } catch (_) {
      error = 'The business workspace could not be loaded.';
      state = BusinessLoadState.error;
    }
    notifyListeners();
  }

  Future<bool> authenticate(AuthDraft draft) async {
    return _run(() async {
      await api.authenticate(draft);
      bootstrap = await api.bootstrap();
      if (isAdmin) {
        adminOverview = await api.adminOverview();
      }
      state = BusinessLoadState.ready;
      notice = 'Welcome to Trolley Scout for Business.';
    });
  }

  Future<void> signOut() async {
    await _run(() async {
      final session = await api.signOut();
      bootstrap = BusinessBootstrap(
        session: session,
        gate: BusinessGate.signedOut,
        publications: const [],
        locations: const [],
        metrics: BusinessMetrics.empty,
      );
      adminOverview = null;
      adminApplications = null;
      adminPublicationQueue = null;
      notice = null;
    });
  }

  Future<bool> submitApplication(
    BusinessOrganizationApplicationDraft draft,
  ) async {
    error =
        'Apply from the Organisation subscription in the Trolley Scout consumer app.';
    notifyListeners();
    return false;
  }

  Future<bool> refreshAdminOverview() async {
    return _run(() async {
      adminOverview = await api.adminOverview();
    }, clearNotice: false);
  }

  Future<bool> setBusinessStatus(
    BusinessAdminOrganization business,
    String status,
  ) async {
    return _run(() async {
      adminOverview = await api.setBusinessStatus(business.id, status);
      notice = status == 'suspended'
          ? '${business.name} is suspended.'
          : '${business.name} is active again.';
    });
  }

  Future<bool> loadAdminModeration() async {
    return _run(() async {
      final results = await Future.wait([
        api.adminApplications(),
        api.adminPublicationQueue(),
      ]);
      adminApplications =
          results[0].whereType<BusinessAdminApplication>().toList();
      adminPublicationQueue =
          results[1].whereType<BusinessPublication>().toList();
    }, clearNotice: false);
  }

  Future<bool> reviewAdminApplication(
    BusinessAdminApplication application,
    String decision, {
    String? note,
  }) async {
    return _run(() async {
      adminApplications = await api.reviewAdminApplication(
        application.id,
        decision,
        note: note,
      );
      adminOverview = await api.adminOverview();
      notice = decision == 'approved'
          ? '${application.organisationName} is approved.'
          : '${application.organisationName} was rejected.';
    });
  }

  Future<bool> reviewAdminPublication(
    BusinessPublication publication,
    String decision, {
    String? note,
  }) async {
    return _run(() async {
      adminPublicationQueue = await api.reviewAdminPublication(
        publication.id,
        decision,
        note: note,
      );
      adminOverview = await api.adminOverview();
      notice = switch (decision) {
        'approved' => '${publication.title} is approved.',
        'changes_requested' => 'Changes were requested from the business.',
        _ => '${publication.title} was rejected.',
      };
    });
  }

  Future<BusinessPublication?> savePublication(
    BusinessPublicationDraft draft, {
    String? publicationId,
    bool submit = false,
  }) async {
    BusinessPublication? saved;
    final ok = await _run(() async {
      var change = await api.savePublication(
        draft,
        publicationId: publicationId,
      );
      saved = change.publication;
      if (submit) {
        final id = saved?.id ?? publicationId;
        if (id == null || id.isEmpty) {
          throw const ApiException('Save the publication before submitting.');
        }
        change = await api.changePublication(id, 'submit');
        saved = change.publication;
      }
      _replacePublications(change.publications);
      notice = submit
          ? 'Publication sent for review.'
          : 'Draft saved on this workspace.';
    });
    return ok ? saved : null;
  }

  Future<bool> changePublication(
    BusinessPublication publication,
    String operation,
  ) async {
    return _run(() async {
      final change = await api.changePublication(publication.id, operation);
      _replacePublications(change.publications);
      notice = switch (operation) {
        'pause' => 'Publication paused.',
        'resume' => 'Publication resumed.',
        'sold_out' => 'Publication marked sold out.',
        'archive' => 'Publication archived.',
        _ => 'Publication sent for review.',
      };
    });
  }

  Future<bool> saveLocation(
    BusinessLocationDraft draft, {
    String? locationId,
  }) async {
    return _run(() async {
      final locations = await api.saveLocation(
        draft,
        locationId: locationId,
      );
      final current = bootstrap;
      if (current != null) {
        bootstrap = current.copyWith(locations: locations);
      }
      notice = locationId == null ? 'Location added.' : 'Location updated.';
    });
  }

  Future<bool> loadMetrics(int days) async {
    return _run(() async {
      final metrics = await api.metrics(days);
      final current = bootstrap;
      if (current != null) {
        bootstrap = current.copyWith(metrics: metrics);
      }
    }, clearNotice: false);
  }

  Future<BusinessImageUpload?> uploadImage(
    String path, {
    required String altText,
  }) async {
    BusinessImageUpload? uploaded;
    final ok = await _run(() async {
      uploaded = await api.uploadImage(path, altText: altText);
      notice = 'Cover image uploaded.';
    });
    return ok ? uploaded : null;
  }

  Future<void> toggleTheme(Brightness currentBrightness) async {
    themeMode =
        currentBrightness == Brightness.dark ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
        _themeKey,
        themeMode == ThemeMode.dark ? 'dark' : 'light',
      );
    } catch (_) {
      // The chosen theme still applies for the current app session.
    }
  }

  void clearMessage() {
    error = null;
    notice = null;
    notifyListeners();
  }

  void _replacePublications(List<BusinessPublication> publications) {
    final current = bootstrap;
    if (current != null) {
      bootstrap = current.copyWith(publications: publications);
    }
  }

  Future<bool> _run(
    Future<void> Function() operation, {
    bool clearNotice = true,
  }) async {
    if (busy) return false;
    busy = true;
    error = null;
    if (clearNotice) notice = null;
    notifyListeners();
    try {
      await operation();
      return true;
    } on ApiException catch (caught) {
      error = caught.message;
      return false;
    } catch (_) {
      error = 'The request could not be completed. Try again.';
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> _loadTheme() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      themeMode = switch (preferences.getString(_themeKey)) {
        'dark' => ThemeMode.dark,
        'light' => ThemeMode.light,
        _ => ThemeMode.system,
      };
    } catch (_) {
      themeMode = ThemeMode.system;
    }
  }
}
