import 'dart:async';

import 'package:flutter/material.dart';

import 'api.dart';
import 'app_link_coordinator.dart';
import 'app_controller.dart';
import 'biometric_gate.dart';
import 'deal_alert_background.dart';
import 'deal_alert_scheduler.dart';
import 'notification_prefs_store.dart';
import 'screens/advertise_screen.dart';
import 'screens/auth_screen.dart';
import 'screens/about_screen.dart';
import 'screens/admin_screen.dart';
import 'screens/basket_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/deals_screen.dart';
import 'screens/near_me_screen.dart';
import 'screens/offers_screen.dart';
import 'screens/onboarding_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/properties_screen.dart';
import 'screens/rules_screen.dart';
import 'screens/saved_deals_screen.dart';
import 'screens/saved_sources_screen.dart';
import 'screens/scanner_screen.dart';
import 'screens/stores_screen.dart';
import 'screens/window_shopping_screen.dart';
import 'screens/subscription_screen.dart';
import 'screens/tools_screen.dart';
import 'screens/vouchers_screen.dart';
import 'theme.dart';
import 'ux.dart';
import 'widgets/app_drawer.dart';
import 'widgets/common.dart';
import 'widgets/scout_avatar_view.dart';
import 'widgets/scout_launch_intro.dart';
import 'widgets/scout_mascot.dart';
import 'widgets/scout_mark.dart';
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
    this.launchIntroDuration = const Duration(milliseconds: 1100),
  });

  final Api? api;
  final Duration launchIntroDuration;

  @override
  State<TrolleyScoutApp> createState() => _TrolleyScoutAppState();
}

