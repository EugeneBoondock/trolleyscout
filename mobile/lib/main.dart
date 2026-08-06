import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollDirection;
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'app_link_coordinator.dart';
import 'app_controller.dart';
import 'app_update_prompt.dart';
import 'biometric_gate.dart';
import 'deal_alert_background.dart';
import 'deal_alert_scheduler.dart';
import 'notification_prefs_store.dart';
import 'shopper_calculator.dart';
import 'store_visit_assistant.dart';
import 'screens/advertise_screen.dart';
import 'screens/auth_screen.dart';
import 'screens/about_screen.dart';
import 'screens/admin_screen.dart';
import 'screens/basket_screen.dart';
import 'screens/clothing_screen.dart';
import 'screens/coverage_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/deals_screen.dart';
import 'screens/near_me_screen.dart';
import 'screens/offers_screen.dart';
import 'screens/loyalty_wallet_screen.dart';
import 'screens/onboarding_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/properties_screen.dart';
import 'screens/rules_screen.dart';
import 'screens/saved_deals_screen.dart';
import 'screens/saved_sources_screen.dart';
import 'screens/scanner_screen.dart';
import 'screens/scout_chat_screen.dart';
import 'screens/store_sessions_screen.dart';
import 'screens/stores_screen.dart';
import 'screens/window_shopping_screen.dart';
import 'screens/subscription_screen.dart';
import 'screens/tools_screen.dart';
import 'screens/vouchers_screen.dart';
import 'theme.dart';
import 'ux.dart';
import 'widgets/in_app_alert_banner.dart';
import 'widgets/app_drawer.dart';
import 'widgets/common.dart';
import 'widgets/scout_avatar_view.dart';
import 'widgets/scout_launch_intro.dart';
import 'widgets/scout_mascot.dart';
import 'widgets/scout_mark.dart';
import 'widgets/shopper_calculator.dart';
import 'widgets/watch_bell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const TrolleyScoutApp());
  unawaited(AppLinkCoordinator.instance.initialize());
  unawaited(_initializeBackgroundServices());
}

Future<void> _initializeBackgroundServices() async {
  try {
    await initializeDealAlertBackground();
    final alertsEnabled = await NotificationPrefsStore().loadOptIn();
    await DealAlertScheduler().setEnabled(alertsEnabled);
  } catch (_) {
    // A background-service failure must never hold the first frame.
  }
}

class TrolleyScoutApp extends StatefulWidget {
  const TrolleyScoutApp({
    super.key,
    this.api,
    this.appUpdateService,
    this.launchIntroDuration = const Duration(milliseconds: 1100),
  });

  final Api? api;
  final AppUpdateService? appUpdateService;
  final Duration launchIntroDuration;

  @override
  State<TrolleyScoutApp> createState() => _TrolleyScoutAppState();
}

class _TrolleyScoutAppState extends State<TrolleyScoutApp> {
  late final AppController _controller;
  late final AppUpdateService _appUpdateService;

  @override
  void initState() {
    super.initState();
    _controller = AppController(widget.api ?? Api());
    _appUpdateService = widget.appUpdateService ?? GooglePlayAppUpdateService();
    _controller.restore();
    UxSettings.instance.load();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) => MaterialApp(
        title: 'Trolley Scout',
        debugShowCheckedModeBanner: false,
        theme: TS.lightTheme(),
        darkTheme: TS.darkTheme(),
        themeMode: _controller.themeMode,
        // The alert card sits above every screen, so an alert that lands
        // while the shopper is deep in a catalogue still reaches them.
        home: InAppAlertBanner(
          child: AppUpdatePromptHost(
            checkDelay: widget.launchIntroDuration,
            service: _appUpdateService,
            child: RootShell(
              controller: _controller,
              launchIntroDuration: widget.launchIntroDuration,
            ),
          ),
        ),
      ),
    );
  }
}

class RootShell extends StatefulWidget {
  const RootShell({
    super.key,
    required this.controller,
    required this.launchIntroDuration,
  });

  final AppController controller;
  final Duration launchIntroDuration;

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell>
    with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  static const _guestAccessKey = 'guest_explore_enabled_v1';

