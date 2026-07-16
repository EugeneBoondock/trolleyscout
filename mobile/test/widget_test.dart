import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/main.dart';

void main() {
  testWidgets('boots to the home screen with the money-on-the-table slip', (tester) async {
    await tester.pumpWidget(const TrolleyScoutApp());
    expect(find.text('TROLLEY SCOUT'), findsOneWidget);
    expect(find.textContaining('MONEY ON THE TABLE'), findsOneWidget);
    // Bottom nav has the four sections.
    expect(find.text('Near me'), findsOneWidget);
    expect(find.text('Deals'), findsOneWidget);
  });
}
