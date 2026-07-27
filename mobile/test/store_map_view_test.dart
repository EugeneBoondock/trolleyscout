import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/widgets/store_map_view.dart';

void main() {
  test('builds a global turn-by-turn navigation link', () {
    expect(
      storeNavigationUri(-33.9249, 18.4241).toString(),
      'https://www.google.com/maps/dir/?api=1&destination=-33.9249%2C18.4241&travelmode=driving',
    );
  });
}
