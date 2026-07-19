import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api_models.dart';
import 'package:trolley_scout/payfast_checkout_html.dart';
import 'package:trolley_scout/payfast_checkout_native.dart';

void main() {
  test('checkout wrapper uses the production HTTPS origin', () {
    expect(payFastCheckoutBaseUrl.scheme, 'https');
    expect(payFastCheckoutBaseUrl.host, 'trolleyscout.co.za');
  });

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

  test('native checkout prefers the classic redirect document', () {
    final html = buildNativePayFastCheckoutDocument(
      const SubscriptionCheckout(
        message: 'Checkout ready.',
        planId: 'scout',
        billingCycle: 'monthly',
        status: 'checkout_required',
        redirectUrl: 'https://www.payfast.co.za/eng/process',
        redirectFields: {'signature': 'signed'},
        engineUrl: 'https://www.payfast.co.za/onsite/engine.js',
        onsiteUuid: 'onsite-123',
      ),
    );

    expect(html, contains('id="payfast-form"'));
    expect(html, isNot(contains('payfast_do_onsite_payment')));
  });
}
