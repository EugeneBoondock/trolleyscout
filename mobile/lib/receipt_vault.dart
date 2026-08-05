import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:path_provider/path_provider.dart';

import 'session_cookie_store.dart';
import 'taste_profile.dart';

class ReceiptLineItem {
  const ReceiptLineItem({required this.title, this.priceText});

  factory ReceiptLineItem.fromJson(Map<String, dynamic> json) =>
      ReceiptLineItem(
        title: json['title'] is String ? json['title'] as String : '',
        priceText: _optionalText(json['priceText']),
      );

  final String title;
  final String? priceText;

  Map<String, dynamic> toJson() => {
        'title': title,
        if (priceText != null) 'priceText': priceText,
      };
}

class ReceiptRecord {
  const ReceiptRecord({
    required this.id,
    required this.retailerName,
    required this.purchaseDate,
    required this.imagePath,
    required this.createdAt,
    this.totalText,
    this.note,
    this.items = const [],
  });

  factory ReceiptRecord.fromJson(Map<String, dynamic> json) => ReceiptRecord(
        id: json['id'] is String ? json['id'] as String : '',
        retailerName: json['retailerName'] is String
            ? json['retailerName'] as String
            : '',
        purchaseDate: json['purchaseDate'] is String
            ? json['purchaseDate'] as String
            : '',
        imagePath:
            json['imagePath'] is String ? json['imagePath'] as String : '',
        createdAt:
            json['createdAt'] is String ? json['createdAt'] as String : '',
        totalText: _optionalText(json['totalText']),
        note: _optionalText(json['note']),
        items: json['items'] is List
            ? (json['items'] as List)
                .whereType<Map>()
                .map((row) =>
                    ReceiptLineItem.fromJson(Map<String, dynamic>.from(row)))
                .where((item) => item.title.trim().isNotEmpty)
                .take(40)
                .toList(growable: false)
            : const [],
      );

  final String id;
  final String retailerName;
  final String purchaseDate;
  final String imagePath;
  final String createdAt;
  final String? totalText;
  final String? note;
  final List<ReceiptLineItem> items;

  Map<String, dynamic> toJson() => {
        'id': id,
        'retailerName': retailerName,
        'purchaseDate': purchaseDate,
        'imagePath': imagePath,
        'createdAt': createdAt,
        if (totalText != null) 'totalText': totalText,
        if (note != null) 'note': note,
        if (items.isNotEmpty)
          'items': items.map((item) => item.toJson()).toList(),
      };
}

abstract class ReceiptFileBackend {
  Future<String> save(String id, String sourcePath);
  Future<void> delete(String savedPath);
}

class DeviceReceiptFileBackend implements ReceiptFileBackend {
  @override
  Future<String> save(String id, String sourcePath) async {
    final source = File(sourcePath);
    if (!await source.exists()) {
      throw const FileSystemException('The selected image is unavailable.');
    }
    final root = await getApplicationDocumentsDirectory();
    final directory =
        Directory('${root.path}${Platform.pathSeparator}receipts');
    await directory.create(recursive: true);
    final suffix = _safeSuffix(sourcePath);
    final destination = File(
      '${directory.path}${Platform.pathSeparator}$id$suffix',
    );
    return (await source.copy(destination.path)).path;
  }

  @override
  Future<void> delete(String savedPath) async {
    final file = File(savedPath);
    if (await file.exists()) await file.delete();
  }
}

class ReceiptVaultStore {
  ReceiptVaultStore({
    SessionSecretBackend? secrets,
    ReceiptFileBackend? files,
    TasteStore? tasteStore,
  })  : _secrets = secrets ?? FlutterSessionSecretBackend(),
        _files = files ?? DeviceReceiptFileBackend(),
        _tasteStore = tasteStore ?? TasteStore();

  static const _key = 'trolley_scout_receipt_vault_v1';
  final SessionSecretBackend _secrets;
  final ReceiptFileBackend _files;
  final TasteStore _tasteStore;

  Future<List<ReceiptRecord>> load() async {
    final raw = await _secrets.read(_key);
    if (raw == null || raw.isEmpty) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map((row) => ReceiptRecord.fromJson(Map<String, dynamic>.from(row)))
          .where((receipt) =>
              receipt.id.isNotEmpty &&
              receipt.retailerName.isNotEmpty &&
              receipt.purchaseDate.isNotEmpty &&
              receipt.imagePath.isNotEmpty)
          .toList(growable: false);
    } catch (_) {
      return const [];
    }
  }

  Future<List<ReceiptRecord>> add({
    required String retailerName,
    required String purchaseDate,
    required String sourceImagePath,
    String? totalText,
    String? note,
    List<ReceiptLineItem> items = const [],
  }) async {
    final retailer = _text(retailerName, 80);
    final date = _text(purchaseDate, 10);
    final total = _text(totalText ?? '', 40);
    final cleanNote = _text(note ?? '', 160);
    final cleanItems = items
        .map((item) {
          final price = _text(item.priceText ?? '', 30);
          return ReceiptLineItem(
            title: _text(item.title, 100),
            priceText: price.isEmpty ? null : price,
          );
        })
        .where((item) => item.title.isNotEmpty)
        .take(40)
        .toList(growable: false);
    if (retailer.isEmpty ||
        !_validDate(date) ||
        sourceImagePath.trim().isEmpty) {
      throw const FormatException(
        'Add a retailer, receipt image, and valid purchase date.',
      );
    }

    final id =
        'receipt-${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 20)}';
    final savedPath = await _files.save(id, sourceImagePath.trim());
    final receipt = ReceiptRecord(
      id: id,
      retailerName: retailer,
      purchaseDate: date,
      imagePath: savedPath,
      totalText: total.isEmpty ? null : total,
      note: cleanNote.isEmpty ? null : cleanNote,
      items: cleanItems,
      createdAt: DateTime.now().toUtc().toIso8601String(),
    );
    final next = [...await load(), receipt]
      ..sort((left, right) => right.purchaseDate.compareTo(left.purchaseDate));
    try {
      await _write(next);
    } catch (_) {
      await _files.delete(savedPath);
      rethrow;
    }
    try {
      await _tasteStore.recordSignal(
        title: [retailer, cleanNote].where((text) => text.isNotEmpty).join(' '),
        category: 'receipt shopping',
        weight: 1.5,
      );
      for (final item in cleanItems) {
        await _tasteStore.recordSignal(
          title: item.title,
          category: 'receipt item',
          weight: 2,
        );
      }
    } catch (_) {
      // Saving a receipt must still succeed when optional local ranking fails.
    }
    return List.unmodifiable(next);
  }

  Future<List<ReceiptRecord>> remove(String id) async {
    final current = await load();
    ReceiptRecord? removed;
    for (final receipt in current) {
      if (receipt.id == id) removed = receipt;
    }
    final next = current.where((receipt) => receipt.id != id).toList();
    await _write(next);
    if (removed != null) await _files.delete(removed.imagePath);
    return List.unmodifiable(next);
  }

  Future<void> _write(List<ReceiptRecord> receipts) => _secrets.write(
        _key,
        jsonEncode(receipts.map((receipt) => receipt.toJson()).toList()),
      );
}

bool _validDate(String value) {
  final parsed = DateTime.tryParse(value);
  return parsed != null && value.length == 10;
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
