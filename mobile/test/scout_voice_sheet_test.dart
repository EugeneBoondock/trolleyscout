import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/api.dart';
import 'package:trolley_scout/screens/scout_chat_screen.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/scout_voice_sheet.dart';

void main() {
  testWidgets(
      'typed fallback asks Mr Scout and keeps the spoken answer visible',
      (tester) async {
    String? asked;
    List<ScoutChatTurn>? sentHistory;
    await tester.pumpWidget(
      MaterialApp(
        theme: TS.lightTheme(),
        home: Scaffold(
          body: ScoutVoiceSheet(
            api: Api(baseUrl: 'https://example.test'),
            surface: 'showcase',
            ask: (question, history) async {
              asked = question;
              sentHistory = history;
              return const ScoutVoiceReply(
                answer: 'Yes. This television supports Netflix.',
                audioBytes: [],
                mediaType: 'audio/mpeg',
                model: 's2.1-pro-free',
                sources: [
                  ScoutVoiceSource(
                    title: 'Manufacturer specifications',
                    url: 'https://manufacturer.test/tv',
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );

    await tester.enterText(
      find.byKey(const ValueKey('scout-voice-question')),
      'Does it have Netflix?',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('scout-voice-send')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(asked, 'Does it have Netflix?');
    expect(sentHistory, isEmpty);
    expect(find.text('Yes. This television supports Netflix.'), findsOneWidget);
    expect(find.text('Manufacturer specifications'), findsOneWidget);
    expect(find.byKey(const ValueKey('scout-voice-answer')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('voice sheet uses readable surfaces in light and dark themes',
      (tester) async {
    for (final mode in [ThemeMode.light, ThemeMode.dark]) {
      await tester.pumpWidget(
        MaterialApp(
          theme: TS.lightTheme(),
          darkTheme: TS.darkTheme(),
          themeMode: mode,
          home: Scaffold(
            body: ScoutVoiceSheet(
              api: Api(baseUrl: 'https://example.test'),
              surface: 'scout',
              ask: (_, __) async => const ScoutVoiceReply(
                answer: 'Answer',
                audioBytes: [],
                mediaType: 'audio/mpeg',
                model: 's2.1-pro-free',
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      final field = tester.widget<TextField>(
        find.byKey(const ValueKey('scout-voice-question')),
      );
      final fieldContext = tester.element(
        find.byKey(const ValueKey('scout-voice-question')),
      );
      expect(field.style?.color, Theme.of(fieldContext).colorScheme.onSurface);
      expect(find.text('Talk to Mr Scout'), findsOneWidget);
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('Free members see the Scout upgrade gate before provider use',
      (tester) async {
    var upgraded = false;
    await tester.pumpWidget(
      MaterialApp(
        theme: TS.lightTheme(),
        home: Scaffold(
          body: ScoutChatScreen(
            api: Api(baseUrl: 'https://example.test'),
            account: account(planId: 'free', planName: 'Free'),
            onUpgrade: () => upgraded = true,
          ),
        ),
      ),
    );

    await tester.tap(find.byKey(const ValueKey('mr-scout-voice-button')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.text('Talk with Mr Scout'), findsOneWidget);
    expect(find.textContaining('Voice conversations are included'),
        findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('mr-scout-voice-upgrade')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    expect(upgraded, isTrue);
  });

  testWidgets('Scout members can open voice chat from Mr Scout',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: TS.lightTheme(),
        home: Scaffold(
          body: ScoutChatScreen(
            api: Api(baseUrl: 'https://example.test'),
            account: account(planId: 'scout', planName: 'Scout'),
          ),
        ),
      ),
    );

    await tester.tap(find.byKey(const ValueKey('mr-scout-voice-button')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.byKey(const ValueKey('scout-voice-sheet')), findsOneWidget);
    expect(find.text('Talk to Mr Scout'), findsOneWidget);
  });
}

MemberAccount account({required String planId, required String planName}) {
  return MemberAccount(
    id: 'member-1',
    email: 'member@example.test',
    displayName: 'Member',
    initials: 'ME',
    planId: planId,
    planName: planName,
    planStatus: 'active',
    role: 'member',
    propertiesAccess: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  );
}
