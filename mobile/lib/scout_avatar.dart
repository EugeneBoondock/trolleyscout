import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'member_state_sync.dart';

/// A shopper's chosen profile picture: one icon on one colour block.
///
/// Deliberately not a photo. Photos cost data to upload and store, need
/// moderation, and most shoppers on a tight budget will not spend megabytes on
/// one. An icon-and-colour tile is free, instant, works offline, and still lets
/// someone make the account feel like theirs.
///
/// Stored as two stable string keys so reordering [ScoutAvatarCatalog] never
/// reshuffles anybody's existing pick.
@immutable
class ScoutAvatar {
  const ScoutAvatar({required this.iconKey, required this.colorKey});

  final String iconKey;
  final String colorKey;

  ScoutAvatar copyWith({String? iconKey, String? colorKey}) => ScoutAvatar(
        iconKey: iconKey ?? this.iconKey,
        colorKey: colorKey ?? this.colorKey,
      );

  Map<String, dynamic> toJson() => {'icon': iconKey, 'color': colorKey};

  /// Returns null for anything unrecognised — a corrupt or future-version blob
  /// falls back to initials rather than throwing on a cold start.
  static ScoutAvatar? fromJson(Object? value) {
    if (value is! Map) return null;
    final icon = value['icon'];
    final color = value['color'];
    if (icon is! String || color is! String) return null;
    if (!ScoutAvatarCatalog.hasIcon(icon)) return null;
    if (!ScoutAvatarCatalog.hasColor(color)) return null;
    return ScoutAvatar(iconKey: icon, colorKey: color);
  }

  PhosphorIconData get icon => ScoutAvatarCatalog.iconFor(iconKey);

  ScoutAvatarColor get color => ScoutAvatarCatalog.colorFor(colorKey);

  @override
  bool operator ==(Object other) =>
      other is ScoutAvatar &&
      other.iconKey == iconKey &&
      other.colorKey == colorKey;

  @override
  int get hashCode => Object.hash(iconKey, colorKey);
}

/// A background colour plus the ink that stays legible on top of it. Every
/// pairing here clears WCAG AA for graphics (3:1) with room to spare.
@immutable
class ScoutAvatarColor {
  const ScoutAvatarColor({
    required this.key,
    required this.label,
    required this.background,
    required this.foreground,
  });

  final String key;
  final String label;
  final Color background;
  final Color foreground;
}

/// A named group of icons, so the picker reads as a short browse rather than a
/// wall of 50 glyphs.
@immutable
class ScoutAvatarGroup {
  const ScoutAvatarGroup({required this.label, required this.iconKeys});

  final String label;
  final List<String> iconKeys;
}

/// The curated set. Phosphor ships 9 000+ icons; showing all of them would be
/// a chore, not a choice. These are picked for warmth and for the things South
/// African households actually put on a shirt: food, home, weather, sport,
/// music, animals.
class ScoutAvatarCatalog {
  const ScoutAvatarCatalog._();

  static const groups = <ScoutAvatarGroup>[
    ScoutAvatarGroup(label: 'Shop', iconKeys: [
      'cart',
      'basket',
      'storefront',
      'wallet',
      'piggy',
      'coins',
      'gift',
      'tag',
    ]),
    ScoutAvatarGroup(label: 'Food', iconKeys: [
      'avocado',
      'carrot',
      'orange',
      'cherries',
      'pepper',
      'bread',
      'egg',
      'coffee',
      'pizza',
      'cookie',
      'iceCream',
      'popcorn',
      'chefHat',
      'forkKnife',
    ]),
    ScoutAvatarGroup(label: 'Home', iconKeys: [
      'house',
      'plant',
      'leaf',
      'flower',
      'tree',
      'cactus',
      'lightbulb',
      'bookOpen',
    ]),
    ScoutAvatarGroup(label: 'Sky', iconKeys: [
      'sun',
      'moon',
      'star',
      'shootingStar',
      'rainbow',
      'lightning',
      'fire',
      'sparkle',
      'globe',
      'mountains',
    ]),
    ScoutAvatarGroup(label: 'Play', iconKeys: [
      'soccer',
      'basketball',
      'music',
      'headphones',
      'guitar',
      'camera',
      'palette',
      'bicycle',
      'rocket',
      'target',
      'trophy',
      'medal',
    ]),
    ScoutAvatarGroup(label: 'Creatures', iconKeys: [
      'dog',
      'cat',
      'bird',
      'butterfly',
      'fish',
      'paw',
      'feather',
      'ghost',
      'smiley',
      'heart',
      'crown',
      'diamond',
    ]),
  ];

