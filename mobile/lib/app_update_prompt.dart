import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:in_app_update/in_app_update.dart';
import 'package:url_launcher/url_launcher.dart';

const trolleyScoutAndroidPackage = 'za.co.trolleyscout.trolley_scout';

@immutable
class AppUpdateOffer {
  const AppUpdateOffer({
    required this.availableVersionCode,
    required this.inAppUpdateAllowed,
  });

  final int? availableVersionCode;
  final bool inAppUpdateAllowed;
}

abstract interface class AppUpdateService {
  Future<AppUpdateOffer?> checkForUpdate();

  Future<void> updateInApp();

  Future<void> openPlayStore();
}

class GooglePlayAppUpdateService implements AppUpdateService {
  bool _flexibleAllowed = false;
  bool _immediateAllowed = false;

  @override
  Future<AppUpdateOffer?> checkForUpdate() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return null;

    try {
      final info = await InAppUpdate.checkForUpdate();
      if (info.updateAvailability != UpdateAvailability.updateAvailable &&
          info.updateAvailability !=
              UpdateAvailability.developerTriggeredUpdateInProgress) {
        return null;
      }
      _flexibleAllowed = info.flexibleUpdateAllowed;
      _immediateAllowed = info.immediateUpdateAllowed;
      return AppUpdateOffer(
        availableVersionCode: info.availableVersionCode,
        inAppUpdateAllowed: _flexibleAllowed || _immediateAllowed,
      );
    } catch (_) {
      // Google Play update checks fail for sideloaded and emulator builds.
      // App launch must continue normally in those environments.
      return null;
    }
  }

  @override
  Future<void> updateInApp() async {
    if (_flexibleAllowed) {
      final result = await InAppUpdate.startFlexibleUpdate();
      if (result != AppUpdateResult.success) {
        throw StateError('Flexible update was not accepted.');
      }
      await InAppUpdate.completeFlexibleUpdate();
      return;
    }
    if (_immediateAllowed) {
      final result = await InAppUpdate.performImmediateUpdate();
      if (result != AppUpdateResult.success) {
        throw StateError('Immediate update was not accepted.');
      }
      return;
    }
    throw StateError('Google Play did not allow an in-app update.');
  }

  @override
  Future<void> openPlayStore() async {
    final marketUri =
        Uri.parse('market://details?id=$trolleyScoutAndroidPackage');
    try {
      if (await launchUrl(
        marketUri,
        mode: LaunchMode.externalApplication,
      )) {
        return;
      }
    } catch (_) {
      // The HTTPS listing below works when the Play Store app is unavailable.
    }

    final webUri = Uri.https(
      'play.google.com',
      '/store/apps/details',
      {'id': trolleyScoutAndroidPackage},
    );
    final opened = await launchUrl(
      webUri,
      mode: LaunchMode.externalApplication,
    );
    if (!opened) throw StateError('Could not open the Google Play listing.');
  }
}

class AppUpdatePromptHost extends StatefulWidget {
  const AppUpdatePromptHost({
    super.key,
    required this.child,
    required this.service,
    this.checkDelay = const Duration(milliseconds: 1400),
  });

  final Widget child;
  final AppUpdateService service;
  final Duration checkDelay;

  @override
  State<AppUpdatePromptHost> createState() => _AppUpdatePromptHostState();
}

class _AppUpdatePromptHostState extends State<AppUpdatePromptHost> {
  bool _checked = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkForUpdate());
  }

  Future<void> _checkForUpdate() async {
    if (_checked) return;
    _checked = true;
    if (widget.checkDelay > Duration.zero) {
      await Future<void>.delayed(widget.checkDelay);
    }
    if (!mounted) return;

    final offer = await widget.service.checkForUpdate();
    if (!mounted || offer == null) return;
    await showDialog<void>(
      context: context,
      builder: (context) => _AppUpdateDialog(
        offer: offer,
        service: widget.service,
      ),
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class _AppUpdateDialog extends StatefulWidget {
  const _AppUpdateDialog({
    required this.offer,
    required this.service,
  });

  final AppUpdateOffer offer;
  final AppUpdateService service;

  @override
  State<_AppUpdateDialog> createState() => _AppUpdateDialogState();
}

class _AppUpdateDialogState extends State<_AppUpdateDialog> {
  bool _busy = false;
  String? _error;

  Future<void> _updateInApp() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.service.updateInApp();
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'The in-app update could not start. Try Google Play instead.';
      });
    }
  }

  Future<void> _openPlayStore() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.service.openPlayStore();
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Google Play could not open. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(
                Icons.system_update_alt_rounded,
                size: 34,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(height: 14),
              Text(
                'A new Trolley Scout update is ready',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Get the latest fixes and improvements. Update without leaving the app, or open Trolley Scout in Google Play.',
                textAlign: TextAlign.center,
              ),
              if (_busy) ...[
                const SizedBox(height: 18),
                Semantics(
                  liveRegion: true,
                  child: const Row(
                    children: [
                      SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2.5),
                      ),
                      SizedBox(width: 12),
                      Expanded(child: Text('Preparing your update…')),
                    ],
                  ),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 14),
                Semantics(
                  liveRegion: true,
                  child: Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 20),
              if (widget.offer.inAppUpdateAllowed)
                FilledButton.icon(
                  onPressed: _busy ? null : _updateInApp,
                  icon: const Icon(Icons.download_rounded),
                  label: const Text('Update in app'),
                ),
              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed: _busy ? null : _openPlayStore,
                icon: const Icon(Icons.open_in_new_rounded),
                label: const Text('Open Play Store'),
              ),
              const SizedBox(height: 6),
              TextButton(
                onPressed: _busy ? null : () => Navigator.of(context).pop(),
                child: const Text('Later'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
