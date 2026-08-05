import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:path_provider/path_provider.dart';

import 'session_cookie_store.dart';

const loyaltyProgramQuickPicks = <String>[
  'Checkers',
  'Pick n Pay',
  'Shoprite',
  'SPAR',
  'Woolworths',
  'Clicks',
  'Dis-Chem',
];

enum LoyaltyCardPhotoSide { front, back }

enum LoyaltyCaptureSource { camera, gallery }

enum LoyaltyExpiryState { noExpiry, active, expiringSoon, expired }

class LoyaltyCard {
  const LoyaltyCard({
    required this.id,
    required this.programName,
    required this.cardNumber,
    required this.createdAt,
    this.note,
    this.expiryDate,
    this.frontImagePath,
    this.backImagePath,
  });

  factory LoyaltyCard.fromJson(Map<String, dynamic> json) => LoyaltyCard(
        id: json['id'] is String ? json['id'] as String : '',
        programName:
            json['programName'] is String ? json['programName'] as String : '',
        cardNumber:
            json['cardNumber'] is String ? json['cardNumber'] as String : '',
        note:
            json['note'] is String && (json['note'] as String).trim().isNotEmpty
                ? json['note'] as String
                : null,
        expiryDate: _optionalText(json['expiryDate']),
        frontImagePath: _optionalText(json['frontImagePath']),
        backImagePath: _optionalText(json['backImagePath']),
        createdAt:
            json['createdAt'] is String ? json['createdAt'] as String : '',
      );

  final String id;
  final String programName;
  final String cardNumber;
  final String? note;
  final String? expiryDate;
  final String? frontImagePath;
  final String? backImagePath;
  final String createdAt;

  Map<String, dynamic> toJson() => {
        'id': id,
        'programName': programName,
        'cardNumber': cardNumber,
        if (note != null) 'note': note,
        if (expiryDate != null) 'expiryDate': expiryDate,
        if (frontImagePath != null) 'frontImagePath': frontImagePath,
        if (backImagePath != null) 'backImagePath': backImagePath,
        'createdAt': createdAt,
      };
}

abstract class LoyaltyCardFileBackend {
  Future<String> save(
    String id,
    LoyaltyCardPhotoSide side,
    String sourcePath,
  );

  Future<void> delete(String savedPath);
}

class DeviceLoyaltyCardFileBackend implements LoyaltyCardFileBackend {
  @override
  Future<String> save(
    String id,
    LoyaltyCardPhotoSide side,
    String sourcePath,
  ) async {
    final source = File(sourcePath);
    if (!await source.exists()) {
      throw const FileSystemException(
          'The selected card photo is unavailable.');
    }
    final root = await getApplicationDocumentsDirectory();
    final directory =
        Directory('${root.path}${Platform.pathSeparator}loyalty_cards');
    await directory.create(recursive: true);
    final destination = File(
      '${directory.path}${Platform.pathSeparator}$id-${side.name}${_safeSuffix(sourcePath)}',
    );
    return (await source.copy(destination.path)).path;
  }

  @override
  Future<void> delete(String savedPath) async {
    final file = File(savedPath);
    if (await file.exists()) await file.delete();
  }
}

class LoyaltyWalletStore {
  LoyaltyWalletStore({
    SessionSecretBackend? secrets,
    LoyaltyCardFileBackend? files,
  })  : _secrets = secrets ?? FlutterSessionSecretBackend(),
        _files = files ?? DeviceLoyaltyCardFileBackend();

  static const _key = 'trolley_scout_loyalty_wallet_v1';
  final SessionSecretBackend _secrets;
  final LoyaltyCardFileBackend _files;

