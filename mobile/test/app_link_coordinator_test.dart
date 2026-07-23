import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/app_link_coordinator.dart';

void main() {
  test('maps trusted app links to supported destinations and filters', () {
    final custom = parseAppLink(
      Uri.parse('trolleyscout://deals?q=milk&retailer=checkers'),
    );
    final website = parseAppLink(
      Uri.parse('https://trolleyscout.co.za/near-me'),
    );

    expect(custom?.destination, 'deals');
    expect(custom?.query, 'milk');
    expect(custom?.retailerId, 'checkers');
    expect(website?.destination, 'near');
  });

  test('rejects unknown hosts and unsupported destinations', () {
    expect(parseAppLink(Uri.parse('https://attacker.test/deals')), isNull);
    expect(
      parseAppLink(Uri.parse('https://trolleyscout.co.za/admin')),
      isNull,
    );
  });

  test('coordinator keeps a valid link until the shell consumes it', () {
    final coordinator = AppLinkCoordinator.instance;
    coordinator.takePending();
    coordinator.publish(Uri.parse('trolleyscout://basket?source=test'));

    expect(coordinator.takePending()?.destination, 'basket');
    expect(coordinator.takePending(), isNull);
  });
}
