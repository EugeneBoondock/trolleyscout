import 'package:flutter/material.dart';
import 'package:trolley_scout/assisted_store_cart.dart';
import 'package:trolley_scout/theme.dart';
import 'package:trolley_scout/widgets/in_app_browser_native.dart';

void main() {
  const firstUrl =
      'https://clicks.co.za/afri-pure_100-pure-organic-castor-hair-oil-50ml/p/390385';
  final items = [
    AssistedStoreCartItem.tryCreate(
      title: 'Afri Pure Organic Castor Hair Oil 50ml',
      productUrl: firstUrl,
      priceText: 'R59.47',
      quantity: 2,
    )!,
    AssistedStoreCartItem.tryCreate(
      title: 'Afri Pure Rose and Mint Detangling Spray 200ml',
      productUrl:
          'https://clicks.co.za/afri-pure_rose-and-mint-detangling-spray-200ml/p/390386',
      priceText: 'R41.97',
    )!,
  ];
  runApp(MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: TS.lightTheme(),
    darkTheme: TS.darkTheme(),
    themeMode: ThemeMode.system,
    home: TrolleyScoutBrowser(
      uri: Uri.parse(firstUrl),
      title: 'Shop Clicks',
      assistedItems: items,
    ),
  ));
}
