// Tags a link out to a shop so the shop can see the visit came from here.
// Mirrors withReferralSource in src/services/outboundLink.ts, so a shopper
// leaving from the app and one leaving from the website arrive the same way.

const String kReferralSource = 'trolleyscout.co.za';

const String _referralParam = 'utm_source';

// Our own pages. Tagging a link back to ourselves would credit us with sending
// ourselves traffic, which tells nobody anything.
const Set<String> _ownHosts = {
  'trolleyscout.co.za',
  'www.trolleyscout.co.za',
  'org.trolleyscout.co.za',
};

/// Adds our referral tag to an outbound shop link.
///
/// Anything that cannot be tagged is handed back exactly as it came, so a link
/// that would have worked is never broken by this. The tag is a courtesy; the
/// shopper reaching the shop is the point.
String? withReferralSource(String? value) {
  final raw = value?.trim();
  if (raw == null || raw.isEmpty) return null;

  final uri = Uri.tryParse(raw);
  if (uri == null || (uri.scheme != 'https' && uri.scheme != 'http')) {
    return raw;
  }
  if (uri.host.isEmpty || _ownHosts.contains(uri.host.toLowerCase())) {
    return raw;
  }

  // A retailer's own campaign tag is left exactly as it is. Those links are how
  // they measure their own spend, and overwriting one would quietly take credit
  // for a visit somebody else paid for.
  if (uri.queryParameters.containsKey(_referralParam)) return raw;

  return uri.replace(
    queryParameters: {...uri.queryParameters, _referralParam: kReferralSource},
  ).toString();
}
