import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/payfast_checkout_html.dart';

void main() {
  test(
      'classic checkout builds an auto-submitting POST form with escaped fields',
      () {
    final html = buildPayFastRedirectHtml(
      'https://sandbox.payfast.co.za/eng/process',
      {'item_name': 'Scout & Save', 'signature': 'a"b'},
    );

    expect(html, contains('method="post"'));
    expect(
        html, contains('action="https://sandbox.payfast.co.za/eng/process"'));
    expect(html, contains('value="Scout &amp; Save"'));
    expect(html, contains('value="a&quot;b"'));
    expect(html, contains('document.getElementById("payfast-form").submit()'));
  });

  test('onsite checkout loads the supplied engine and payment id', () {
    final html = buildPayFastOnsiteHtml(
      'https://www.payfast.co.za/onsite/engine.js',
      'checkout-123',
    );

    expect(html, contains('src="https://www.payfast.co.za/onsite/engine.js"'));
    expect(html, contains('uuid: "checkout-123"'));
    expect(html, contains('TrolleyScout.postMessage'));
  });
}
