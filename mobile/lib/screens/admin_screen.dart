import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../widgets/common.dart';

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key, required this.api});

  final Api api;

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  late Future<AdminOverview> _future = widget.api.adminOverview();

  void _reload() => setState(() {
        _future = widget.api.adminOverview();
      });

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<AdminOverview>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const LoadingPane();
        }
        if (snapshot.hasError || snapshot.data == null) {
          return ErrorPane(
              message: 'Admin data is unavailable.', onRetry: _reload);
        }
        final overview = snapshot.data!;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const ScreenHeader(
              eyebrow: 'Admin',
              title: 'Admin console',
              description: 'Accounts, plans, and scout status.',
            ),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                SizedBox(
                    width: 170,
                    child: MetricCard(
                        label: 'Accounts',
                        value: '${overview.accountCount}',
                        icon: Icons.people_outline)),
                SizedBox(
                    width: 170,
                    child: MetricCard(
                        label: 'Stored deals',
                        value: '${overview.dealCount}',
                        icon: Icons.local_offer_outlined)),
                SizedBox(
                    width: 170,
                    child: MetricCard(
                        label: 'Leaflets',
                        value: '${overview.leafletCount}',
                        icon: Icons.menu_book_outlined)),
                SizedBox(
                    width: 170,
                    child: MetricCard(
                        label: 'Sources',
                        value: '${overview.sourceCount}',
                        icon: Icons.storefront_outlined)),
              ],
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              children: [
                for (final entry in overview.planCounts.entries)
                  Chip(label: Text('${entry.key}: ${entry.value}')),
              ],
            ),
            const SizedBox(height: 16),
            Text('Recent accounts',
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.merge(TS.display)),
            const SizedBox(height: 8),
            for (final account in overview.accounts)
              PaperCard(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: CircleAvatar(child: Text(account.initials)),
                  title: Text(account.displayName,
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text(
                      '${account.email}\nJoined ${account.createdAt.split('T').first}'),
                  isThreeLine: true,
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(account.planName),
                      Text(account.role, style: TS.eyebrowOf(context))
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
