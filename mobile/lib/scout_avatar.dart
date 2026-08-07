import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'member_state_sync.dart';

/// A shopper's chosen profile picture: one face from a fixed set.
///
/// Deliberately not an upload. An upload costs the shopper data they are here
/// to save, needs moderation, and puts a picture of a real person on a server
/// that has no business holding one. A chosen face costs nothing to store — an
/// id, not an image — and cannot be abused.
///
/// The set is drawn to look like the people who actually use this: South
/// African and broader, different ages, hair, skin, hijab, cochlear implant,
/// glasses. Someone should be able to find themselves in it.
@immutable
class ScoutAvatar {
  const ScoutAvatar({required this.pfpId});

  /// The picture's stable id, which is its filename stem. Reordering the set
  /// never reshuffles anybody's existing pick.
  final String pfpId;

  ScoutAvatar copyWith({String? pfpId}) =>
      ScoutAvatar(pfpId: pfpId ?? this.pfpId);

  Map<String, dynamic> toJson() => {'pfp': pfpId};

  /// Returns null for anything unrecognised, so a corrupt blob — or the
  /// icon-and-colour pick this replaced — falls back to initials rather than
  /// throwing on a cold start.
  static ScoutAvatar? fromJson(Object? value) {
    if (value is! Map) return null;
    final id = value['pfp'];
    if (id is! String || id.isEmpty) return null;
    if (!ScoutAvatarCatalog.has(id)) return null;
    return ScoutAvatar(pfpId: id);
  }

  /// Where the picture is served from. Cloudflare Pages hands these out as
  /// static files: edge-cached, free, and never a database read.
  String get imageUrl => ScoutAvatarCatalog.urlFor(pfpId);

  @override
  bool operator ==(Object other) =>
      other is ScoutAvatar && other.pfpId == pfpId;

  @override
  int get hashCode => pfpId.hashCode;
}

/// One face in the set.
@immutable
class ScoutAvatarOption {
  const ScoutAvatarOption({required this.id, required this.label});

  final String id;

  /// Read aloud by screen readers and shown under the picture in the picker,
  /// so choosing one is not a guess between 28 thumbnails.
  final String label;

  String get imageUrl => ScoutAvatarCatalog.urlFor(id);
}

/// The pictures a shopper may choose from.
///
/// Ids are the filenames under `public/pfps`. Adding a face is a matter of
/// dropping the image there and adding a line here; nothing else knows the
/// list.
class ScoutAvatarCatalog {
  const ScoutAvatarCatalog._();

  /// Where the set is served from. Same origin as the API, so no extra DNS
  /// lookup or CORS surface.
  static const origin = 'https://trolleyscout.co.za';

