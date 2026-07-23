import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/tools_screen.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  testWidgets('keeps store comparison and removes shelf tools', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      home: Scaffold(body: ToolsScreen(api: _ToolsApi())),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('SHELF TOOLS'), findsNothing);
    expect(find.text('Which pack is really cheaper?'), findsNothing);
    expect(find.text('Compare a product across stores'), findsOneWidget);
    expect(find.text('Which shop is cheapest?'), findsOneWidget);
  });
}

class _ToolsApi extends Api {
  _ToolsApi() : super(baseUrl: 'https://example.test');

  @override
  Future<RetailerCatalog> retailers(
          {String query = '',
          String kind = 'all',
          bool summary = false}) async =>
      const RetailerCatalog(retailers: [], sourceKinds: []);
}
