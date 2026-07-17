import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

import 'api.dart';

Future<bool> openPayFastCheckout(
  BuildContext context,
  SubscriptionCheckout checkout,
) async {
  final actionUrl = checkout.redirectUrl;
  if (actionUrl == null || checkout.redirectFields.isEmpty) return false;

  final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Continue to PayFast?'),
          content: const Text(
              'Your secure payment will open in a separate browser tab.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Open PayFast'),
            ),
          ],
        ),
      ) ??
      false;
  if (!confirmed) return false;

  final form = web.HTMLFormElement()
    ..method = 'POST'
    ..action = actionUrl
    ..target = '_blank'
    ..style.display = 'none';

  for (final entry in checkout.redirectFields.entries) {
    final input = web.HTMLInputElement()
      ..type = 'hidden'
      ..name = entry.key
      ..value = entry.value;
    form.appendChild(input);
  }

  web.document.body?.appendChild(form);
  form.submit();
  return true;
}