  /// Key to glyph. Fill weight throughout: at 40–72 px a solid shape reads as a
  /// portrait, where a hairline outline reads as a button.
  static const _icons = <String, PhosphorIconData>{
    'cart': PhosphorIconsFill.shoppingCart,
    'basket': PhosphorIconsFill.basket,
    'storefront': PhosphorIconsFill.storefront,
    'wallet': PhosphorIconsFill.wallet,
    'piggy': PhosphorIconsFill.piggyBank,
    'coins': PhosphorIconsFill.coins,
    'gift': PhosphorIconsFill.gift,
    'tag': PhosphorIconsFill.tag,
    'avocado': PhosphorIconsFill.avocado,
    'carrot': PhosphorIconsFill.carrot,
    'orange': PhosphorIconsFill.orange,
    'cherries': PhosphorIconsFill.cherries,
    'pepper': PhosphorIconsFill.pepper,
    'bread': PhosphorIconsFill.bread,
    'egg': PhosphorIconsFill.egg,
    'coffee': PhosphorIconsFill.coffee,
    'pizza': PhosphorIconsFill.pizza,
    'cookie': PhosphorIconsFill.cookie,
    'iceCream': PhosphorIconsFill.iceCream,
    'popcorn': PhosphorIconsFill.popcorn,
    'chefHat': PhosphorIconsFill.chefHat,
    'forkKnife': PhosphorIconsFill.forkKnife,
    'house': PhosphorIconsFill.house,
    'plant': PhosphorIconsFill.plant,
    'leaf': PhosphorIconsFill.leaf,
    'flower': PhosphorIconsFill.flower,
    'tree': PhosphorIconsFill.tree,
    'cactus': PhosphorIconsFill.cactus,
    'lightbulb': PhosphorIconsFill.lightbulb,
    'bookOpen': PhosphorIconsFill.bookOpen,
    'sun': PhosphorIconsFill.sun,
    'moon': PhosphorIconsFill.moon,
    'star': PhosphorIconsFill.star,
    'shootingStar': PhosphorIconsFill.shootingStar,
    'rainbow': PhosphorIconsFill.rainbow,
    'lightning': PhosphorIconsFill.lightning,
    'fire': PhosphorIconsFill.fire,
    'sparkle': PhosphorIconsFill.sparkle,
    'globe': PhosphorIconsFill.globeHemisphereWest,
    'mountains': PhosphorIconsFill.mountains,
    'soccer': PhosphorIconsFill.soccerBall,
    'basketball': PhosphorIconsFill.basketball,
    'music': PhosphorIconsFill.musicNotes,
    'headphones': PhosphorIconsFill.headphones,
    'guitar': PhosphorIconsFill.guitar,
    'camera': PhosphorIconsFill.camera,
    'palette': PhosphorIconsFill.palette,
    'bicycle': PhosphorIconsFill.bicycle,
    'rocket': PhosphorIconsFill.rocket,
    'target': PhosphorIconsFill.target,
    'trophy': PhosphorIconsFill.trophy,
    'medal': PhosphorIconsFill.medal,
    'dog': PhosphorIconsFill.dog,
    'cat': PhosphorIconsFill.cat,
    'bird': PhosphorIconsFill.bird,
    'butterfly': PhosphorIconsFill.butterfly,
    'fish': PhosphorIconsFill.fish,
    'paw': PhosphorIconsFill.pawPrint,
    'feather': PhosphorIconsFill.feather,
    'ghost': PhosphorIconsFill.ghost,
    'smiley': PhosphorIconsFill.smiley,
    'heart': PhosphorIconsFill.heart,
    'crown': PhosphorIconsFill.crown,
    'diamond': PhosphorIconsFill.diamond,
  };

