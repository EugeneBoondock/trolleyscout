import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Writes the rendered share card into the platform temp directory and hands
/// back the file the native share sheet attaches. The OS reclaims this
/// directory on its own, so shared cards never pile up in a shopper's storage.
Future<XFile> writeShareImage(Uint8List bytes, String fileName) async {
  final directory = await getTemporaryDirectory();
  final file = File('${directory.path}/$fileName');
  await file.writeAsBytes(bytes, flush: true);
  return XFile(file.path, mimeType: 'image/png', name: fileName);
}