  /// How far the bottom bar is revealed. Reading down folds it away so the
  /// deal being read owns the screen; the first flick back up returns it.
  late final AnimationController _navReveal;

  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  AppDestination _destination = AppDestination.dashboard;
  final List<AppDestination> _navHistory = [];
  int _primaryIndex = 0;
  String? _authIntent;
  String? _dealsRetailerId;
  String? _dealsQuery;
  String? _dealsCatalogueId;
  bool? _bioEnabled;
  bool _unlocked = false;
  late bool _introComplete;
  bool _guideVisible = false;
  Timer? _guideTimer;
  final Set<AppDestination> _shownGuideTips = {};
  late bool _wasAuthenticated;
  AppLinkRequest? _pendingAppLink;
  bool _guestAccessReady = false;
  bool _guestAccessEnabled = false;
  late final StoreVisitAssistant _storeVisitAssistant;
  Timer? _storeVisitTimer;
  Timer? _storeVisitInitialTimer;
  Timer? _storeVisitResumeTimer;
  bool _storeVisitPromptOpen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _navReveal = AnimationController(
      duration: const Duration(milliseconds: 180),
      value: 1,
      vsync: this,
    );
    _storeVisitAssistant = StoreVisitAssistant(api: widget.controller.api);
    _introComplete = widget.launchIntroDuration == Duration.zero;
    _wasAuthenticated = widget.controller.session.isAuthenticated;
    widget.controller.addListener(_handleSessionChanged);
    AppLinkCoordinator.instance.addListener(_handleAppLink);
    _restoreGuestAccess();
    ShopperCalculatorStore.instance.load();
    StoreVisitPreferences.instance.load().then((_) {
      if (!mounted) return;
      _storeVisitTimer = Timer.periodic(
        const Duration(minutes: 2),
        (_) => _checkStorePresence(),
      );
      _storeVisitInitialTimer =
          Timer(const Duration(seconds: 3), _checkStorePresence);
    });
    BiometricPrefs.isEnabled().then((enabled) {
      if (mounted) setState(() => _bioEnabled = enabled);
    });
    WidgetsBinding.instance.addPostFrameCallback(
      (_) {
        _scheduleGuide(AppDestination.dashboard);
        _handleAppLink();
      },
    );
  }

  Future<void> _restoreGuestAccess() async {
    var enabled = false;
    try {
      final preferences = await SharedPreferences.getInstance();
      enabled = preferences.getBool(_guestAccessKey) == true;
    } catch (_) {
      // A storage failure should still leave onboarding usable.
    }
    if (!mounted) return;
    setState(() {
      _guestAccessEnabled = enabled;
      _guestAccessReady = true;
    });
  }

  void _exploreFirst() {
    setState(() => _guestAccessEnabled = true);
    unawaited(_persistGuestAccess());
  }

  Future<void> _persistGuestAccess() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(_guestAccessKey, true);
    } catch (_) {
      // The shopper can keep browsing in this session if storage is full.
    }
  }

  void _handleAppLink() {
    final request = AppLinkCoordinator.instance.takePending();
    if (request == null || !mounted) return;
    if (!widget.controller.session.isAuthenticated) {
      _pendingAppLink = request;
      return;
    }
    _openAppLink(request);
  }

  void _openAppLink(AppLinkRequest request) {
    final destination = switch (request.destination) {
      'deals' => AppDestination.deals,
      'clothing' => AppDestination.clothing,
      'chat' => AppDestination.chat,
      'near' => AppDestination.near,
      'stores' => AppDestination.stores,
      'tools' => AppDestination.tools,
      'scroll' => AppDestination.scroll,
      'vouchers' => AppDestination.vouchers,
      'coverage' => AppDestination.coverage,
      'loyaltyWallet' => AppDestination.loyaltyWallet,
      'savedDeals' => AppDestination.savedDeals,
      'basket' => AppDestination.basket,
      'subscription' => AppDestination.subscription,
      'profile' => AppDestination.profile,
      'advertise' => AppDestination.advertise,
      'about' => AppDestination.about,
      _ => AppDestination.dashboard,
    };
    if (destination == AppDestination.deals) {
      _dealsCatalogueId = request.catalogueId;
      _dealsQuery = request.query;
      _dealsRetailerId = request.retailerId;
    }
    _selectDestination(destination);
  }

  void _handleSessionChanged() {
    final authenticated = widget.controller.session.isAuthenticated;
    if (authenticated == _wasAuthenticated) return;
    _wasAuthenticated = authenticated;
    if (!mounted) return;
    setState(() {
      _authIntent = null;
      _navHistory.clear();
      _destination = AppDestination.dashboard;
      _primaryIndex = 0;
      if (!authenticated) _unlocked = false;
    });
    if (authenticated) {
      _scheduleGuide(AppDestination.dashboard);
      final pending = _pendingAppLink;
      _pendingAppLink = null;
      if (pending != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _openAppLink(pending);
        });
      }
    }
  }

  @override
  void dispose() {
    _guideTimer?.cancel();
    _storeVisitTimer?.cancel();
    _storeVisitInitialTimer?.cancel();
    _storeVisitResumeTimer?.cancel();
    _navReveal.dispose();
    WidgetsBinding.instance.removeObserver(this);
    AppLinkCoordinator.instance.removeListener(_handleAppLink);
    widget.controller.removeListener(_handleSessionChanged);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _storeVisitResumeTimer?.cancel();
      _storeVisitResumeTimer =
          Timer(const Duration(seconds: 1), _checkStorePresence);
    }
  }

  Future<void> _checkStorePresence() async {
    if (!mounted || _storeVisitPromptOpen) return;
    final event = await _storeVisitAssistant.check();
    if (!mounted || event == null) return;
    if (event.type == StorePresenceEventType.entered) {
      if (event.deals.isEmpty && event.catalogues.isEmpty) return;
      await _showInStoreSpecials(event);
    } else {
      await _showReceiptReminder(event);
    }
  }

  Future<void> _showInStoreSpecials(StorePresenceEvent event) async {
    _storeVisitPromptOpen = true;
    final offerCount = event.deals.length + event.catalogues.length;
    final openOffers = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: TS.bgOf(context),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(TS.controlRadius),
      ),
      builder: (context) => SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const ScoutMascot(
                  label: 'Mr Scout found in-store specials',
                  pose: ScoutMascotPose.search,
                  size: 92,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Looks like you’re at ${event.store.name}',
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.merge(TS.display),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Mr Scout found $offerCount current ${offerCount == 1 ? 'offer' : 'offers'} for this store. Availability can vary by branch.',
                        style: TextStyle(color: TS.mutedOf(context)),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Dismiss in-store specials',
                  onPressed: () => Navigator.pop(context, false),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            if (event.deals.isNotEmpty) ...[
              const SizedBox(height: 12),
              for (final deal in event.deals.take(3))
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.local_offer_outlined,
                      color: TS.redOf(context)),
                  title: Text(deal.title),
                  subtitle: Text(
                    [deal.priceText, deal.savingText]
                        .whereType<String>()
                        .where((text) => text.isNotEmpty)
                        .join(' · '),
                  ),
                ),
            ],
            if (event.catalogues.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                '${event.catalogues.length} current ${event.catalogues.length == 1 ? 'catalogue' : 'catalogues'} available',
                style: TS.eyebrowOf(context),
              ),
            ],
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: () => Navigator.pop(context, true),
              icon: const Icon(Icons.storefront_outlined),
              label: Text('See ${event.store.name} offers'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Maybe later'),
            ),
          ],
        ),
      ),
    );
    _storeVisitPromptOpen = false;
    if (openOffers == true && mounted) {
      _viewStoreDeals(event.retailerId, event.store.name);
    }
  }

  Future<void> _showReceiptReminder(StorePresenceEvent event) async {
    _storeVisitPromptOpen = true;
    final addReceipt = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            const ScoutMascot(
              label: 'Mr Scout receipt reminder',
              pose: ScoutMascotPose.point,
              size: 70,
            ),
            const SizedBox(width: 8),
            Expanded(child: Text('Finished at ${event.store.name}?')),
          ],
        ),
        content: const Text(
          'Add your receipt to Loyalty. Your saved retailer and item notes make Marketplace and Window Shopping more personal, and the photo stays on your device.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Not now'),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.pop(context, true),
            icon: const Icon(Icons.receipt_long_outlined),
            label: const Text('Add receipt'),
          ),
        ],
      ),
    );
    _storeVisitPromptOpen = false;
    if (addReceipt == true && mounted) {
      _selectDestination(AppDestination.loyaltyWallet);
    }
  }

  // Near-me store card → open the marketplace pre-filtered to that store.
  void _viewStoreDeals(String? retailerId, String storeName) {
    setState(() {
      _dealsRetailerId = retailerId?.isNotEmpty == true ? retailerId : null;
      _dealsQuery = retailerId?.isNotEmpty == true ? null : storeName;
    });
    _selectDestination(AppDestination.deals);
  }

  // The marketplace sits directly after the dashboard. It is the thing the app
  // is for, and it was fourth along behind two ways of browsing shops.
  static const _primaryDestinations = [
    AppDestination.dashboard,
    AppDestination.deals,
    AppDestination.chat,
    AppDestination.stores,
    AppDestination.scroll,
  ];

  void _showAuth(String intent) => setState(() => _authIntent = intent);

  /// Folds the bottom bar away while the shopper reads down a page and brings
  /// it back the moment they scroll up, so a phone screen spends its height on
  /// deals rather than on navigation. Horizontal rails (the deal carousels)
  /// are ignored: swiping sideways through cards is not reading down a page.
  bool _handleUserScroll(UserScrollNotification notification) {
    if (notification.metrics.axis != Axis.vertical) return false;
    switch (notification.direction) {
      case ScrollDirection.reverse:
        _navReveal.reverse();
      case ScrollDirection.forward:
        _navReveal.forward();
      case ScrollDirection.idle:
        break;
    }
    return false;
  }

  void _selectDestination(AppDestination destination) {
    // A new page starts at the top, so the bar comes back with it.
    _navReveal.forward();
    // Close the drawer directly through the Scaffold rather than a Navigator
    // pop: a pop is intercepted by the root PopScope, which would reset the
    // freshly selected destination back to the dashboard.
    final scaffold = _scaffoldKey.currentState;
    if (scaffold?.isDrawerOpen ?? false) scaffold!.closeDrawer();
    if (destination.requiresAuth &&
        !widget.controller.session.isAuthenticated) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text('Log in or sign up to open ${destination.label}.'),
          action: SnackBarAction(
            label: 'Log in',
            onPressed: () => _showAuth('login'),
          ),
        ));
      return;
    }
    final primaryIndex = _primaryDestinations.indexOf(destination);
    setState(() {
      if (destination != _destination) {
        _navHistory
          ..remove(_destination)
          ..add(_destination);
        if (_navHistory.length > 8) _navHistory.removeAt(0);
      }
      _authIntent = null;
      _destination = destination;
      if (primaryIndex >= 0) _primaryIndex = primaryIndex;
    });
    _scheduleGuide(destination);
  }

  void _scheduleGuide(AppDestination destination) {
    _guideTimer?.cancel();
    if (widget.controller.restoring ||
        !widget.controller.session.isAuthenticated) {
      return;
    }
    final tip = _tipFor(destination);
    if (tip == null || _shownGuideTips.contains(destination)) {
      if (mounted && _guideVisible) setState(() => _guideVisible = false);
      return;
    }

    _shownGuideTips.add(destination);
    if (mounted && _guideVisible) setState(() => _guideVisible = false);
    _guideTimer = Timer(const Duration(milliseconds: 650), () {
      if (mounted && _destination == destination && _authIntent == null) {
        setState(() => _guideVisible = true);
      }
    });
  }

  void _returnToDashboard() {
    setState(() {
      _authIntent = null;
      _navHistory.clear();
      _destination = AppDestination.dashboard;
      _primaryIndex = 0;
    });
  }

  Future<void> _confirmAndSignOut() async {
    final confirmed = await confirmAction(
      context,
      title: 'Sign out?',
      message: 'You’ll need your email and password to sign in again.',
      confirmLabel: 'Sign out',
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    await widget.controller.signOut();
    if (mounted) _returnToDashboard();
  }

  _ScoutTip? _tipFor(AppDestination destination) => switch (destination) {
        AppDestination.dashboard => const _ScoutTip(
            'Welcome back',
            'Your saved deals, basket, nearby stores, and alerts are all within reach from here.',
            ScoutMascotPose.wave,
          ),
        AppDestination.deals => const _ScoutTip(
            'A quicker deal search',
            'Open Advanced to narrow deals by retailer, source, images, and savings.',
            ScoutMascotPose.search,
          ),
        AppDestination.chat => const _ScoutTip(
            'Ask Mr Scout',
            'Describe a product, budget, store, or catalogue and Mr Scout will return verified shopping cards.',
            ScoutMascotPose.search,
          ),
        AppDestination.near => const _ScoutTip(
            'Keep it local',
            'Share your location for nearby stores, then tighten the radius for closer results.',
            ScoutMascotPose.point,
          ),
        AppDestination.properties => const _ScoutTip(
            'Search your suburb first',
            'Begin with your suburb and a tight radius. Widen it only when you want more options.',
            ScoutMascotPose.search,
          ),
        AppDestination.scroll => const _ScoutTip(
            'Browse, save, then decide',
            'Swipe through the window, save anything interesting, or send it straight to Saved deals.',
            ScoutMascotPose.point,
          ),
        AppDestination.stores => const _ScoutTip(
            'Open a store card',
            'Each store has a curated page for its current deals and catalogues.',
            ScoutMascotPose.point,
          ),
        AppDestination.tools => const _ScoutTip(
            'Compare like for like',
            'Choose your stores first, then search one product across every selected retailer.',
            ScoutMascotPose.search,
          ),
        _ => null,
      };

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([
        widget.controller,
        ShopperCalculatorStore.instance,
      ]),
      builder: (context, _) {
        final session = widget.controller.session;
        if (!_introComplete) {
          return ScoutLaunchIntro(
            duration: widget.launchIntroDuration,
            onComplete: () {
              if (mounted) setState(() => _introComplete = true);
            },
          );
        }
        // Restore the session and the shopper's guest choice before deciding
        // whether onboarding or the app shell belongs on screen.
        if (widget.controller.restoring || !_guestAccessReady) {
          return Scaffold(
            backgroundColor: TS.bgOf(context),
            body: const Center(
              child: AnimatedScoutMark(motion: ScoutMarkMotion.spin, size: 48),
            ),
          );
        }
        if (!session.isAuthenticated && !_guestAccessEnabled) {
          return OnboardingScreen(
            controller: widget.controller,
            onExplore: _exploreFirst,
          );
        }
        // Biometric unlock (opt-in from Profile): ask for a fingerprint on
        // launch before revealing the signed-in app.
        if (_bioEnabled == null) {
          return Scaffold(
            backgroundColor: TS.bgOf(context),
            body: const Center(
              child: AnimatedScoutMark(motion: ScoutMarkMotion.spin, size: 48),
            ),
          );
        }
        if (session.isAuthenticated && _bioEnabled! && !_unlocked) {
          return BiometricGate(
            onUnlocked: () => setState(() => _unlocked = true),
            onSignOut: () async {
              await widget.controller.signOut();
              if (mounted) {
                setState(() {
                  _unlocked = false;
                  _navHistory.clear();
                  _destination = AppDestination.dashboard;
                  _primaryIndex = 0;
                });
              }
            },
          );
        }
        final compact = MediaQuery.sizeOf(context).width < 430;
        final phoneWidth = MediaQuery.sizeOf(context).width;
        final extraCompactNav = phoneWidth < 360;
        final compactNav = phoneWidth < 400;
        final largeNavText = MediaQuery.textScalerOf(context).scale(1) > 1.3;
        // At a big text setting the label's own height drives the bar, so the
        // icon has to give way or the bar grows back.
        final navIconSize = largeNavText
            ? 20.0
            : extraCompactNav
                ? 21.0
                : compactNav
                    ? 22.0
                    : 24.0;
        final navLabelSize = extraCompactNav
            ? 7.5
            : compactNav
                ? 8.0
                : 9.0;
        final requestedTextScale = MediaQuery.textScalerOf(context).scale(1);
        final navTextScale =
            min(requestedTextScale, extraCompactNav ? 1.05 : 1.2);
        final useNavigationRail = MediaQuery.sizeOf(context).width >= 840;
        final largeText = MediaQuery.textScalerOf(context).scale(1) > 1.3;
        final guideTip = _tipFor(_destination);
        final atNavigationRoot =
            _authIntent == null && _destination == AppDestination.dashboard;
        return PopScope(
          canPop: atNavigationRoot,
          onPopInvokedWithResult: (didPop, _) {
            if (didPop) return;
            // Back mirrors the on-screen affordances: close the auth overlay
            // first, then step back through visited tabs, then Dashboard.
            if (_authIntent != null) {
              setState(() => _authIntent = null);
            } else if (_navHistory.isNotEmpty) {
              final previous = _navHistory.removeLast();
              setState(() {
                _destination = previous;
                final primaryIndex = _primaryDestinations.indexOf(previous);
                if (primaryIndex >= 0) _primaryIndex = primaryIndex;
              });
            } else {
              _returnToDashboard();
            }
          },
          child: Scaffold(
            key: _scaffoldKey,
            floatingActionButton:
                _authIntent == null && ShopperCalculatorStore.instance.enabled
                    ? ShopperCalculatorButton(
                        store: ShopperCalculatorStore.instance,
                      )
                    : null,
            floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
            appBar: AppBar(
              leading: Builder(
                builder: (context) => IconButton(
                  tooltip: 'Open navigation menu',
                  onPressed: () => Scaffold.of(context).openDrawer(),
                  icon: const Icon(Icons.menu),
                ),
              ),
              // Centred, like a crest. Left-aligned it read as one more
              // button in the hamburger's row rather than the app's mark.
              centerTitle: true,
              titleSpacing: 4,
              // The bar grows to carry the crest: a 64px mark in a 56px bar
              // would clip its ribbon.
              toolbarHeight: 76,
              title: const AnimatedScoutMark.flat(
                key: ValueKey('navbar-scout-mark'),
                motion: ScoutMarkMotion.scout,
                // Crest-sized and tile-less, like the mockup: the mark is the
                // masthead, not an icon that wandered into the middle.
                size: 64,
              ),
              actions: [
                if (!session.isAuthenticated) ...[
                  IconButton(
                    tooltip: Theme.of(context).brightness == Brightness.light
                        ? 'Use dark theme'
                        : 'Use light theme',
                    onPressed: () => widget.controller
                        .toggleTheme(Theme.of(context).brightness),
                    icon: Icon(
                      Theme.of(context).brightness == Brightness.light
                          ? Icons.dark_mode_outlined
                          : Icons.light_mode_outlined,
                    ),
                  ),
                  if (compact)
                    PopupMenuButton<String>(
                      tooltip: 'Account options',
                      icon: const Icon(Icons.person_add_alt_1_outlined),
                      onSelected: _showAuth,
                      itemBuilder: (context) => const [
                        PopupMenuItem(value: 'login', child: Text('Log in')),
                        PopupMenuItem(value: 'signup', child: Text('Sign up')),
                      ],
                    )
                  else ...[
                    TextButton(
                        onPressed: () => _showAuth('login'),
                        child: const Text('Log in')),
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilledButton(
                        onPressed: () => _showAuth('signup'),
                        child: const Text('Sign up'),
                      ),
                    ),
                  ],
                ] else ...[
                  // The shopper's own tile, and everything personal behind
                  // it: settings, theme, alerts. Three separate buttons in
                  // the bar was chrome competing with the crest.
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: PopupMenuButton<String>(
                      tooltip: 'Your menu',
                      offset: const Offset(0, 52),
                      onSelected: (choice) {
                        switch (choice) {
                          case 'settings':
                            _selectDestination(AppDestination.profile);
                          case 'theme':
                            widget.controller
                                .toggleTheme(Theme.of(context).brightness);
                          case 'alerts':
                            showWatchesSheet(context, widget.controller);
                        }
                      },
                      itemBuilder: (context) {
                        final light =
                            Theme.of(context).brightness == Brightness.light;
                        return [
                          const PopupMenuItem(
                            value: 'settings',
                            child: ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: Icon(Icons.settings_outlined),
                              title: Text('Settings'),
                            ),
                          ),
                          PopupMenuItem(
                            value: 'theme',
                            child: ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: Icon(light
                                  ? Icons.dark_mode_outlined
                                  : Icons.light_mode_outlined),
                              title:
                                  Text(light ? 'Dark mode' : 'Light mode'),
                            ),
                          ),
                          const PopupMenuItem(
                            value: 'alerts',
                            child: ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: Icon(Icons.notifications_outlined),
                              title: Text('Notifications'),
                            ),
                          ),
                        ];
                      },
                      child: SizedBox.square(
                        dimension: 48,
                        child: Center(
                          child: ScoutAvatarView(
                            initials: session.account?.initials ?? '?',
                            size: 34,
                            borderWidth: 1.5,
                            showShadow: false,
                          ),
                        ),
                      ),
                    ),
                  ),
                  if (!compact && !largeText)
                    IconButton(
                      tooltip: 'Sign out',
                      onPressed:
                          widget.controller.busy ? null : _confirmAndSignOut,
                      icon: const Icon(Icons.logout),
                    ),
                ],
              ],
              // No rule under the bar. A 3px line across the top cut the mark
              // off from the page it belongs to; without it the header and
              // the screen read as one surface.
              shape: null,
            ),
            drawer: AppMenuDrawer(
              destination: _destination,
              session: session,
              onSelect: _selectDestination,
            ),
            // Tab and drawer switches cross-fade with a whisper of lift, so
            // navigation feels physical. Honours the system reduced-motion
            // setting via the zero-duration branch.
            body: NotificationListener<UserScrollNotification>(
              onNotification: _handleUserScroll,
              child: Row(
                children: [
                  if (useNavigationRail && _authIntent == null)
                    _PrimaryNavigationRail(
                      selectedIndex: _primaryIndex,
                      onDestinationSelected: (index) =>
                          _selectDestination(_primaryDestinations[index]),
                    ),
                  Expanded(
                    child: Column(
                      children: [
                        if (session.isOffline)
                          Semantics(
                            liveRegion: true,
                            child: Container(
                              width: double.infinity,
                              color: TS.yellow,
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 16, vertical: 8),
                              child: const Row(
                                children: [
                                  Icon(Icons.cloud_off_outlined,
                                      size: 20, color: TS.ink),
                                  SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      'Offline. Saved content is available; live actions will retry when you reconnect.',
                                      style: TextStyle(
                                        color: TS.ink,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        Expanded(
                          child: Stack(
                            children: [
                              Positioned.fill(
                                child: AnimatedSwitcher(
                                  duration:
                                      MediaQuery.of(context).disableAnimations
                                          ? Duration.zero
                                          : const Duration(milliseconds: 220),
                                  switchInCurve: Curves.easeOutCubic,
                                  switchOutCurve: Curves.easeInCubic,
                                  transitionBuilder: (child, animation) =>
                                      FadeTransition(
                                    opacity: animation,
                                    child: SlideTransition(
                                      position: Tween<Offset>(
                                        begin: const Offset(0, 0.012),
                                        end: Offset.zero,
                                      ).animate(animation),
                                      child: child,
                                    ),
                                  ),
                                  child: KeyedSubtree(
                                    key: ValueKey(
                                        _authIntent ?? _destination.name),
                                    child: _authIntent == null
                                        ? _screenFor(_destination)
                                        : AuthScreen(
                                            controller: widget.controller,
                                            initialIntent: _authIntent!,
                                            onBack: () => setState(
                                                () => _authIntent = null),
                                            onAuthenticated: () => setState(() {
                                              _authIntent = null;
                                              _destination =
                                                  AppDestination.dashboard;
                                              _primaryIndex = 0;
                                            }),
                                          ),
                                  ),
                                ),
                              ),
                              if (_guideVisible && guideTip != null)
                                Positioned(
                                  left: 12,
                                  right: 12,
                                  bottom:
                                      ShopperCalculatorStore.instance.enabled
                                          ? 82
                                          : 12,
                                  child: Align(
                                    alignment: Alignment.bottomRight,
                                    child: ScoutGuideCard(
                                      message: guideTip.message,
                                      onDismiss: () =>
                                          setState(() => _guideVisible = false),
                                      pose: guideTip.pose,
                                      title: guideTip.title,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            bottomNavigationBar: _authIntent != null || useNavigationRail
                ? null
                : SizeTransition(
                    key: const Key('bottom-nav-reveal'),
                    axisAlignment: -1,
                    sizeFactor: CurvedAnimation(
                      curve: Curves.easeOutCubic,
                      parent: _navReveal,
                      reverseCurve: Curves.easeInCubic,
                    ),
                    // Edge to edge, flat, one hairline on top. The bar used
                    // to float as a rounded card with side margins, a full
                    // border and a 16px shadow, which is what made it read as
                    // a big slab rather than a strip.
                    child: SafeArea(
                      top: false,
                      minimum: EdgeInsets.zero,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: TS.surfaceOf(context),
                          border: Border(
                            top: BorderSide(
                              color: TS.lineSoftOf(context),
                              width: 1,
                            ),
                          ),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.zero,
                          child: MediaQuery(
                            data: MediaQuery.of(context).copyWith(
                              textScaler: TextScaler.linear(navTextScale),
                            ),
                            child: Theme(
                              data: Theme.of(context).copyWith(
                                navigationBarTheme: NavigationBarThemeData(
                                  labelTextStyle: WidgetStatePropertyAll(
                                    TextStyle(
                                      color: TS.inkOf(context),
                                      fontSize: navLabelSize,
                                      fontWeight: FontWeight.w800,
                                      height: 1,
                                    ),
                                  ),
                                ),
                              ),
                              child: NavigationBar(
                                // A short, quiet bar. The icon and label above
                                // shrink first so the row's own intrinsic
                                // height stays under these numbers; drop these
                                // without dropping those and the labels win
                                // and the bar grows back.
                                // 48 is the floor, not a preference: below it
                                // the destinations stop meeting Android's
                                // minimum tap target and the bar gets harder
                                // to hit. The bar looks smaller because the
                                // chrome around it is gone, not because the
                                // touch area shrank.
                                height: largeText ? 58 : 48,
                                backgroundColor: TS.surfaceOf(context),
                                elevation: 0,
                                indicatorColor: Colors.transparent,
                                // Icons only, which is Facebook's whole
                                // trick: their bar is not shorter than 48,
                                // it just carries nothing but glyphs. The
                                // label row was a third of our bar's height;
                                // names live on in tooltips and semantics.
                                labelBehavior:
                                    NavigationDestinationLabelBehavior
                                        .alwaysHide,
                                selectedIndex: _primaryIndex,
                                onDestinationSelected: (index) =>
                                    _selectDestination(
                                        _primaryDestinations[index]),
                                destinations: [
                                  NavigationDestination(
                                    icon: Icon(Icons.home_outlined,
                                        size: navIconSize),
                                    selectedIcon: _SelectedNavIcon(
                                      icon: Icons.home_rounded,
                                      compact: compactNav,
                                      iconSize: navIconSize,
                                    ),
                                    label: 'Home',
                                  ),
                                  NavigationDestination(
                                    icon: Icon(Icons.local_offer_outlined,
                                        size: navIconSize),
                                    selectedIcon: _SelectedNavIcon(
                                      icon: Icons.local_offer,
                                      compact: compactNav,
                                      iconSize: navIconSize,
                                    ),
                                    label: 'Marketplace',
                                  ),
                                  NavigationDestination(
                                    icon: AnimatedScoutMark(
                                      motion: ScoutMarkMotion.scout,
                                      size: navIconSize + 5,
                                    ),
                                    selectedIcon: AnimatedScoutMark(
                                      motion: ScoutMarkMotion.scout,
                                      size: navIconSize + 7,
                                    ),
                                    label: 'Mr Scout',
                                  ),
                                  NavigationDestination(
                                    icon: Icon(Icons.storefront_outlined,
                                        size: navIconSize),
                                    selectedIcon: _SelectedNavIcon(
                                      icon: Icons.storefront,
                                      compact: compactNav,
                                      iconSize: navIconSize,
                                    ),
                                    label: 'Stores',
                                  ),
                                  NavigationDestination(
                                    icon: Icon(Icons.window_outlined,
                                        size: navIconSize),
                                    selectedIcon: _SelectedNavIcon(
                                      icon: Icons.window,
                                      compact: compactNav,
                                      iconSize: navIconSize,
                                    ),
                                    label: 'Window',
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
          ),
        );
      },
    );
  }

  /// Scout and above may build outfits; admins always can.
  bool get _canBuildOutfits {
    final account = widget.controller.session.account;
    if (account == null) return false;
    if (account.isAdmin) return true;
    return const {'scout', 'household', 'organization', 'developers'}
        .contains(account.planId);
  }

  Widget _screenFor(AppDestination destination) {
    final api = widget.controller.api;
    return switch (destination) {
      AppDestination.near => NearMeScreen(
          api: api,
          onViewStoreDeals: _viewStoreDeals,
          isAuthenticated: widget.controller.session.isAuthenticated,
          isAdmin: widget.controller.session.account?.isAdmin == true,
          onWantsAuth: () => _showAuth('login'),
        ),
      AppDestination.deals => DealsScreen(
          api: api,
          isAuthenticated: widget.controller.session.isAuthenticated,
          onWatchesChanged: widget.controller.refreshWatches,
          onWantsAuth: () => _showAuth('login'),
          initialRetailerId: _dealsRetailerId,
          initialQuery: _dealsQuery,
          initialCatalogueId: _dealsCatalogueId,
        ),
      AppDestination.clothing => ClothingScreen(
          api: api,
          onUpgrade: () => _selectDestination(AppDestination.subscription),
          // An outfit renders once per garment, so building one is a paid
          // perk rather than something a free allowance can carry.
          canBuildOutfits: _canBuildOutfits,
        ),
      AppDestination.chat => ScoutChatScreen(
          api: api,
          account: widget.controller.session.account,
          onUpgrade: () => _selectDestination(AppDestination.subscription),
        ),
      AppDestination.tools => ToolsScreen(api: api),
      AppDestination.scroll => WindowShoppingScreen(api: api),
      AppDestination.properties => PropertiesScreen(
          api: api,
          account: widget.controller.session.account,
          isAuthenticated: widget.controller.session.isAuthenticated,
          onWantsAuth: () => _showAuth('login'),
          onUpgrade: () => _selectDestination(AppDestination.subscription),
        ),
      AppDestination.dashboard => DashboardScreen(
          api: api,
          session: widget.controller.session,
          onNavigate: _selectDestination,
        ),
      AppDestination.stores => StoresScreen(
          api: api,
          isAuthenticated: widget.controller.session.isAuthenticated,
          isAdmin: widget.controller.session.account?.isAdmin == true,
        ),
      AppDestination.vouchers => VouchersScreen(
          api: api,
          countryName:
              widget.controller.session.account?.countryName ?? 'South Africa',
          isAuthenticated: widget.controller.session.isAuthenticated,
          onRequireAuth: () => _showAuth('login'),
        ),
      AppDestination.coverage => CoverageScreen(api: api),
      AppDestination.loyaltyWallet => const LoyaltyWalletScreen(),
      AppDestination.savedDeals => SavedDealsScreen(
          api: api,
          onFindDeals: () => _selectDestination(AppDestination.deals),
        ),
      AppDestination.basket => BasketScreen(api: api),
      AppDestination.storeSessions => const StoreSessionsScreen(),
      AppDestination.savedSources => SavedSourcesScreen(
          api: api,
          onBrowseStores: () => _selectDestination(AppDestination.stores),
        ),
      AppDestination.offers => OffersScreen(
          api: api,
          canDelete: widget.controller.session.account?.isAdmin == true,
        ),
      AppDestination.scanner => ScannerScreen(api: api),
      AppDestination.advertise => AdvertiseScreen(api: api),
      AppDestination.subscription => SubscriptionScreen(api: api),
      AppDestination.profile => ProfileScreen(controller: widget.controller),
      AppDestination.about => AboutScreen(
          onNavigate: _selectDestination,
          api: api,
          account: widget.controller.session.account,
        ),
      AppDestination.rules => const RulesScreen(),
      AppDestination.admin => AdminScreen(api: api),
    };
  }
}

class _SelectedNavIcon extends StatelessWidget {
  const _SelectedNavIcon({
    required this.icon,
    required this.compact,
    required this.iconSize,
  });

  final IconData icon;
  final bool compact;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: TS.yellow,
        borderRadius: BorderRadius.circular(999),
      ),
      child: SizedBox(
        width: compact ? 48 : 64,
        height: compact ? 28 : 32,
        child: Icon(icon, color: TS.ink, size: iconSize),
      ),
    );
  }
}

class _PrimaryNavigationRail extends StatelessWidget {
  const _PrimaryNavigationRail({
    required this.selectedIndex,
    required this.onDestinationSelected,
  });

  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          color: TS.surfaceOf(context),
          border: Border(
            right: BorderSide(color: TS.lineSoftOf(context)),
          ),
        ),
        child: NavigationRail(
          backgroundColor: TS.surfaceOf(context),
          groupAlignment: -0.65,
          indicatorColor: TS.yellow,
          labelType: NavigationRailLabelType.all,
          minWidth: 88,
          selectedIconTheme: const IconThemeData(color: TS.ink),
          selectedIndex: selectedIndex,
          onDestinationSelected: onDestinationSelected,
          destinations: const [
            NavigationRailDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home_rounded),
              label: Text('Home'),
            ),
            NavigationRailDestination(
              icon: Icon(Icons.local_offer_outlined),
              selectedIcon: Icon(Icons.local_offer),
              label: Text('Marketplace'),
            ),
            NavigationRailDestination(
              icon: AnimatedScoutMark(
                motion: ScoutMarkMotion.scout,
                size: 30,
              ),
              selectedIcon: AnimatedScoutMark(
                motion: ScoutMarkMotion.scout,
                size: 32,
              ),
              label: Text('Mr Scout'),
            ),
            NavigationRailDestination(
              icon: Icon(Icons.storefront_outlined),
              selectedIcon: Icon(Icons.storefront),
              label: Text('Stores'),
            ),
            NavigationRailDestination(
              icon: Icon(Icons.window_outlined),
              selectedIcon: Icon(Icons.window),
              label: Text('Window'),
            ),
          ],
        ),
      );
}

class _ScoutTip {
  const _ScoutTip(this.title, this.message, this.pose);

  final String title;
  final String message;
  final ScoutMascotPose pose;
}
