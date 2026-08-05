import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:trolley_scout/data_saver_store.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    DataSaverStore.instance.resetForTest();
  });

  test('data saver loads, persists, and notifies', () async {
    var notifications = 0;
    void listener() => notifications += 1;
    DataSaverStore.instance.addListener(listener);
    addTearDown(() => DataSaverStore.instance.removeListener(listener));

    expect(await DataSaverStore.instance.load(), isFalse);
    await DataSaverStore.instance.setEnabled(true);

    expect(DataSaverStore.instance.enabled, isTrue);
    expect(
      (await SharedPreferences.getInstance())
          .getBool(DataSaverStore.storageKey),
      isTrue,
    );
    expect(notifications, greaterThanOrEqualTo(2));
  });
}
