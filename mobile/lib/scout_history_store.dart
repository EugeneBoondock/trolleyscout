import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_models.dart';

/// One past conversation with Mr Scout.
@immutable
class ScoutConversation {
  const ScoutConversation({
    required this.id,
    required this.title,
    required this.startedAt,
    required this.turns,
  });

  final String id;

  /// What the shopper opened with, which is what they will recognise it by.
  final String title;
  final DateTime startedAt;
  final List<ScoutChatTurn> turns;

  Map<String, dynamic> toJson() => {
        'id': id,
        'startedAt': startedAt.toIso8601String(),
        'title': title,
        'turns': turns
            .map((turn) => {'role': turn.role.name, 'text': turn.text})
            .toList(growable: false),
      };

  static ScoutConversation? fromJson(Map<String, dynamic> json) {
    final id = json['id']?.toString() ?? '';
    final startedAt = DateTime.tryParse(json['startedAt']?.toString() ?? '');
    if (id.isEmpty || startedAt == null) return null;
    final turns = <ScoutChatTurn>[];
    for (final raw in (json['turns'] as List?) ?? const []) {
      if (raw is! Map) continue;
      final text = raw['text']?.toString() ?? '';
      if (text.isEmpty) continue;
      turns.add(ScoutChatTurn(
        role: raw['role']?.toString() == 'user'
            ? ScoutChatRole.user
            : ScoutChatRole.assistant,
        text: text,
      ));
    }
    if (turns.isEmpty) return null;
    return ScoutConversation(
      id: id,
      startedAt: startedAt,
      title: json['title']?.toString() ?? turns.first.text,
      turns: turns,
    );
  }
}

/// Past conversations, kept on this phone only.
///
/// Mr Scout is asked about what someone can afford and what they are short of
/// this month. That is nobody else's business, so the transcript never leaves
/// the device: no server copy, and clearing the app clears it.
class ScoutHistoryStore {
  ScoutHistoryStore({SharedPreferences? preferences})
      : _injected = preferences;

  static const _key = 'scout_conversations_v1';

  /// Enough to find last week's shop, few enough to stay small on disk.
  static const maxConversations = 30;

  final SharedPreferences? _injected;

  Future<SharedPreferences> get _prefs async =>
      _injected ?? await SharedPreferences.getInstance();

  Future<List<ScoutConversation>> load() async {
    try {
      final raw = (await _prefs).getString(_key);
      if (raw == null || raw.isEmpty) return const [];
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map((entry) =>
              ScoutConversation.fromJson(Map<String, dynamic>.from(entry)))
          .whereType<ScoutConversation>()
          .toList(growable: false);
    } catch (_) {
      return const [];
    }
  }

  /// Saves, or replaces, one conversation. Newest first.
  Future<void> save(ScoutConversation conversation) async {
    if (conversation.turns.isEmpty) return;
    final existing = await load();
    final kept = [
      conversation,
      ...existing.where((entry) => entry.id != conversation.id),
    ].take(maxConversations).toList(growable: false);
    try {
      await (await _prefs).setString(
        _key,
        jsonEncode(kept.map((entry) => entry.toJson()).toList()),
      );
    } catch (_) {
      // History is a convenience; never fail a conversation over it.
    }
  }

  Future<void> clear() async {
    try {
      await (await _prefs).remove(_key);
    } catch (_) {
      // Nothing to do; the next write replaces it anyway.
    }
  }
}
