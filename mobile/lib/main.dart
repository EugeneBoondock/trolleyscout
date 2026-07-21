import 'package:flutter/material.dart';

import 'api.dart';
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
import 'screens/home_screen.dart';
import 'screens/money_help_screen.dart';
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
import 'widgets/scout_mark.dart';
import 'widgets/watch_bell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDealAlertBackground();
  final alertsEnabled = await NotificationPrefsStore().loadOptIn();
  await DealAlertScheduler().setEnabled(alertsEnabled);
  runApp(const TrolleyScoutApp());
}

class TrolleyScoutApp extends StatefulWidget {
  const TrolleyScoutApp({super.key, this.api});

  final Api? api;

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
        home: RootShell(controller: _controller),
      ),
    );
  }
}

class RootShell extends StatefulWidget {
  const RootShell({super.key, required this.controller});

  final AppController controller;

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  AppDestination _destination = AppDestination.dashboard;
  int _primaryIndex = 0;
  String? _authIntent;
  String? _dealsRetailerId;
  String? _dealsQuery;
  bool? _bioEnabled;
  bool _unlocked = false;
  late bool _wasAuthenticated;

  @override
  void initState() {
    super.initState();
    _wasAuthenticated = widget.controller.session.isAuthenticated;
    widget.controller.addListener(_handleSessionChanged);
    BiometricPrefs.isEnabled().then((enabled) {
      if (mounted) setState(() => _bioEnabled = enabled);
    });
  }

  void _handleSessionChanged() {
    final authenticated = widget.controller.session.isAuthenticated;
    if (authenticated == _wasAuthenticated) return;
    _wasAuthenticated = authenticated;
    if (!mounted) return;
    setState(() {
      _authIntent = null;
      _destination = AppDestination.dashboard;
      _primaryIndex = 0;
      if (!authenticated) _unlocked = false;
    });
  }

  @override
  void dispose() {
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
    AppDestination.money,
    AppDestination.near,
    AppDestination.deals,
    AppDestination.scroll,
  ];

  void _showAuth(String intent) => setState(() => _authIntent = intent);

  void _selectDestination(AppDestination destination) {
    Navigator.maybePop(context);
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
      _authIntent = null;
      _destination = destination;
      if (primaryIndex >= 0) _primaryIndex = primaryIndex;
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final session = widget.controller.session;
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
                  _destination = AppDestination.dashboard;
                  _primaryIndex = 0;
                });
              }
            },
          );
        }
        final compact = MediaQuery.sizeOf(context).width < 430;
        return Scaffold(
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
                onPressed: () =>
                    widget.controller.toggleTheme(Theme.of(context).brightness),
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
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Tooltip(
                    message: 'Profile',
                    child: Semantics(
                      button: true,
                      label: 'Profile',
                      child: PressableScale(
                        child: GestureDetector(
                          onTap: () =>
                              _selectDestination(AppDestination.profile),
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
                IconButton(
                  tooltip: 'Sign out',
                  onPressed: widget.controller.busy
                      ? null
                      : () async {
                          await widget.controller.signOut();
                          if (mounted) {
                            setState(() {
                              _destination = AppDestination.dashboard;
                              _primaryIndex = 0;
                            });
                          }
                        },
                  icon: const Icon(Icons.logout),
                ),
              ],
            ],
            shape:
                Border(bottom: BorderSide(color: TS.lineOf(context), width: 3)),
          ),
          drawer: AppMenuDrawer(
            destination: _destination,
            session: session,
            onSelect: _selectDestination,
          ),
          // Tab and drawer switches cross-fade with a whisper of lift, so
          // navigation feels physical. Honours the system reduced-motion
          // setting via the zero-duration branch.
          body: AnimatedSwitcher(
            duration: MediaQuery.of(context).disableAnimations
                ? Duration.zero
                : const Duration(milliseconds: 220),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            transitionBuilder: (child, animation) => FadeTransition(
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
                      onBack: () => setState(() => _authIntent = null),
                      onAuthenticated: () => setState(() {
                        _authIntent = null;
                        _destination = AppDestination.dashboard;
                        _primaryIndex = 0;
                      }),
                    ),
            ),
          ),
          bottomNavigationBar: _authIntent != null
              ? null
              : DecoratedBox(
                  decoration: BoxDecoration(
                    border: Border(
                        top: BorderSide(color: TS.lineOf(context), width: 3)),
                  ),
                  child: NavigationBar(
                    backgroundColor: TS.bgOf(context),
                    indicatorColor: TS.yellow,
                    selectedIndex: _primaryIndex,
                    onDestinationSelected: (index) =>
                        _selectDestination(_primaryDestinations[index]),
                    destinations: const [
                      NavigationDestination(
                        icon: Icon(Icons.dashboard_outlined),
                        selectedIcon: Icon(Icons.dashboard),
                        label: 'Dashboard',
                      ),
                      NavigationDestination(
                        icon: Icon(Icons.volunteer_activism_outlined),
                        selectedIcon: Icon(Icons.volunteer_activism),
                        label: 'Money',
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
        );
      },
    );
  }

  Widget _screenFor(AppDestination destination) {
    final api = widget.controller.api;
    return switch (destination) {
      AppDestination.home =>
        HomeScreen(onGoToDeals: () => _selectDestination(AppDestination.deals)),
      AppDestination.money => const MoneyHelpScreen(),
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
      AppDestination.savedDeals => SavedDealsScreen(api: api),
      AppDestination.basket => BasketScreen(api: api),
      AppDestination.savedSources => SavedSourcesScreen(api: api),
      AppDestination.offers => OffersScreen(
          api: api,
          canDelete: widget.controller.session.account?.isAdmin == true,
        ),
      AppDestination.scanner => ScannerScreen(api: api),
      AppDestination.advertise => AdvertiseScreen(api: api),
      AppDestination.subscription => SubscriptionScreen(api: api),
      AppDestination.profile => ProfileScreen(controller: widget.controller),
      AppDestination.about => AboutScreen(onNavigate: _selectDestination),
      AppDestination.rules => const RulesScreen(),
      AppDestination.admin => AdminScreen(api: api),
    };
  }
}
