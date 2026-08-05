import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:path_provider/path_provider.dart';

import 'session_cookie_store.dart';

enum PersonalCouponPhotoSide { offer, terms }

enum PersonalCouponCaptureSource { camera, gallery }

class PersonalCoupon {
  const PersonalCoupon({
    required this.id,
    required this.retailerName,
    required this.code,
    required this.validThrough,
    required this.createdAt,
    this.note,
    this.terms,
    this.receivedDate,
    this.offerImagePath,
    this.termsImagePath,
  });

  factory PersonalCoupon.fromJson(Map<String, dynamic> json) => PersonalCoupon(
        id: json['id'] is String ? json['id'] as String : '',
        retailerName: json['retailerName'] is String
            ? json['retailerName'] as String
            : '',
        code: json['code'] is String ? json['code'] as String : '',
        validThrough: json['validThrough'] is String
            ? json['validThrough'] as String
            : '',
        createdAt:
            json['createdAt'] is String ? json['createdAt'] as String : '',
        note:
            json['note'] is String && (json['note'] as String).trim().isNotEmpty
                ? json['note'] as String
                : null,
        terms: _optionalText(json['terms']),
        receivedDate: _optionalText(json['receivedDate']),
        offerImagePath: _optionalText(json['offerImagePath']),
        termsImagePath: _optionalText(json['termsImagePath']),
      );

  final String id;
  final String retailerName;
  final String code;
  final String validThrough;
  final String createdAt;
  final String? note;
  final String? terms;
  final String? receivedDate;
  final String? offerImagePath;
  final String? termsImagePath;

  bool get isExpired {
    final expiry = DateTime.tryParse(validThrough);
    if (expiry == null) return false;
    final today = DateTime.now();
    return expiry.isBefore(DateTime(today.year, today.month, today.day));
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'retailerName': retailerName,
        'code': code,
        'validThrough': validThrough,
        'createdAt': createdAt,
        if (note != null) 'note': note,
        if (terms != null) 'terms': terms,
        if (receivedDate != null) 'receivedDate': receivedDate,
        if (offerImagePath != null) 'offerImagePath': offerImagePath,
        if (termsImagePath != null) 'termsImagePath': termsImagePath,
      };
}

abstract class PersonalCouponFileBackend {
  Future<String> save(
    String id,
    PersonalCouponPhotoSide side,
    String sourcePath,
  );

  Future<void> delete(String savedPath);
}

class DevicePersonalCouponFileBackend implements PersonalCouponFileBackend {
  @override
  Future<String> save(
    String id,
    PersonalCouponPhotoSide side,
    String sourcePath,
  ) async {
    final source = File(sourcePath);
    if (!await source.exists()) {
      throw const FileSystemException(
        'The selected coupon photo is unavailable.',
      );
    }
    final root = await getApplicationDocumentsDirectory();
    final directory =
        Directory('${root.path}${Platform.pathSeparator}personal_coupons');
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

class PersonalCouponVaultStore {
  PersonalCouponVaultStore({
    SessionSecretBackend? secrets,
    PersonalCouponFileBackend? files,
  })  : _secrets = secrets ?? FlutterSessionSecretBackend(),
        _files = files ?? DevicePersonalCouponFileBackend();

  static const _key = 'trolley_scout_personal_coupon_vault_v1';
  final SessionSecretBackend _secrets;
  final PersonalCouponFileBackend _files;

  Future<List<PersonalCoupon>> load() async {
    final raw = await _secrets.read(_key);
    if (raw == null || raw.isEmpty) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map((row) => PersonalCoupon.fromJson(Map<String, dynamic>.from(row)))
          .where((coupon) =>
              coupon.id.isNotEmpty &&
              coupon.retailerName.isNotEmpty &&
              coupon.code.isNotEmpty &&
              _validDate(coupon.validThrough))
          .toList(growable: false);
    } catch (_) {
      return const [];
    }
  }

  Future<List<PersonalCoupon>> add({
    required String retailerName,
    required String code,
    required String validThrough,
    String? note,
    String? terms,
    String? receivedDate,
    String? offerImageSourcePath,
    String? termsImageSourcePath,
  }) async {
    final retailer = _text(retailerName, 80);
    final cleanCode = _text(code, 100);
    final expiry = _text(validThrough, 10);
    final cleanNote = _text(note ?? '', 160);
    final cleanTerms = _text(terms ?? '', 160);
    final received = _text(receivedDate ?? '', 10);
    if (retailer.isEmpty || cleanCode.length < 2 || !_validDate(expiry)) {
      throw const FormatException(
        'Add a retailer, coupon code, and valid expiry date.',
      );
    }
    if (received.isNotEmpty && !_validDate(received)) {
      throw const FormatException('Use a valid received date.');
    }

    final current = await load();
    if (current.any((coupon) =>
        coupon.retailerName.toLowerCase() == retailer.toLowerCase() &&
        coupon.code.toLowerCase() == cleanCode.toLowerCase())) {
      throw const FormatException('That coupon is already saved.');
    }

    final id =
        'coupon-${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 20)}';
    final savedPaths = <String>[];
    try {
      final offerImagePath = await _saveOptionalPhoto(
        id,
        PersonalCouponPhotoSide.offer,
        offerImageSourcePath,
        savedPaths,
      );
      final termsImagePath = await _saveOptionalPhoto(
        id,
        PersonalCouponPhotoSide.terms,
        termsImageSourcePath,
        savedPaths,
      );
      final coupon = PersonalCoupon(
        id: id,
        retailerName: retailer,
        code: cleanCode,
        validThrough: expiry,
        createdAt: DateTime.now().toUtc().toIso8601String(),
        note: cleanNote.isEmpty ? null : cleanNote,
        terms: cleanTerms.isEmpty ? null : cleanTerms,
        receivedDate: received.isEmpty ? null : received,
        offerImagePath: offerImagePath,
        termsImagePath: termsImagePath,
      );
      final next = [...current, coupon]..sort(
          (left, right) => left.validThrough.compareTo(right.validThrough),
        );
      await _write(next);
      return List.unmodifiable(next);
    } catch (_) {
      for (final path in savedPaths) {
        await _files.delete(path);
      }
      rethrow;
    }
  }

  Future<List<PersonalCoupon>> remove(String id) async {
    final current = await load();
    PersonalCoupon? removed;
    for (final coupon in current) {
      if (coupon.id == id) removed = coupon;
    }
    final next = current.where((coupon) => coupon.id != id).toList();
    await _write(next);
    if (removed != null) {
      for (final path in [
        removed.offerImagePath,
        removed.termsImagePath,
      ]) {
        if (path != null) await _files.delete(path);
      }
    }
    return List.unmodifiable(next);
  }

  Future<String?> _saveOptionalPhoto(
    String id,
    PersonalCouponPhotoSide side,
    String? sourcePath,
    List<String> savedPaths,
  ) async {
    final source = sourcePath?.trim() ?? '';
    if (source.isEmpty) return null;
    final saved = await _files.save(id, side, source);
    savedPaths.add(saved);
    return saved;
  }

  Future<void> _write(List<PersonalCoupon> coupons) => _secrets.write(
        _key,
        jsonEncode(coupons.map((coupon) => coupon.toJson()).toList()),
      );
}

bool _validDate(String value) {
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value)) return false;
  final parsed = DateTime.tryParse(value);
  return parsed != null && parsed.toIso8601String().substring(0, 10) == value;
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
