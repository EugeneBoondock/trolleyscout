import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';

/// One saved look: the rendered try-on plus what was being worn.
class SavedFit {
  const SavedFit({
    required this.id,
    required this.title,
    required this.savedAt,
    required this.imagePath,
    this.valueCents = 0,
    this.pinned = false,
  });

  factory SavedFit.fromJson(Map<String, dynamic> json) => SavedFit(
        id: json['id']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        savedAt: DateTime.tryParse(json['savedAt']?.toString() ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0),
        imagePath: json['imagePath']?.toString() ?? '',
        valueCents:
            json['valueCents'] is num ? (json['valueCents'] as num).toInt() : 0,
        pinned: json['pinned'] == true,
      );

  final String id;
  final String title;
  final DateTime savedAt;
  final String imagePath;

  /// What the garments in this look cost together, kept with the fit so the
  /// shopper sees the price of the outfit they are admiring.
  final int valueCents;
  final bool pinned;

  SavedFit copyWith({bool? pinned}) => SavedFit(
        id: id,
        title: title,
        savedAt: savedAt,
        imagePath: imagePath,
        valueCents: valueCents,
        pinned: pinned ?? this.pinned,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'savedAt': savedAt.toUtc().toIso8601String(),
        'imagePath': imagePath,
        'valueCents': valueCents,
        'pinned': pinned,
      };
}

/// The shopper's saved fits, kept ONLY on this device.
///
/// A fit contains the shopper's own body, so it lives under the same promise
/// as the fitting-room photo: never uploaded, never synced, deletable in one
/// tap. Widget tests subclass this with an in-memory store because real file
/// I/O never completes inside fake-async test zones.
class SavedFitsStore {
  SavedFitsStore({Future<Directory> Function()? documentsDirectory})
      : _documentsDirectory =
            documentsDirectory ?? getApplicationDocumentsDirectory;

  static const _indexFileName = 'vton_saved_fits_v1.json';
  static const _folderName = 'saved_fits';
  static const maxFits = 30;

  final Future<Directory> Function() _documentsDirectory;

  Future<List<SavedFit>> load() async {
    try {
      final file = await _indexFile();
      if (!await file.exists()) return const [];
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is! List) return const [];
      final fits = decoded
          .whereType<Map>()
          .map((row) => SavedFit.fromJson(Map<String, dynamic>.from(row)))
          .where((fit) => fit.id.isNotEmpty && fit.imagePath.isNotEmpty)
          .toList()
        // Pinned looks lead, newest first within each group.
        ..sort((left, right) {
          if (left.pinned != right.pinned) return left.pinned ? -1 : 1;
          return right.savedAt.compareTo(left.savedAt);
        });
      return List.unmodifiable(fits);
    } catch (_) {
      return const [];
    }
  }

  Future<Uint8List?> readImage(SavedFit fit) async {
    try {
      final file = File(fit.imagePath);
      if (!await file.exists()) return null;
      final bytes = await file.readAsBytes();
      return bytes.isEmpty ? null : bytes;
    } catch (_) {
      return null;
    }
  }

  Future<List<SavedFit>> save({
    required List<int> imageBytes,
    required String title,
    int valueCents = 0,
    DateTime? savedAt,
  }) async {
    if (imageBytes.isEmpty) return load();
    final now = savedAt ?? DateTime.now();
    final id = 'fit-${now.microsecondsSinceEpoch}';
    final directory = await _fitsDirectory();
    await directory.create(recursive: true);
    final imageFile = File('${directory.path}${Platform.pathSeparator}$id.png');
    await imageFile.writeAsBytes(imageBytes, flush: true);

    final existing = await load();
    final fits = [
      SavedFit(
        id: id,
        title: title.trim().isEmpty ? 'Saved fit' : title.trim(),
        savedAt: now,
        imagePath: imageFile.path,
        valueCents: valueCents,
      ),
      ...existing,
    ];
    // The device is not a gallery: the oldest looks make way for new ones —
    // but a pinned look is one the shopper chose to keep, so it never ages
    // out to make room.
    final kept = <SavedFit>[];
    final dropped = <SavedFit>[];
    for (final fit in fits) {
      if (kept.length < maxFits || fit.pinned) {
        kept.add(fit);
      } else {
        dropped.add(fit);
      }
    }
    for (final gone in dropped) {
      await _deleteImage(gone);
    }
    await _writeIndex(kept);
    return kept;
  }

  /// Pins or unpins a look. A pinned fit sorts to the front and survives the
  /// cap that ages older looks out.
  Future<List<SavedFit>> setPinned(String id, bool pinned) async {
    final fits = await load();
    final updated = fits
        .map((fit) => fit.id == id ? fit.copyWith(pinned: pinned) : fit)
        .toList()
      ..sort((left, right) {
        if (left.pinned != right.pinned) return left.pinned ? -1 : 1;
        return right.savedAt.compareTo(left.savedAt);
      });
    await _writeIndex(updated);
    return List.unmodifiable(updated);
  }

  Future<List<SavedFit>> remove(String id) async {
    final fits = await load();
    final kept = fits.where((fit) => fit.id != id).toList(growable: false);
    for (final dropped in fits.where((fit) => fit.id == id)) {
      await _deleteImage(dropped);
    }
    await _writeIndex(kept);
    return kept;
  }

  Future<void> clear() async {
    for (final fit in await load()) {
      await _deleteImage(fit);
    }
    try {
      final file = await _indexFile();
      if (await file.exists()) await file.delete();
    } catch (_) {
      // An index that no longer exists is already cleared.
    }
  }

  Future<void> _writeIndex(List<SavedFit> fits) async {
    try {
      final file = await _indexFile();
      await file.parent.create(recursive: true);
      await file.writeAsString(
        jsonEncode(fits.map((fit) => fit.toJson()).toList()),
        flush: true,
      );
    } catch (_) {
      // Saving is best-effort; the shopper still has the look on screen.
    }
  }

  Future<void> _deleteImage(SavedFit fit) async {
    try {
      final file = File(fit.imagePath);
      if (await file.exists()) await file.delete();
    } catch (_) {
      // Already gone.
    }
  }

  Future<File> _indexFile() async {
    final directory = await _documentsDirectory();
    return File('${directory.path}${Platform.pathSeparator}$_indexFileName');
  }

  Future<Directory> _fitsDirectory() async {
    final directory = await _documentsDirectory();
    return Directory('${directory.path}${Platform.pathSeparator}$_folderName');
  }
}
