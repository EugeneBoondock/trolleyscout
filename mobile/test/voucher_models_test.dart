import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/voucher_models.dart';

void main() {
  test('parses public and account voucher fields', () {
    final voucher = Voucher.fromJson({
      'id': 'voucher-1',
      'retailerId': 'shoprite',
      'externalId': 'winter-25',
      'title': 'Winter groceries',
      'benefitText': 'Save R25',
      'evidenceText': 'Official voucher.',
      'voucherKind': 'public_code',
      'redemptionMode': 'code',
      'redemptionUrl': 'https://shoprite.test/shop',
      'sourceUrl': 'https://shoprite.test/vouchers',
      'publicReusable': true,
      'code': 'SAVE25',
      'accountRequired': false,
      'claimed': true,
      'capturedAt': '2026-07-16T10:00:00.000Z',
      'createdAt': '2026-07-16T10:00:00.000Z',
      'updatedAt': '2026-07-16T10:00:00.000Z',
      'lastSeenAt': '2026-07-16T10:00:00.000Z',
      'expiresAt': '2026-07-31T21:59:59.999Z',
      'status': 'active',
      'validTo': '2026-07-31',
      'imageUrl': 'https://shoprite.test/voucher.jpg',
    });

    expect(voucher.code, 'SAVE25');
    expect(voucher.claimed, isTrue);
    expect(voucher.publicReusable, isTrue);
    expect(voucher.imageUrl, 'https://shoprite.test/voucher.jpg');
    expect(voucher.validTo, '2026-07-31');
  });
}
