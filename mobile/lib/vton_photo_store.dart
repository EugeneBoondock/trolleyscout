import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';

/// The shopper's fitting-room photo, kept ONLY on this device.
///
/// The photo never syncs, never uploads to storage, and never leaves the app
/// documents directory — the try-on request streams it from memory and the
/// server holds it only for the life of that request. Deleting it here removes
/// the only copy that exists.
///
/// Widget tests subclass this with an in-memory store: real file I/O never
/// completes inside fake-async test zones.
class VtonPhotoStore {
  VtonPhotoStore({Future<Directory> Function()? documentsDirectory})
      : _documentsDirectory =
            documentsDirectory ?? getApplicationDocumentsDirectory;

  static const _fileName = 'vton_photo_v1.bin';
  final Future<Directory> Function() _documentsDirectory;

  Future<Uint8List?> load() async {
    try {
      final file = await _file();
      if (!await file.exists()) return null;
      final bytes = await file.readAsBytes();
      return bytes.isEmpty ? null : bytes;
    } catch (_) {
      return null;
    }
  }

  Future<void> save(List<int> bytes) async {
    if (bytes.isEmpty) return;
    final file = await _file();
    await file.parent.create(recursive: true);
    await file.writeAsBytes(bytes, flush: true);
  }

  Future<void> delete() async {
    try {
      final file = await _file();
      if (await file.exists()) await file.delete();
    } catch (_) {
      // A photo that no longer exists is already deleted.
    }
  }

  Future<File> _file() async {
    final directory = await _documentsDirectory();
    return File('${directory.path}${Platform.pathSeparator}$_fileName');
  }
}
