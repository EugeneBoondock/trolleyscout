import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:trolley_scout/widgets/guided_card_camera.dart';

void main() {
  test('card frame stays inside compact portrait safe areas', () {
    const viewport = Size(320, 640);
    const padding = EdgeInsets.only(top: 24, bottom: 20);
    final frame = cardFrameForViewport(viewport, padding);

    expect(frame.left, greaterThanOrEqualTo(18));
    expect(frame.right, lessThanOrEqualTo(viewport.width - 18));
    expect(frame.top, greaterThan(padding.top));
    expect(frame.bottom, lessThan(viewport.height - padding.bottom));
    expect(
      frame.width / frame.height,
      closeTo(loyaltyCardAspectRatio, 0.001),
    );
  });

  test('viewport frame maps through a cover crop into image pixels', () {
    const viewport = Size(400, 800);
    const image = Size(3000, 4000);
    const frame = Rect.fromLTWH(40, 260, 320, 202);
    final crop = mapViewportCropToImage(
      viewport: viewport,
      image: image,
      frame: frame,
    );

    expect(crop.left, closeTo(700, 0.01));
    expect(crop.top, closeTo(1300, 0.01));
    expect(crop.right, closeTo(2300, 0.01));
    expect(crop.bottom, closeTo(2310, 0.01));
  });

  testWidgets('guide clearly explains the automatic crop', (tester) async {
    const viewport = Size(390, 844);
    final frame = cardFrameForViewport(
      viewport,
      const EdgeInsets.only(top: 24, bottom: 20),
    );
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(
          size: viewport,
          padding: EdgeInsets.only(top: 24, bottom: 20),
        ),
        child: MaterialApp(
          home: Scaffold(
            backgroundColor: Colors.black,
            body: SizedBox(
              width: viewport.width,
              height: viewport.height,
              child: const GuidedCardGuideOverlay(
                viewport: viewport,
                frame: Rect.fromLTWH(24, 270, 342, 216),
                title: 'Front of loyalty card',
                instruction: 'Keep all four card edges inside the frame.',
              ),
            ),
          ),
        ),
      ),
    );

    expect(find.text('Front of loyalty card'), findsOneWidget);
    expect(
      find.text('Keep all four card edges inside the frame.'),
      findsOneWidget,
    );
    expect(
      find.text('Hold steady. The area outside the frame will be removed.'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('guided-card-frame')), findsOneWidget);
    expect(frame.width / frame.height, closeTo(loyaltyCardAspectRatio, 0.001));
  });
}
