// Money written the way the shopper's own country writes it. Trolley Scout now
// reads deals well past South Africa, so a price we read in dollars has to
// print in dollars. Nothing here converts between currencies — we only label an
// amount with the currency it was already quoted in, never re-price it.
// Mirrors formatCountryMoney in src/views/ToolkitView.tsx on the web.

/// The currency PayFast settles in. Membership and advertising are charged in
/// rand wherever the shopper is standing, so those screens name this currency
/// instead of following the shopper's country.
const String kBillingCurrencyCode = 'ZAR';

/// A word-like symbol ("ZiG", "TSh", a bare currency code) needs air before the
/// number; a single-letter or glyph symbol ("R", "P", r"N$") is written tight
/// against it.
final RegExp _isWordLike = RegExp(r'[A-Za-z]{2,}$');

/// Symbol and thousands convention for the currencies we hold deals in.
/// Southern Africa groups with a space (R1 234.56), the dollar family with a
/// comma ($1,234.56). Country codes come from the server's registry, which
/// covers every ISO country, so anything missing here is handled gracefully by
/// [Currency.of] rather than guessed at.
const Map<String, ({String groupSeparator, String symbol})> _knownCurrencies = {
  'AOA': (groupSeparator: ' ', symbol: 'Kz'),
  'BWP': (groupSeparator: ' ', symbol: 'P'),
  'EUR': (groupSeparator: ' ', symbol: '€'),
  'GBP': (groupSeparator: ',', symbol: '£'),
  'LSL': (groupSeparator: ' ', symbol: 'M'),
  'MUR': (groupSeparator: ',', symbol: '₨'),
  'MWK': (groupSeparator: ',', symbol: 'MK'),
  'MZN': (groupSeparator: ' ', symbol: 'MT'),
  'NAD': (groupSeparator: ' ', symbol: r'N$'),
  'SZL': (groupSeparator: ' ', symbol: 'E'),
  'TZS': (groupSeparator: ',', symbol: 'TSh'),
  'USD': (groupSeparator: ',', symbol: r'$'),
  'ZAR': (groupSeparator: ' ', symbol: 'R'),
  'ZMW': (groupSeparator: ',', symbol: 'K'),
  'ZWG': (groupSeparator: ',', symbol: 'ZiG'),
};

/// How one currency writes an amount.
class Currency {
  const Currency({
    required this.code,
    required this.symbol,
    required this.groupSeparator,
  });

  /// Rand: the platform's home currency, and what billing is always in.
  static const Currency rand = Currency(
    code: kBillingCurrencyCode,
    symbol: 'R',
    groupSeparator: ' ',
  );

  /// The currency for an ISO code. An unrecognised code prints itself
  /// ("PLN 1234.56") and skips grouping — honest, and better than inventing a
  /// symbol or a thousands convention we do not actually know. A missing code
  /// falls back to rand, which is also the server's own default.
  factory Currency.of(String? currencyCode) {
    final code = (currencyCode ?? '').trim().toUpperCase();
    if (code.isEmpty) return rand;
    final known = _knownCurrencies[code];
    if (known == null) {
      return Currency(code: code, symbol: code, groupSeparator: '');
    }
    return Currency(
      code: code,
      symbol: known.symbol,
      groupSeparator: known.groupSeparator,
    );
  }

  final String code;

  /// What sits in front of an amount: 'R', r'$', or the code itself when we
  /// have no symbol for it.
  final String symbol;

  /// What separates thousands, empty when the convention is unknown to us.
  final String groupSeparator;

  /// "R1 234.56" — always two decimals. Prices, totals and savings.
  String format(int cents) => _prefixed(_amount(cents, alwaysCents: true));

  /// "R1 234", or "R1 234.50" when there are cents. For round figures like a
  /// rate card, which read better without a trailing ".00".
  String formatShort(int cents) => _prefixed(_amount(cents, alwaysCents: false));

  String _prefixed(String amount) {
    final isNegative = amount.startsWith('-');
    final gap = _isWordLike.hasMatch(symbol) ? ' ' : '';
    // Sign in front of the symbol ("-R12.00"), the way money is normally read.
    return '${isNegative ? '-' : ''}$symbol$gap'
        '${isNegative ? amount.substring(1) : amount}';
  }

  String _amount(int cents, {required bool alwaysCents}) {
    final value = cents.abs();
    final sign = cents < 0 ? '-' : '';
    final whole = _grouped('${value ~/ 100}');
    final remainder = value % 100;
    if (!alwaysCents && remainder == 0) return '$sign$whole';
    return '$sign$whole.${remainder.toString().padLeft(2, '0')}';
  }

  String _grouped(String digits) {
    if (groupSeparator.isEmpty || digits.length <= 3) return digits;
    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(groupSeparator);
      buffer.write(digits[i]);
    }
    return buffer.toString();
  }
}
