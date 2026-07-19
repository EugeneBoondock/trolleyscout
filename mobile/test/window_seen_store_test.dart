import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/window_seen_store.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('seen deal IDs survive a new store instance', () async {
    final firstStore = WindowSeenStore();

    await firstStore.markSeen('deal-1');

    expect(await WindowSeenStore().loadIds(), {'deal-1'});
  });

  test('a new store waits for an in-flight mark from the previous screen',
      () async {
    final previousScreenStore = WindowSeenStore();

    final pendingMark = previousScreenStore.markSeen('deal-1');
    final restoredIds = await WindowSeenStore().loadIds();
    await pendingMark;

    expect(restoredIds, {'deal-1'});
  });

  test('rapid marks are serialized, de-duplicated, and bounded', () async {
    final store = WindowSeenStore(maxEntries: 3);

    await Future.wait([
      store.markSeen('deal-1'),
      store.markSeen('deal-2'),
      store.markSeen('deal-3'),
    ]);
    await store.markSeen('deal-2');
    await store.markSeen('deal-4');

    expect(await store.load(), ['deal-4', 'deal-2', 'deal-3']);
  });

  test('rapid marks share one pending persistence flush', () async {
    final store = WindowSeenStore();

    final first = store.markSeen('deal-1');
    final second = store.markSeen('deal-2');
    final third = store.markSeen('deal-3');

    expect(identical(first, second), isTrue);
    expect(identical(second, third), isTrue);
    await first;
    expect(await store.load(), ['deal-3', 'deal-2', 'deal-1']);
  });

  test('blank IDs are ignored', () async {
    final store = WindowSeenStore();

    await store.markSeen('   ');

    expect(await store.load(), isEmpty);
  });

  test('malformed stored history is treated as empty', () async {
    SharedPreferences.setMockInitialValues({
      WindowSeenStore.preferenceKey: 'not-a-list',
    });

    expect(await WindowSeenStore().load(), isEmpty);
  });

  test('deal keys fall back to the product URL when the API ID is empty', () {
    const deal = ScrollDeal(
      id: '',
      title: 'Example deal',
      retailerName: 'Example Store',
      sourceLabel: 'Example',
      source: 'example',
      productUrl: 'https://example.test/product-1',
    );

    expect(windowSeenKey(deal), 'url:https://example.test/product-1');
  });
}
