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

String _text(Object? value) => value is String ? value : '';

String? _optionalText(Object? value) =>
    value is String && value.isNotEmpty ? value : null;
