import 'dart:async';

import 'package:shared_preferences/shared_preferences.dart';

import 'api_models.dart';

/// A bounded on-device history of Window Shopping deals that reached the
/// selected page. Writes are queued so fast swipes cannot overwrite one
/// another before SharedPreferences finishes saving.
class WindowSeenStore {
  WindowSeenStore({this.maxEntries = 6000}) : assert(maxEntries > 0);

  static const preferenceKey = 'window_seen_v1';
  static Future<void> _sharedWriteQueue = Future<void>.value();
  static final List<_PendingSeenMark> _pendingMarks = [];
  static Completer<void>? _pendingFlush;

  final int maxEntries;

  Future<List<String>> load() async {
    await _sharedWriteQueue;
    return _readNow();
  }

  Future<Set<String>> loadIds() async => (await load()).toSet();

  Future<void> markSeen(String id) {
    final normalized = id.trim();
    if (normalized.isEmpty) return Future<void>.value();

    _pendingMarks.removeWhere((mark) => mark.id == normalized);
    _pendingMarks.add(_PendingSeenMark(normalized, maxEntries));

    final active = _pendingFlush;
    if (active != null) return active.future;

    final completer = Completer<void>();
    _pendingFlush = completer;
    final drain = _sharedWriteQueue.then((_) => _flushPending());
    _sharedWriteQueue = drain;
    drain.whenComplete(() {
      if (identical(_pendingFlush, completer)) _pendingFlush = null;
      if (!completer.isCompleted) completer.complete();
    });
    return completer.future;
  }

  Future<void> _flushPending() async {
    while (_pendingMarks.isNotEmpty) {
      final batch = List<_PendingSeenMark>.of(_pendingMarks);
      _pendingMarks.clear();
      final limit = batch
          .map((mark) => mark.maxEntries)
          .reduce((left, right) => left < right ? left : right);
      try {
        final current = await _readNow(limit: limit);
        for (final mark in batch) {
          current.remove(mark.id);
          current.insert(0, mark.id);
        }
        final preferences = await SharedPreferences.getInstance();
        await preferences.setStringList(
          preferenceKey,
          current.take(limit).toList(growable: false),
        );
      } catch (_) {
        // Viewing history is best-effort and must never interrupt browsing.
      }
    }
  }

  Future<List<String>> _readNow({int? limit}) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getStringList(preferenceKey) ?? const <String>[];
      final unique = <String>{};
      return raw
          .map((id) => id.trim())
          .where((id) => id.isNotEmpty && unique.add(id))
          .take(limit ?? maxEntries)
          .toList();
    } catch (_) {
      return const [];
    }
  }
}

class _PendingSeenMark {
  const _PendingSeenMark(this.id, this.maxEntries);

  final String id;
  final int maxEntries;
}

/// Deal-site IDs are normally stable. The URL keeps malformed or older rows
/// with an empty ID from repeating after the app is reopened.
String windowSeenKey(ScrollDeal deal) {
  final id = deal.id.trim();
  if (id.isNotEmpty) return id;
  final url = deal.productUrl.trim();
  if (url.isNotEmpty) return 'url:$url';
  return 'deal:${deal.source.trim()}:${deal.retailerName.trim()}:${deal.title.trim()}';
}
