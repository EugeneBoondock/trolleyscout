class Voucher {
  const Voucher({
    required this.id,
    required this.retailerId,
    required this.externalId,
    required this.title,
    required this.benefitText,
    required this.evidenceText,
    required this.voucherKind,
    required this.redemptionMode,
    required this.redemptionUrl,
    required this.sourceUrl,
    required this.publicReusable,
    required this.accountRequired,
    required this.claimed,
    required this.capturedAt,
    required this.createdAt,
    required this.updatedAt,
    required this.lastSeenAt,
    required this.expiresAt,
    required this.status,
    this.code,
    this.productId,
    this.productTitle,
    this.imageUrl,
    this.termsText,
    this.validFrom,
    this.validTo,
  });

  final String id;
  final String retailerId;
  final String externalId;
  final String title;
  final String benefitText;
  final String evidenceText;
  final String voucherKind;
  final String redemptionMode;
  final String redemptionUrl;
  final String sourceUrl;
  final bool publicReusable;
  final bool accountRequired;
  final bool claimed;
  final String capturedAt;
  final String createdAt;
  final String updatedAt;
  final String lastSeenAt;
  final String expiresAt;
  final String status;
  final String? code;
  final String? productId;
  final String? productTitle;
  final String? imageUrl;
  final String? termsText;
  final String? validFrom;
  final String? validTo;

  Voucher copyWith({bool? claimed}) => Voucher(
        id: id,
        retailerId: retailerId,
        externalId: externalId,
        title: title,
        benefitText: benefitText,
        evidenceText: evidenceText,
        voucherKind: voucherKind,
        redemptionMode: redemptionMode,
        redemptionUrl: redemptionUrl,
        sourceUrl: sourceUrl,
        publicReusable: publicReusable,
        accountRequired: accountRequired,
        claimed: claimed ?? this.claimed,
        capturedAt: capturedAt,
        createdAt: createdAt,
        updatedAt: updatedAt,
        lastSeenAt: lastSeenAt,
        expiresAt: expiresAt,
        status: status,
        code: code,
        productId: productId,
        productTitle: productTitle,
        imageUrl: imageUrl,
        termsText: termsText,
        validFrom: validFrom,
        validTo: validTo,
      );

  factory Voucher.fromJson(Map<String, dynamic> json) => Voucher(
        id: _text(json['id']),
        retailerId: _text(json['retailerId']),
        externalId: _text(json['externalId']),
        title: _text(json['title']),
        benefitText: _text(json['benefitText']),
        evidenceText: _text(json['evidenceText']),
        voucherKind: _text(json['voucherKind']),
        redemptionMode: _text(json['redemptionMode']),
        redemptionUrl: _text(json['redemptionUrl']),
        sourceUrl: _text(json['sourceUrl']),
        publicReusable: json['publicReusable'] == true,
        accountRequired: json['accountRequired'] == true,
        claimed: json['claimed'] == true,
        capturedAt: _text(json['capturedAt']),
        createdAt: _text(json['createdAt']),
        updatedAt: _text(json['updatedAt']),
        lastSeenAt: _text(json['lastSeenAt']),
        expiresAt: _text(json['expiresAt']),
        status: _text(json['status']),
        code: _optionalText(json['code']),
        productId: _optionalText(json['productId']),
        productTitle: _optionalText(json['productTitle']),
        imageUrl: _optionalText(json['imageUrl']),
        termsText: _optionalText(json['termsText']),
        validFrom: _optionalText(json['validFrom']),
        validTo: _optionalText(json['validTo']),
      );
}

/// A code a shopper pastes into a promo-code box at checkout.
///
/// Distinct from a [Voucher], which is a loyalty price or a clip coupon: those
/// are scanned at the till or clipped on the product page, never typed. We
/// cannot test a code at a retailer's checkout, so nothing here is ever
/// labelled verified; the counts below are what other shoppers reported.
class VoucherCode {
  const VoucherCode({
    required this.id,
    required this.retailerId,
    required this.code,
    this.countryCode = 'ZA',
    required this.benefitText,
    required this.workedCount,
    required this.failedCount,
    this.moderationStatus = 'unconfirmed',
    required this.source,
    required this.createdAt,
    this.minimumSpendText,
    this.termsText,
    this.validTo,
    this.lastWorkedAt,
    this.yourVote,
  });

  final String id;
  final String retailerId;
  final String code;
  final String countryCode;
  final String benefitText;
  final int workedCount;
  final int failedCount;
  final String moderationStatus;

  /// 'member', or 'affiliate:<network>' for a licensed feed.
  final String source;
  final String createdAt;
  final String? minimumSpendText;
  final String? termsText;
  final String? validTo;
  final String? lastWorkedAt;

  /// This shopper's own verdict: 'worked', 'failed', or absent.
  final String? yourVote;

  bool get isFromAffiliate => source.startsWith('affiliate:');

  /// How much to trust the code, said plainly rather than as a badge.
  String get confidenceText {
    if (workedCount == 0 && failedCount == 0) {
      return 'Just shared, nobody has tried it yet';
    }
    if (workedCount == 0) {
      return 'Did not work for $failedCount '
          '${failedCount == 1 ? 'shopper' : 'shoppers'}';
    }
    final suffix = failedCount > 0 ? ', failed for $failedCount' : '';
    return 'Worked for $workedCount '
        '${workedCount == 1 ? 'shopper' : 'shoppers'}$suffix';
  }

  VoucherCode copyWith(
          {int? workedCount, int? failedCount, String? yourVote}) =>
      VoucherCode(
        id: id,
        retailerId: retailerId,
        code: code,
        countryCode: countryCode,
        benefitText: benefitText,
        workedCount: workedCount ?? this.workedCount,
        failedCount: failedCount ?? this.failedCount,
        moderationStatus: moderationStatus,
        source: source,
        createdAt: createdAt,
        minimumSpendText: minimumSpendText,
        termsText: termsText,
        validTo: validTo,
        lastWorkedAt: lastWorkedAt,
        yourVote: yourVote ?? this.yourVote,
      );

  factory VoucherCode.fromJson(Map<String, dynamic> json) => VoucherCode(
        id: _text(json['id']),
        retailerId: _text(json['retailerId']),
        code: _text(json['code']),
        countryCode: _text(json['countryCode']),
        benefitText: _text(json['benefitText']),
        workedCount: _count(json['workedCount']),
        failedCount: _count(json['failedCount']),
        moderationStatus:
            json['moderationStatus'] == 'approved' ? 'approved' : 'unconfirmed',
        source: _text(json['source']),
        createdAt: _text(json['createdAt']),
        minimumSpendText: _optionalText(json['minimumSpendText']),
        termsText: _optionalText(json['termsText']),
        validTo: _optionalText(json['validTo']),
        lastWorkedAt: _optionalText(json['lastWorkedAt']),
        yourVote: _optionalText(json['yourVote']),
      );
}

int _count(Object? value) => value is num ? value.toInt() : 0;

String _text(Object? value) => value is String ? value : '';

String? _optionalText(Object? value) =>
    value is String && value.isNotEmpty ? value : null;
