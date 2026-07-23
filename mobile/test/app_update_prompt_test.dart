import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/app_update_prompt.dart';
import 'package:trolley_scout/theme.dart';

void main() {
  testWidgets('an available update offers both supported update paths',
      (tester) async {
    final service = _FakeUpdateService(
      offer: const AppUpdateOffer(
        availableVersionCode: 23,
        inAppUpdateAllowed: true,
      ),
    );

    await tester.pumpWidget(_app(service));
    await tester.pumpAndSettle();

    expect(find.text('A new Trolley Scout update is ready'), findsOneWidget);
    expect(_filledButton('Update in app'), findsOneWidget);
    expect(_outlinedButton('Open Play Store'), findsOneWidget);
  });

  testWidgets('update in app starts the Google Play update flow',
      (tester) async {
    final service = _FakeUpdateService(
      offer: const AppUpdateOffer(
        availableVersionCode: 23,
        inAppUpdateAllowed: true,
      ),
    );

    await tester.pumpWidget(_app(service));
    await tester.pumpAndSettle();
    await tester.tap(_filledButton('Update in app'));
    await tester.pumpAndSettle();

    expect(service.inAppUpdateCalls, 1);
  });

  testWidgets('the Play Store button opens the public listing', (tester) async {
    final service = _FakeUpdateService(
      offer: const AppUpdateOffer(
        availableVersionCode: 23,
        inAppUpdateAllowed: true,
      ),
    );

    await tester.pumpWidget(_app(service));
    await tester.pumpAndSettle();
    await tester.tap(_outlinedButton('Open Play Store'));
    await tester.pumpAndSettle();

    expect(service.playStoreCalls, 1);
  });

  testWidgets('no prompt is shown when Google Play reports no update',
      (tester) async {
    final service = _FakeUpdateService();

    await tester.pumpWidget(_app(service));
    await tester.pumpAndSettle();

    expect(find.text('A new Trolley Scout update is ready'), findsNothing);
    expect(find.text('Dashboard'), findsOneWidget);
  });

  testWidgets('an in-app failure keeps the Play Store recovery path visible',
      (tester) async {
    final service = _FakeUpdateService(
      offer: const AppUpdateOffer(
        availableVersionCode: 23,
        inAppUpdateAllowed: true,
      ),
      failInAppUpdate: true,
    );

    await tester.pumpWidget(_app(service));
    await tester.pumpAndSettle();
    await tester.tap(_filledButton('Update in app'));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'The in-app update could not start. Try Google Play instead.',
      ),
      findsOneWidget,
    );
    expect(_outlinedButton('Open Play Store'), findsOneWidget);
  });

  testWidgets('the update prompt fits a small dark screen at 200% text',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 640);
    addTearDown(tester.view.reset);
    final service = _FakeUpdateService(
      offer: const AppUpdateOffer(
        availableVersionCode: 23,
        inAppUpdateAllowed: true,
      ),
    );

    await tester.pumpWidget(_app(
      service,
      textScaler: const TextScaler.linear(2),
      themeMode: ThemeMode.dark,
    ));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('A new Trolley Scout update is ready'), findsOneWidget);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
  });
}

Widget _app(
  AppUpdateService service, {
  TextScaler textScaler = TextScaler.noScaling,
  ThemeMode themeMode = ThemeMode.light,
}) =>
    MaterialApp(
      theme: TS.lightTheme(),
      darkTheme: TS.darkTheme(),
      themeMode: themeMode,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: textScaler),
        child: child!,
      ),
      home: AppUpdatePromptHost(
        checkDelay: Duration.zero,
        service: service,
        child: const Scaffold(body: Center(child: Text('Dashboard'))),
      ),
    );

Finder _filledButton(String label) => find.ancestor(
      of: find.text(label),
      matching: find.byWidgetPredicate((widget) => widget is FilledButton),
    );

Finder _outlinedButton(String label) => find.ancestor(
      of: find.text(label),
      matching: find.byWidgetPredicate((widget) => widget is OutlinedButton),
    );

class _FakeUpdateService implements AppUpdateService {
  _FakeUpdateService({
    this.offer,
    this.failInAppUpdate = false,
  });

  final AppUpdateOffer? offer;
  final bool failInAppUpdate;
  int inAppUpdateCalls = 0;
  int playStoreCalls = 0;

  @override
  Future<AppUpdateOffer?> checkForUpdate() async => offer;

  @override
  Future<void> openPlayStore() async {
    playStoreCalls += 1;
  }

  @override
  Future<void> updateInApp() async {
    inAppUpdateCalls += 1;
    if (failInAppUpdate) throw StateError('update failed');
  }
}
