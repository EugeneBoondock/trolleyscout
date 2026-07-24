import 'dart:typed_data';

import 'package:share_plus/share_plus.dart';

/// The browser has no temp directory, so the rendered card travels as bytes —
/// share_plus hands those straight to the Web Share API (falling back to a
/// download when the browser cannot share files).
Future<XFile> writeShareImage(Uint8List bytes, String fileName) async =>
    XFile.fromData(bytes, mimeType: 'image/png', name: fileName);