  Future<List<LoyaltyCard>> load() async {
    final raw = await _secrets.read(_key);
    if (raw == null || raw.isEmpty) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map((row) => LoyaltyCard.fromJson(Map<String, dynamic>.from(row)))
          .where((card) =>
              card.id.isNotEmpty &&
              card.programName.isNotEmpty &&
              card.cardNumber.isNotEmpty)
          .toList(growable: false);
    } catch (_) {
      return const [];
    }
  }

  Future<List<LoyaltyCard>> add({
    required String programName,
    required String cardNumber,
    String? note,
    String? expiryDate,
    String? frontImageSourcePath,
    String? backImageSourcePath,
  }) async {
    final program = _text(programName, 80);
    final number = _text(cardNumber, 100);
    final cleanNote = _text(note ?? '', 120);
    final expiry = _text(expiryDate ?? '', 10);
    if (program.isEmpty || number.length < 4) {
      throw const FormatException(
          'Add a program name and a valid card number.');
    }
    if (expiry.isNotEmpty && !_validDate(expiry)) {
      throw const FormatException('Use a valid expiry date.');
    }
    final current = await load();
    final duplicate = current.any((card) =>
        card.programName.toLowerCase() == program.toLowerCase() &&
        card.cardNumber.toLowerCase() == number.toLowerCase());
    if (duplicate) {
      throw const FormatException('That loyalty card is already saved.');
    }

    final id =
        'loyalty-${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 20)}';
    final savedPaths = <String>[];
    try {
      final frontPath = await _saveOptionalPhoto(
        id,
        LoyaltyCardPhotoSide.front,
        frontImageSourcePath,
        savedPaths,
      );
      final backPath = await _saveOptionalPhoto(
        id,
        LoyaltyCardPhotoSide.back,
        backImageSourcePath,
        savedPaths,
      );
      final card = LoyaltyCard(
        id: id,
        programName: program,
        cardNumber: number,
        note: cleanNote.isEmpty ? null : cleanNote,
        expiryDate: expiry.isEmpty ? null : expiry,
        frontImagePath: frontPath,
        backImagePath: backPath,
        createdAt: DateTime.now().toUtc().toIso8601String(),
      );
      final next = [...current, card]..sort((a, b) =>
          a.programName.toLowerCase().compareTo(b.programName.toLowerCase()));
      await _write(next);
      return List.unmodifiable(next);
    } catch (_) {
      for (final path in savedPaths) {
        await _files.delete(path);
      }
      rethrow;
    }
  }

  Future<List<LoyaltyCard>> remove(String id) async {
    final current = await load();
    LoyaltyCard? removed;
    for (final card in current) {
      if (card.id == id) removed = card;
    }
    final next = current.where((card) => card.id != id).toList();
    await _write(next);
    if (removed != null) {
      for (final path in [
        removed.frontImagePath,
        removed.backImagePath,
      ]) {
        if (path != null) await _files.delete(path);
      }
    }
    return List.unmodifiable(next);
  }

  Future<String?> _saveOptionalPhoto(
    String id,
    LoyaltyCardPhotoSide side,
    String? sourcePath,
    List<String> savedPaths,
  ) async {
    final source = sourcePath?.trim() ?? '';
    if (source.isEmpty) return null;
    final saved = await _files.save(id, side, source);
    savedPaths.add(saved);
    return saved;
  }

  Future<void> _write(List<LoyaltyCard> cards) => _secrets.write(
      _key, jsonEncode(cards.map((card) => card.toJson()).toList()));
}

LoyaltyExpiryState loyaltyExpiryState(
  String? expiryDate, {
  DateTime? now,
}) {
  if (expiryDate == null || expiryDate.trim().isEmpty) {
    return LoyaltyExpiryState.noExpiry;
  }
  final expiry = DateTime.tryParse(expiryDate.trim());
  if (expiry == null) return LoyaltyExpiryState.noExpiry;
  final current = now ?? DateTime.now();
  final today = DateTime(current.year, current.month, current.day);
  final end = DateTime(expiry.year, expiry.month, expiry.day);
  final days = end.difference(today).inDays;
  if (days < 0) return LoyaltyExpiryState.expired;
  if (days <= 30) return LoyaltyExpiryState.expiringSoon;
  return LoyaltyExpiryState.active;
}

String maskLoyaltyNumber(String value) {
  final clean = value.trim();
  if (clean.length <= 4) return clean;
  return '•••• •••• ${clean.substring(clean.length - 4)}';
}

bool _validDate(String value) {
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value)) return false;
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return false;
  return parsed.toIso8601String().substring(0, 10) == value;
}

String _safeSuffix(String sourcePath) {
  final filename = sourcePath.split(RegExp(r'[/\\]')).last;
  final dot = filename.lastIndexOf('.');
  if (dot < 0) return '.jpg';
  final suffix = filename.substring(dot).toLowerCase();
  return RegExp(r'^\.(jpe?g|png|webp|heic)$').hasMatch(suffix)
      ? suffix
      : '.jpg';
}

String? _optionalText(dynamic value) =>
    value is String && value.trim().isNotEmpty ? value : null;

String _text(String value, int max) {
  final clean = value.trim().replaceAll(RegExp(r'\s+'), ' ');
  return clean.substring(0, min(clean.length, max));
}
