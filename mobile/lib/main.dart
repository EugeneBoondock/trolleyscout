import 'package:flutter/material.dart';
import 'api.dart';
import 'screens/home_screen.dart';
import 'screens/money_help_screen.dart';
import 'screens/near_me_screen.dart';
import 'screens/deals_screen.dart';
import 'theme.dart';

void main() => runApp(const TrolleyScoutApp());

class TrolleyScoutApp extends StatelessWidget {
  const TrolleyScoutApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Trolley Scout',
      debugShowCheckedModeBanner: false,
      theme: TS.theme(),
      home: const RootShell(),
    );
  }
}

class RootShell extends StatefulWidget {
  const RootShell({super.key});

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  final _api = Api();
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final screens = [
      HomeScreen(onGoToDeals: () => setState(() => _tab = 3)),
      const MoneyHelpScreen(),
      NearMeScreen(api: _api),
      DealsScreen(api: _api),
    ];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: const Row(
          children: [
            Icon(Icons.shopping_cart, color: TS.green),
            SizedBox(width: 8),
            Text('TROLLEY SCOUT',
                style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.5)),
          ],
        ),
        shape: const Border(bottom: BorderSide(color: TS.line, width: 3)),
      ),
      body: IndexedStack(index: _tab, children: screens),
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: TS.line, width: 3)),
        ),
        child: NavigationBar(
          backgroundColor: TS.bg,
          indicatorColor: TS.yellow,
          selectedIndex: _tab,
          onDestinationSelected: (i) => setState(() => _tab = i),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.volunteer_activism_outlined), selectedIcon: Icon(Icons.volunteer_activism), label: 'Money'),
            NavigationDestination(icon: Icon(Icons.near_me_outlined), selectedIcon: Icon(Icons.near_me), label: 'Near me'),
            NavigationDestination(icon: Icon(Icons.local_offer_outlined), selectedIcon: Icon(Icons.local_offer), label: 'Deals'),
          ],
        ),
      ),
    );
  }
}
