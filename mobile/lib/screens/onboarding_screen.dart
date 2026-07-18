import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../theme.dart';
import 'auth_screen.dart';

/// The first thing a shopper sees on a fresh install: a short, warm intro to
/// what Trolley Scout does, leading straight into sign-up or log-in. Nothing
/// else in the app is reachable until they have an account — the whole shell is
/// mounted only once [AppController.session] is authenticated.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, required this.controller});

  final AppController controller;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _pageController = PageController();
  int _page = 0;
  bool _showAuth = false;
  String _authIntent = 'signup';

  static const _slides = <_Slide>[
    _Slide(
      icon: Icons.local_offer_outlined,
      title: 'Stretch every rand',
      body: "This week's real grocery specials from South Africa's big stores, "
          'checked against the official pages — never a forwarded screenshot.',
    ),
    _Slide(
      icon: Icons.volunteer_activism_outlined,
      title: "Claim what's yours",
      body: 'Money help for SASSA grants, free basic electricity, and rates '
          'rebates. The essentials stay free, forever.',
    ),
    _Slide(
      icon: Icons.window_outlined,
      title: 'Window shopping',
      body: 'Drift through deals one swipe at a time, with easy in-store music. '
          'Save the ones you love and we learn your taste.',
    ),
    _Slide(
      icon: Icons.apartment_outlined,
      title: 'And a place to call home',
      body: 'Household members can search homes to buy or rent across the '
          'country with Properties Scout.',
    ),
  ];

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _openAuth(String intent) => setState(() {
        widget.controller.notice = null;
        _showAuth = true;
        _authIntent = intent;
      });

  void _next() {
    _pageController.nextPage(
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_showAuth) {
      return Scaffold(
        backgroundColor: TS.bgOf(context),
        body: SafeArea(
          child: AuthScreen(
            controller: widget.controller,
            initialIntent: _authIntent,
            onBack: () => setState(() => _showAuth = false),
            // Nothing to do: authenticating flips the session, and the root
            // shell rebuilds to show the app in this widget's place.
            onAuthenticated: () {},
          ),
        ),
      );
    }

    final isLast = _page == _slides.length - 1;
    return Scaffold(
      backgroundColor: TS.bgOf(context),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 12, 0),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.asset('assets/brand-mark.png',
                        width: 36, height: 36),
                  ),
                  const SizedBox(width: 8),
                  const Text('TROLLEY SCOUT', style: TS.display),
                  const Spacer(),
                  TextButton(
                    onPressed: () => _openAuth('login'),
                    child: const Text('Log in'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                onPageChanged: (index) => setState(() => _page = index),
                itemCount: _slides.length,
                itemBuilder: (context, index) => _SlideView(slide: _slides[index]),
              ),
            ),
            _Dots(count: _slides.length, index: _page),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: Column(
                children: [
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: TS.yellow,
                        foregroundColor: TS.ink,
                        shape: const RoundedRectangleBorder(),
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      onPressed: isLast ? () => _openAuth('signup') : _next,
                      child: Text(
                        isLast ? 'Create free account' : 'Next',
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  TextButton(
                    onPressed: () => _openAuth(isLast ? 'login' : 'signup'),
                    child: Text(
                      isLast
                          ? 'I already have an account · Log in'
                          : 'Skip — create an account',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Slide {
  const _Slide({required this.icon, required this.title, required this.body});

  final IconData icon;
  final String title;
  final String body;
}

class _SlideView extends StatelessWidget {
  const _SlideView({required this.slide});

  final _Slide slide;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(
              color: TS.yellow,
              border: Border.all(color: TS.lineOf(context), width: 3),
            ),
            child: Icon(slide.icon, size: 46, color: TS.ink),
          ),
          const SizedBox(height: 28),
          Text(
            slide.title,
            textAlign: TextAlign.center,
            style: Theme.of(context)
                .textTheme
                .headlineMedium
                ?.merge(TS.display),
          ),
          const SizedBox(height: 12),
          Text(
            slide.body,
            textAlign: TextAlign.center,
            style: TextStyle(color: TS.mutedOf(context), fontSize: 15, height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.index});

  final int count;
  final int index;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < count; i++)
          AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            margin: const EdgeInsets.symmetric(horizontal: 4),
            width: i == index ? 22 : 8,
            height: 8,
            decoration: BoxDecoration(
              color: i == index ? TS.red : TS.lineSoftOf(context),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
      ],
    );
  }
}
