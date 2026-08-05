import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/fitting_room_screen.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/vton_photo_store.dart';

// A valid 1x1 transparent PNG, so Image.memory can decode the stored photo.
final Uint8List _onePixelPng = Uint8List.fromList(const [
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, //
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, //
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, //
  0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00, //
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, //
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82, //
]);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('photo store save, load and delete round-trip on an injected directory',
      () async {
    final directory = await Directory.systemTemp.createTemp('vton_test');
    addTearDown(() => directory.delete(recursive: true));
    final store = VtonPhotoStore(documentsDirectory: () async => directory);

    expect(await store.load(), isNull);
    await store.save(const [1, 2, 3, 4]);
    expect(await store.load(), [1, 2, 3, 4]);
    await store.delete();
    expect(await store.load(), isNull);
    // Deleting again is harmless.
    await store.delete();
  });

  testWidgets('first run shows the three-step intro exactly once',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final store = _MemoryPhotoStore();

    await tester.pumpWidget(_wrap(_screen(store)));
    await tester.pumpAndSettle();

    expect(
        find.text('Try clothes on yourself, before you buy'), findsOneWidget);

    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('One full-body photo is all it needs'), findsWidgets);

    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    // The privacy promise is the last intro step.
    expect(find.text('Your photo never leaves your hands'), findsWidgets);
    expect(find.textContaining('stored ONLY on this phone'), findsWidgets);

    await tester.tap(find.text('Open the fitting room'));
    await tester.pumpAndSettle();
    expect(find.text('Take a photo'), findsOneWidget);

    // A second visit skips straight to the photo step.
    await tester.pumpWidget(_wrap(_screen(_MemoryPhotoStore())));
    await tester.pumpAndSettle();
    expect(find.text('Try clothes on yourself, before you buy'), findsNothing);
    expect(find.text('Take a photo'), findsOneWidget);
  });

  testWidgets('a 403 from the server swaps in the Scout plan upsell',
      (tester) async {
    SharedPreferences.setMockInitialValues({'vton_intro_seen_v1': true});
    final store = _MemoryPhotoStore(bytes: _onePixelPng);
    var upgraded = false;

    await tester.pumpWidget(_wrap(_screen(
      store,
      api: _FittingApi(
        error: const ApiException(
          'The fitting room is part of the Scout plan.',
          statusCode: 403,
        ),
      ),
      onUpgrade: () => upgraded = true,
    )));
    await tester.pumpAndSettle();

    expect(find.text('Try it on'), findsOneWidget);
    expect(find.text('Delete my photo'), findsOneWidget);

    await tester.tap(find.text('Try it on'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pumpAndSettle();

    expect(find.text('Try clothes on before you buy'), findsOneWidget);
    expect(find.text('See the Scout plan'), findsOneWidget);

    await tester.tap(find.text('See the Scout plan'));
    await tester.pumpAndSettle();
    expect(upgraded, isTrue);
  });

  testWidgets('deleting the photo asks first and returns to the capture step',
      (tester) async {
    SharedPreferences.setMockInitialValues({'vton_intro_seen_v1': true});
    final store = _MemoryPhotoStore(bytes: _onePixelPng);

    await tester.pumpWidget(_wrap(_screen(store)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Delete my photo'));
    await tester.pumpAndSettle();
    expect(find.textContaining('removes the only copy'), findsOneWidget);

    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();

    expect(store.bytes, isNull);
    expect(find.text('Take a photo'), findsOneWidget);
  });
}

Widget _wrap(Widget child) {
  return MaterialApp(
    theme: TS.lightTheme(),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(disableAnimations: true),
      child: child ?? const SizedBox.shrink(),
    ),
    home: child,
  );
}

Widget _screen(
  VtonPhotoStore store, {
  Api? api,
  VoidCallback? onUpgrade,
}) {
  return FittingRoomScreen(
    api: api ?? _FittingApi(),
    garmentImageUrls: const ['https://cdn.example.test/jeans.jpg'],
    garmentTitle: 'Slim fit denim jeans',
    onUpgrade: onUpgrade,
    photoStore: store,
  );
}

/// File I/O never completes inside the widget-test fake-async zone, so the
/// screen gets this in-memory stand-in instead.
class _MemoryPhotoStore extends VtonPhotoStore {
  _MemoryPhotoStore({this.bytes});

  Uint8List? bytes;

  @override
  Future<Uint8List?> load() async => bytes;

  @override
  Future<void> save(List<int> value) async {
    bytes = Uint8List.fromList(value);
  }

  @override
  Future<void> delete() async {
    bytes = null;
  }
}

class _FittingApi extends Api {
  _FittingApi({this.error}) : super(baseUrl: 'https://example.test');

  final ApiException? error;

  @override
  Future<TryOnResult> virtualTryOn({
    required List<int> personImageBytes,
    required List<String> garmentImageUrls,
  }) async {
    final failure = error;
    if (failure != null) throw failure;
    return TryOnResult(
      image: 'data:image/png;base64,${String.fromCharCodes(personImageBytes)}',
      quota: const TryOnQuota(limit: 50, remaining: 49, used: 1),
    );
  }
}
