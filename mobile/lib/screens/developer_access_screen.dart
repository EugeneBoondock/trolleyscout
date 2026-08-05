import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../theme.dart';
import '../widgets/common.dart';

const _scopeLabels = <String, String>{
  'shopping:read': 'Read deals, catalogues, stores, and stories',
  'trends:read': 'Read shopping trends',
  'campaigns:read': 'Read business campaigns',
  'campaigns:write': 'Create and manage business campaigns',
};

class DeveloperAccessScreen extends StatefulWidget {
  const DeveloperAccessScreen({super.key, required this.api});

  final Api api;

  @override
  State<DeveloperAccessScreen> createState() => _DeveloperAccessScreenState();
}

class _DeveloperAccessScreenState extends State<DeveloperAccessScreen> {
  final _name = TextEditingController();
  final _selectedScopes = <String>{'shopping:read', 'trends:read'};
  DeveloperKeyResource? _resource;
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _secret;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final resource = await widget.api.developerKeys();
      if (mounted) setState(() => _resource = resource);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _createKey() async {
    if (_name.text.trim().length < 2 || _selectedScopes.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final resource = await widget.api.createDeveloperKey(
        _name.text.trim(),
        _selectedScopes.toList(growable: false),
      );
      if (!mounted) return;
      setState(() {
        _resource = resource;
        _secret = resource.secret;
        _name.clear();
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _revokeKey(DeveloperApiKeySummary key) async {
    final confirmed = await confirmAction(
      context,
      title: 'Revoke ${key.name}?',
      message: 'Apps using this key will lose access immediately.',
      confirmLabel: 'Revoke key',
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    setState(() => _busy = true);
    try {
      final resource = await widget.api.revokeDeveloperKey(key.id);
      if (mounted) setState(() => _resource = resource);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Developer access')),
      body: _loading
          ? const LoadingPane()
          : _resource == null
              ? ErrorPane(
                  message: _error ?? 'Developer access could not be loaded.',
                  onRetry: _load,
                )
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    const ScreenHeader(
                      eyebrow: 'Developer tools',
                      title: 'MCP and API credentials',
                      description:
                          'Create scoped API keys for direct requests. MCP clients can connect through OAuth on the web.',
                    ),
                    _UsageCard(resource: _resource!),
                    if (_secret != null) _SecretCard(secret: _secret!),
                    _CreateKeyCard(
                      busy: _busy,
                      name: _name,
                      resource: _resource!,
                      selectedScopes: _selectedScopes,
                      onCreate: _createKey,
                      onNameChanged: (_) => setState(() {}),
                      onScopeChanged: (scope, selected) => setState(() {
                        if (selected) {
                          _selectedScopes.add(scope);
                        } else {
                          _selectedScopes.remove(scope);
                        }
                      }),
                    ),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(
                          _error!,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error),
                        ),
                      ),
                    _KeyList(
                      busy: _busy,
                      keys: _resource!.keys,
                      onRevoke: _revokeKey,
                    ),
                  ],
                ),
    );
  }
}

class _UsageCard extends StatelessWidget {
  const _UsageCard({required this.resource});

  final DeveloperKeyResource resource;

  @override
  Widget build(BuildContext context) => PaperCard(
        margin: const EdgeInsets.only(bottom: 14),
        child: Row(
          children: [
            Icon(Icons.data_usage, color: TS.redOf(context)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Monthly API usage',
                      style: Theme.of(context).textTheme.titleMedium),
                  Text(
                    '${resource.usage} of ${resource.allowance.callsPerMonth} calls',
                    style: TextStyle(color: TS.mutedOf(context)),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}

class _SecretCard extends StatelessWidget {
  const _SecretCard({required this.secret});

  final String secret;

  @override
  Widget build(BuildContext context) => PaperCard(
        margin: const EdgeInsets.only(bottom: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Copy this key now',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            const Text('It will not be shown again after you leave this page.'),
            const SizedBox(height: 10),
            SelectableText(
              secret,
              style: const TextStyle(fontFamily: 'monospace'),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: secret));
                showNotice(context, 'API key copied.');
              },
              icon: const Icon(Icons.copy),
              label: const Text('Copy key'),
            ),
          ],
        ),
      );
}

class _CreateKeyCard extends StatelessWidget {
  const _CreateKeyCard({
    required this.busy,
    required this.name,
    required this.resource,
    required this.selectedScopes,
    required this.onCreate,
    required this.onNameChanged,
    required this.onScopeChanged,
  });

  final bool busy;
  final TextEditingController name;
  final DeveloperKeyResource resource;
  final Set<String> selectedScopes;
  final VoidCallback onCreate;
  final ValueChanged<String> onNameChanged;
  final void Function(String scope, bool selected) onScopeChanged;

  @override
  Widget build(BuildContext context) => PaperCard(
        margin: const EdgeInsets.only(bottom: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Create an API key',
                style:
                    Theme.of(context).textTheme.titleLarge?.merge(TS.display)),
            const SizedBox(height: 12),
            TextField(
              controller: name,
              maxLength: 80,
              onChanged: onNameChanged,
              decoration: const InputDecoration(
                labelText: 'Key name',
                hintText: 'Production app',
              ),
            ),
            const SizedBox(height: 6),
            Text('Scopes', style: Theme.of(context).textTheme.titleMedium),
            for (final scope in resource.scopes)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                title: Text(scope),
                subtitle: Text(_scopeLabels[scope] ?? scope),
                value: selectedScopes.contains(scope),
                onChanged: busy
                    ? null
                    : (selected) => onScopeChanged(scope, selected == true),
              ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: busy ||
                        name.text.trim().length < 2 ||
                        selectedScopes.isEmpty
                    ? null
                    : onCreate,
                icon: const Icon(Icons.key),
                label: Text(busy ? 'Creating key' : 'Create API key'),
              ),
            ),
          ],
        ),
      );
}

class _KeyList extends StatelessWidget {
  const _KeyList({
    required this.busy,
    required this.keys,
    required this.onRevoke,
  });

  final bool busy;
  final List<DeveloperApiKeySummary> keys;
  final void Function(DeveloperApiKeySummary key) onRevoke;

  @override
  Widget build(BuildContext context) {
    if (keys.isEmpty) {
      return PaperCard(
        child: Text(
          'No API keys yet. Create one when you are ready to connect an app.',
          style: TextStyle(color: TS.mutedOf(context)),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('API keys',
            style: Theme.of(context).textTheme.titleLarge?.merge(TS.display)),
        const SizedBox(height: 8),
        for (final key in keys)
          PaperCard(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(key.name),
              subtitle: Text(
                '${key.keyPrefix}••••••••\n${key.scopes.join(', ')}',
              ),
              isThreeLine: true,
              trailing: key.isRevoked
                  ? const Text('Revoked')
                  : IconButton(
                      tooltip: 'Revoke ${key.name}',
                      onPressed: busy ? null : () => onRevoke(key),
                      icon: const Icon(Icons.delete_outline),
                    ),
            ),
          ),
      ],
    );
  }
}