  static const options = <ScoutAvatarOption>[
    ScoutAvatarOption(id: 'pfp-arab-man-glasses', label: 'Arab man glasses'),
    ScoutAvatarOption(
        id: 'pfp-black-man-afro-turtleneck',
        label: 'Black man afro turtleneck'),
    ScoutAvatarOption(
        id: 'pfp-black-man-brow-scar', label: 'Black man brow scar'),
    ScoutAvatarOption(
        id: 'pfp-black-man-cornrows', label: 'Black man cornrows'),
    ScoutAvatarOption(
        id: 'pfp-black-man-high-top-knit-cap',
        label: 'Black man high top knit cap'),
    ScoutAvatarOption(
        id: 'pfp-black-man-locs-glasses', label: 'Black man locs glasses'),
    ScoutAvatarOption(
        id: 'pfp-black-man-red-glasses', label: 'Black man red glasses'),
    ScoutAvatarOption(
        id: 'pfp-black-man-twists-hoop', label: 'Black man twists hoop'),
    ScoutAvatarOption(
        id: 'pfp-black-nonbinary-taper', label: 'Black nonbinary person taper'),
    ScoutAvatarOption(
        id: 'pfp-black-trans-woman-braids', label: 'Black trans woman braids'),
    ScoutAvatarOption(
        id: 'pfp-black-woman-afro-glasses', label: 'Black woman afro glasses'),
    ScoutAvatarOption(
        id: 'pfp-black-woman-glasses', label: 'Black woman glasses'),
    ScoutAvatarOption(
        id: 'pfp-black-woman-natural-hair', label: 'Black woman natural hair'),
    ScoutAvatarOption(
        id: 'pfp-black-woman-silver-locs', label: 'Black woman silver locs'),
    ScoutAvatarOption(
        id: 'pfp-chinese-south-african-man-glasses',
        label: 'Chinese south African man glasses'),
    ScoutAvatarOption(
        id: 'pfp-coloured-man-curls', label: 'Coloured man curls'),
    ScoutAvatarOption(
        id: 'pfp-coloured-woman-curls', label: 'Coloured woman curls'),
    ScoutAvatarOption(
        id: 'pfp-deaf-woman-cochlear', label: 'Deaf woman cochlear'),
    ScoutAvatarOption(
        id: 'pfp-east-asian-man-headphones',
        label: 'East Asian man headphones'),
    ScoutAvatarOption(
        id: 'pfp-east-asian-woman-silver', label: 'East Asian woman silver'),
    ScoutAvatarOption(id: 'pfp-filipino-man-knit', label: 'Filipino man knit'),
    ScoutAvatarOption(
        id: 'pfp-indian-grandmother-braid', label: 'Indian grandmother braid'),
    ScoutAvatarOption(
        id: 'pfp-latina-woman-curls', label: 'Latina woman curls'),
    ScoutAvatarOption(id: 'pfp-mexican-man-curls', label: 'Mexican man curls'),
    ScoutAvatarOption(
        id: 'pfp-nonbinary-freckles', label: 'Nonbinary person freckles'),
    ScoutAvatarOption(
        id: 'pfp-plus-coloured-man-beanie',
        label: 'Plus-size coloured man beanie'),
    ScoutAvatarOption(
        id: 'pfp-plus-coloured-woman-glasses',
        label: 'Plus-size coloured woman glasses'),
    ScoutAvatarOption(
        id: 'pfp-plus-east-asian-woman-glasses',
        label: 'Plus-size east Asian woman glasses'),
    ScoutAvatarOption(
        id: 'pfp-plus-indian-man-beard', label: 'Plus-size Indian man beard'),
    ScoutAvatarOption(
        id: 'pfp-plus-indian-woman-curls',
        label: 'Plus-size Indian woman curls'),
    ScoutAvatarOption(
        id: 'pfp-plus-white-man-bald-glasses',
        label: 'Plus-size white man bald glasses'),
    ScoutAvatarOption(
        id: 'pfp-plus-white-woman-silver-curls',
        label: 'Plus-size white woman silver curls'),
    ScoutAvatarOption(
        id: 'pfp-somali-woman-hijab', label: 'Somali woman hijab'),
    ScoutAvatarOption(
        id: 'pfp-south-african-elder', label: 'South African elder'),
    ScoutAvatarOption(
        id: 'pfp-south-asian-man-beard', label: 'South Asian man beard'),
    ScoutAvatarOption(
        id: 'pfp-turkish-woman-pixie', label: 'Turkish woman pixie'),
    ScoutAvatarOption(
        id: 'pfp-white-man-ginger-curls', label: 'White man ginger curls'),
    ScoutAvatarOption(
        id: 'pfp-white-nonbinary-undercut',
        label: 'White nonbinary person undercut'),
  ];

  static bool has(String id) => options.any((option) => option.id == id);

  static String urlFor(String id) => '$origin/pfps/$id.webp';

  static ScoutAvatarOption? optionFor(String id) {
    for (final option in options) {
      if (option.id == id) return option;
    }
    return null;
  }
}

/// The shopper's pick, on this device and synced to their account.
class ScoutAvatarStore extends ChangeNotifier {
  ScoutAvatarStore._();

  static final ScoutAvatarStore instance = ScoutAvatarStore._();

  /// Bumped from v1: the old value held an icon and a colour, which this no
  /// longer understands. An unreadable pick falls back to initials, which is
  /// what a shopper who never chose one sees anyway.
  static const storageKey = 'scout_avatar_v2';

  ScoutAvatar? _current;

  ScoutAvatar? get current => _current;

  Future<void> load() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(storageKey);
      if (raw == null || raw.isEmpty) return;
      _current = ScoutAvatar.fromJson(jsonDecode(raw));
      notifyListeners();
    } catch (_) {
      // A pick nobody can read is the same as no pick.
    }
  }

  Future<void> save(ScoutAvatar avatar) async {
    _current = avatar;
    notifyListeners();
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(storageKey, jsonEncode(avatar.toJson()));
      await MemberStateSync.instance.push(
        MemberStateSync.scoutAvatarKey,
        avatar.toJson(),
      );
    } catch (_) {
      // The pick is already live on screen; syncing is best effort.
    }
  }

  /// Applies a pick that arrived from another device.
  void adopt(Object? value) {
    final avatar = ScoutAvatar.fromJson(value);
    if (avatar == null || avatar == _current) return;
    _current = avatar;
    notifyListeners();
  }

  void clear() {
    if (_current == null) return;
    _current = null;
    notifyListeners();
  }
}
