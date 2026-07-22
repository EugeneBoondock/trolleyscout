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
      title: 'Stretch your budget',
      body: "This week's real grocery specials from stores in your country, "
          'checked against the official pages — never a forwarded screenshot.',
    ),
    _Slide(
      icon: Icons.window_outlined,
      title: 'Window shopping',
      body:
          'Drift through deals one swipe at a time, with easy in-store music. '
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
                    child: Image.asset('assets/scout-logo.png',
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
                itemBuilder: (context, index) =>
                    _SlideView(slide: _slides[index]),
              ),
            ),
            _OnboardingProgress(step: _page + 1, total: _slides.length),
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
            style:
                Theme.of(context).textTheme.headlineMedium?.merge(TS.display),
          ),
          const SizedBox(height: 12),
          Text(
            slide.body,
            textAlign: TextAlign.center,
            style: TextStyle(
                color: TS.mutedOf(context), fontSize: 15, height: 1.4),
          ),
        ],
      ),
    );
  }
}

/// Onboarding momentum bar. Goal-gradient effect: the very first slide already
/// reads as progress (1 of N, never 0%), so the flow feels like it's moving from
/// the first tap. The label warms up to "You're ready to start" on the last slide.
class _OnboardingProgress extends StatelessWidget {
  const _OnboardingProgress({required this.step, required this.total});

  final int step;
  final int total;

  @override
  Widget build(BuildContext context) {
    final fraction = total == 0 ? 0.0 : (step / total).clamp(0.0, 1.0);
    final isLast = step >= total;
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                isLast ? "You're ready to start" : 'Getting started',
                style: TextStyle(
                    color: TS.mutedOf(context),
                    fontWeight: FontWeight.w800,
                    fontSize: 12),
              ),
              Text(
                '$step of $total',
                style: TextStyle(
                    color: TS.faintOf(context),
                    fontWeight: FontWeight.w700,
                    fontSize: 12),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: fraction),
              duration: reduceMotion
                  ? Duration.zero
                  : const Duration(milliseconds: 340),
              curve: Curves.easeOutCubic,
              builder: (context, value, _) => LinearProgressIndicator(
                value: value,
                minHeight: 8,
                backgroundColor: TS.lineSoftOf(context),
                valueColor: const AlwaysStoppedAnimation<Color>(TS.red),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
