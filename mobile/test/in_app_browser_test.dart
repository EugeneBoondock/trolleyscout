import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/widgets/in_app_browser.dart';

void main() {
  test('the in-app browser accepts only hosted web links', () {
    expect(
        safeInAppBrowserUri('https://example.test/deal')?.host, 'example.test');
    expect(
        safeInAppBrowserUri('http://example.test/deal')?.host, 'example.test');
    expect(safeInAppBrowserUri('javascript:alert(1)'), isNull);
    expect(safeInAppBrowserUri('intent://scan'), isNull);
    expect(safeInAppBrowserUri('/relative'), isNull);
  });
}