  static const colors = <ScoutAvatarColor>[
    ScoutAvatarColor(
      key: 'yellow',
      label: 'Trolley yellow',
      background: Color(0xFFFFD42E),
      foreground: Color(0xFF1C1710),
    ),
    ScoutAvatarColor(
      key: 'red',
      label: 'Special red',
      background: Color(0xFFC9271B),
      foreground: Color(0xFFFFFDF4),
    ),
    ScoutAvatarColor(
      key: 'green',
      label: 'Saving green',
      background: Color(0xFF0D6B3D),
      foreground: Color(0xFFFFFDF4),
    ),
    ScoutAvatarColor(
      key: 'ink',
      label: 'Ink',
      background: Color(0xFF1C1710),
      foreground: Color(0xFFF3ECD9),
    ),
    ScoutAvatarColor(
      key: 'clay',
      label: 'Clay',
      background: Color(0xFFC2571A),
      foreground: Color(0xFFFFFDF4),
    ),
    ScoutAvatarColor(
      key: 'sky',
      label: 'Sky',
      background: Color(0xFF1B5E92),
      foreground: Color(0xFFFFFDF4),
    ),
    ScoutAvatarColor(
      key: 'plum',
      label: 'Plum',
      background: Color(0xFF5F2450),
      foreground: Color(0xFFFFFDF4),
    ),
    ScoutAvatarColor(
      key: 'teal',
      label: 'Teal',
      background: Color(0xFF0F6B60),
      foreground: Color(0xFFFFFDF4),
    ),
    ScoutAvatarColor(
      key: 'berry',
      label: 'Berry',
      background: Color(0xFF97123A),
      foreground: Color(0xFFFFFDF4),
    ),
    ScoutAvatarColor(
      key: 'sand',
      label: 'Sand',
      background: Color(0xFFECE4CD),
      foreground: Color(0xFF1C1710),
    ),
  ];

  static List<String> get iconKeys =>
      [for (final group in groups) ...group.iconKeys];

  static bool hasIcon(String key) => _icons.containsKey(key);

  static bool hasColor(String key) =>
      colors.any((option) => option.key == key);

  static PhosphorIconData iconFor(String key) =>
      _icons[key] ?? PhosphorIconsFill.shoppingCart;

  static ScoutAvatarColor colorFor(String key) =>
      colors.firstWhere((option) => option.key == key,
          orElse: () => colors.first);

  /// A stable, pleasant default derived from the account name, so a shopper who
  /// never opens the picker still gets a tile that is recognisably theirs
  /// rather than everyone sharing one grey circle.
  static ScoutAvatar suggestionFor(String seed) {
    final keys = iconKeys;
    if (seed.isEmpty) {
      return ScoutAvatar(iconKey: keys.first, colorKey: colors.first.key);
    }
    var hash = 0;
    for (final unit in seed.codeUnits) {
      hash = (hash * 31 + unit) & 0x7FFFFFFF;
    }
    return ScoutAvatar(
      iconKey: keys[hash % keys.length],
      colorKey: colors[(hash ~/ keys.length) % colors.length].key,
    );
  }
}

/// Holds the shopper's pick, persists it on device, and mirrors it to the
/// account so it follows them to a new phone.
///
/// [current] is null until the shopper chooses — the UI shows their initials
/// until then, which keeps the picker a delight rather than a chore gate.
class ScoutAvatarStore extends ChangeNotifier {
  ScoutAvatarStore._();

  static final ScoutAvatarStore instance = ScoutAvatarStore._();

  /// Also the /api/member-state key, so it must match ^[a-z0-9_]{2,40}$.
  static const storageKey = 'scout_avatar_v1';

  ScoutAvatar? _current;

  ScoutAvatar? get current => _current;

  /// Reads whatever [MemberStateSync.hydrate] pulled down, or the local pick.
  Future<void> load() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(storageKey);
      if (raw == null) return;
      _current = ScoutAvatar.fromJson(jsonDecode(raw));
      notifyListeners();
    } catch (_) {
      // No avatar yet, or an unreadable blob: initials stand in.
    }
  }

  Future<void> save(ScoutAvatar avatar) async {
    if (_current == avatar) return;
    _current = avatar;
    notifyListeners();
    final encoded = jsonEncode(avatar.toJson());
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(storageKey, encoded);
    } catch (_) {
      // The in-memory pick still applies for this session.
    }
    await MemberStateSync.instance.push(storageKey, avatar.toJson());
  }

  /// Drops the pick on sign-out so the next shopper on a shared phone — common
  /// where one handset serves a whole household — does not inherit it.
  void clear() {
    if (_current == null) return;
    _current = null;
    notifyListeners();
  }
}