class _TrolleyScoutAppState extends State<TrolleyScoutApp> {
  late final AppController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AppController(widget.api ?? Api());
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
        home: RootShell(
          controller: _controller,
          launchIntroDuration: widget.launchIntroDuration,
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

class _RootShellState extends State<RootShell> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  AppDestination _destination = AppDestination.dashboard;
  final List<AppDestination> _navHistory = [];
  int _primaryIndex = 0;
  String? _authIntent;
  String? _dealsRetailerId;
  String? _dealsQuery;
  bool? _bioEnabled;
  bool _unlocked = false;
  late bool _introComplete;
  bool _guideVisible = false;
  Timer? _guideTimer;
  final Set<AppDestination> _shownGuideTips = {};
  late bool _wasAuthenticated;
  AppLinkRequest? _pendingAppLink;

  @override
  void initState() {
    super.initState();
    _introComplete = widget.launchIntroDuration == Duration.zero;
    _wasAuthenticated = widget.controller.session.isAuthenticated;
    widget.controller.addListener(_handleSessionChanged);
    AppLinkCoordinator.instance.addListener(_handleAppLink);
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
      'near' => AppDestination.near,
      'stores' => AppDestination.stores,
      'tools' => AppDestination.tools,
      'scroll' => AppDestination.scroll,
      'vouchers' => AppDestination.vouchers,
      'savedDeals' => AppDestination.savedDeals,
      'basket' => AppDestination.basket,
      'subscription' => AppDestination.subscription,
      'profile' => AppDestination.profile,
      'advertise' => AppDestination.advertise,
      'about' => AppDestination.about,
      _ => AppDestination.dashboard,
    };
    if (destination == AppDestination.deals) {
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
    AppLinkCoordinator.instance.removeListener(_handleAppLink);
    widget.controller.removeListener(_handleSessionChanged);
    super.dispose();
  }

  // Near-me store card → open Find deals pre-filtered to that store's deals.
  void _viewStoreDeals(String? retailerId, String storeName) {
    setState(() {
      _dealsRetailerId = retailerId?.isNotEmpty == true ? retailerId : null;
      _dealsQuery = retailerId?.isNotEmpty == true ? null : storeName;
    });
    _selectDestination(AppDestination.deals);
  }

  static const _primaryDestinations = [
    AppDestination.dashboard,
    AppDestination.stores,
    AppDestination.near,
    AppDestination.deals,
    AppDestination.scroll,
  ];

  void _showAuth(String intent) => setState(() => _authIntent = intent);

  void _selectDestination(AppDestination destination) {
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
      animation: widget.controller,
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
        // Full auth gate: while the stored session is being restored show a
        // splash, and until the shopper is signed in show onboarding + auth —
        // no app content is reachable before an account exists.
        if (widget.controller.restoring) {
          return Scaffold(
            backgroundColor: TS.bgOf(context),
            body: const Center(
              child: AnimatedScoutMark(motion: ScoutMarkMotion.spin, size: 48),
            ),
          );
        }
        if (!session.isAuthenticated) {
          return OnboardingScreen(controller: widget.controller);
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
        if (_bioEnabled! && !_unlocked) {
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
            appBar: AppBar(
              leading: Builder(
                builder: (context) => IconButton(
                  tooltip: 'Open navigation menu',
                  onPressed: () => Scaffold.of(context).openDrawer(),
                  icon: const Icon(Icons.menu),
                ),
              ),
              titleSpacing: 4,
              title: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const AnimatedScoutMark(
                    key: ValueKey('navbar-scout-mark'),
                    motion: ScoutMarkMotion.scout,
                    size: 36,
                  ),
                  if (!compact) ...[
                    const SizedBox(width: 8),
                    const Flexible(
                      child: Text(
                        'TROLLEY SCOUT',
                        overflow: TextOverflow.fade,
                        softWrap: false,
                        style: TextStyle(
                            fontWeight: FontWeight.w900, letterSpacing: 0.5),
                      ),
                    ),
                  ],
                ],
              ),
              actions: [
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
                if (!session.isAuthenticated) ...[
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
                  WatchBell(controller: widget.controller),
                  // The shopper's own tile, not a generic person glyph — the app
                  // bar is where they most often check "am I still me?".
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: Tooltip(
                      message: 'Settings',
                      child: Semantics(
                        button: true,
                        label: 'Settings',
                        child: PressableScale(
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: () =>
                                _selectDestination(AppDestination.profile),
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
              shape: Border(
                  bottom: BorderSide(color: TS.lineOf(context), width: 3)),
            ),
            drawer: AppMenuDrawer(
              destination: _destination,
              session: session,
              onSelect: _selectDestination,
            ),
            // Tab and drawer switches cross-fade with a whisper of lift, so
            // navigation feels physical. Honours the system reduced-motion
            // setting via the zero-duration branch.
            body: Column(
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
                          duration: MediaQuery.of(context).disableAnimations
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
                            key: ValueKey(_authIntent ?? _destination.name),
                            child: _authIntent == null
                                ? _screenFor(_destination)
                                : AuthScreen(
                                    controller: widget.controller,
                                    initialIntent: _authIntent!,
                                    onBack: () =>
                                        setState(() => _authIntent = null),
                                    onAuthenticated: () => setState(() {
                                      _authIntent = null;
                                      _destination = AppDestination.dashboard;
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
                          bottom: 12,
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
            bottomNavigationBar: _authIntent != null
                ? null
                : SafeArea(
                    top: false,
                    minimum: const EdgeInsets.fromLTRB(10, 0, 10, 8),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: TS.surfaceOf(context),
                        border: Border.all(
                          color: TS.lineSoftOf(context),
                          width: 1,
                        ),
                        borderRadius: BorderRadius.circular(TS.panelRadius),
                        boxShadow: [
                          BoxShadow(
                            color:
                                Theme.of(context).brightness == Brightness.dark
                                    ? const Color(0x66000000)
                                    : const Color(0x211C1710),
                            offset: const Offset(0, 5),
                            blurRadius: 16,
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(TS.panelRadius - 1),
                        child: NavigationBar(
                          height: largeText ? 72 : 64,
                          backgroundColor: TS.surfaceOf(context),
                          elevation: 0,
                          indicatorColor: TS.yellow,
                          labelBehavior: largeText
                              ? NavigationDestinationLabelBehavior
                                  .onlyShowSelected
                              : NavigationDestinationLabelBehavior.alwaysShow,
                          selectedIndex: _primaryIndex,
                          onDestinationSelected: (index) =>
                              _selectDestination(_primaryDestinations[index]),
                          destinations: const [
                            NavigationDestination(
                              icon: Icon(Icons.dashboard_outlined),
                              selectedIcon: Icon(Icons.dashboard),
                              label: 'Home',
                            ),
                            NavigationDestination(
                              icon: Icon(Icons.storefront_outlined),
                              selectedIcon: Icon(Icons.storefront),
                              label: 'Stores',
                            ),
                            NavigationDestination(
                              icon: Icon(Icons.near_me_outlined),
                              selectedIcon: Icon(Icons.near_me),
                              label: 'Near me',
                            ),
                            NavigationDestination(
                              icon: Icon(Icons.local_offer_outlined),
                              selectedIcon: Icon(Icons.local_offer),
                              label: 'Deals',
                            ),
                            NavigationDestination(
                              icon: Icon(Icons.window_outlined),
                              selectedIcon: Icon(Icons.window),
                              label: 'Window',
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
          ),
        );
      },
    );
  }

  Widget _screenFor(AppDestination destination) {
    final api = widget.controller.api;
    return switch (destination) {
      AppDestination.near => NearMeScreen(
          api: api,
          onViewStoreDeals: _viewStoreDeals,
          isAuthenticated: widget.controller.session.isAuthenticated,
          onWantsAuth: () => _showAuth('login'),
        ),
      AppDestination.deals => DealsScreen(
          api: api,
          isAuthenticated: widget.controller.session.isAuthenticated,
          onWatchesChanged: widget.controller.refreshWatches,
          onWantsAuth: () => _showAuth('login'),
          initialRetailerId: _dealsRetailerId,
          initialQuery: _dealsQuery,
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
        ),
      AppDestination.vouchers => VouchersScreen(
          api: api,
          isAuthenticated: widget.controller.session.isAuthenticated,
          onRequireAuth: () => _showAuth('login'),
        ),
      AppDestination.savedDeals => SavedDealsScreen(
          api: api,
          onFindDeals: () => _selectDestination(AppDestination.deals),
        ),
      AppDestination.basket => BasketScreen(api: api),
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

class _ScoutTip {
  const _ScoutTip(this.title, this.message, this.pose);

  final String title;
  final String message;
  final ScoutMascotPose pose;
}
