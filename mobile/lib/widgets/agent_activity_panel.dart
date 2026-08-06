import 'package:flutter/material.dart';

import '../store_agent.dart';
import '../theme.dart';

/// What Mr Scout is doing, while it does it.
///
/// The shopper is watching their own logged-in store session being driven, so
/// the panel narrates every step and keeps a stop button within thumb reach.
/// Nothing here is decorative: each line is a thing that happened on the page
/// behind it.
class AgentActivityPanel extends StatefulWidget {
  const AgentActivityPanel({
    super.key,
    required this.runner,
    this.onSignIn,
    this.onOpenCart,
    this.onClose,
  });

  final StoreAgentRunner runner;
  final VoidCallback? onSignIn;
  final VoidCallback? onOpenCart;
  final VoidCallback? onClose;

  @override
  State<AgentActivityPanel> createState() => _AgentActivityPanelState();
}

class _AgentActivityPanelState extends State<AgentActivityPanel> {
  final ScrollController _logScroll = ScrollController();

  @override
  void initState() {
    super.initState();
    widget.runner.addListener(_onRunnerChanged);
  }

  @override
  void dispose() {
    widget.runner.removeListener(_onRunnerChanged);
    _logScroll.dispose();
    super.dispose();
  }

  void _onRunnerChanged() {
    if (!mounted) return;
    setState(() {});
    // Keep the newest line in view without stealing the page's scroll.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_logScroll.hasClients) return;
      _logScroll.animateTo(
        _logScroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final runner = widget.runner;
    final phase = runner.phase;
    final entries = runner.log;
    final latest = entries.isEmpty ? null : entries.last;
    final total = runner.items.length;
    final finished = phase == AgentPhase.finished ||
        phase == AgentPhase.failed ||
        phase == AgentPhase.cancelled;

    return Material(
      key: const ValueKey('agent-activity-panel'),
      color: TS.surfaceOf(context),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: TS.lineSoftOf(context))),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _PhaseBadge(phase: phase),
                const SizedBox(width: 9),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'MR SCOUT  ${runner.itemIndex + 1}/$total',
                        style: TS.eyebrowOf(context).copyWith(fontSize: 9),
                      ),
                      Text(
                        phase.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ],
                  ),
                ),
                if (runner.isRunning)
                  TextButton(
                    key: const ValueKey('agent-stop'),
                    onPressed: runner.cancel,
                    child: const Text('Stop'),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            // The rolling activity list — the shopper's receipt of what was
            // touched on their account.
            Container(
              constraints: const BoxConstraints(maxHeight: 96),
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: TS.surfaceSoftOf(context),
                borderRadius: BorderRadius.circular(10),
              ),
              child: entries.isEmpty
                  ? Text(
                      'Starting up...',
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 12,
                      ),
                    )
                  : ListView.builder(
                      controller: _logScroll,
                      itemCount: entries.length,
                      padding: EdgeInsets.zero,
                      itemBuilder: (context, index) {
                        final entry = entries[index];
                        final isLatest = index == entries.length - 1;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 3),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                entry.isError
                                    ? Icons.error_outline
                                    : isLatest
                                        ? Icons.play_arrow_rounded
                                        : Icons.check,
                                size: 13,
                                color: entry.isError
                                    ? TS.redOf(context)
                                    : TS.mutedOf(context),
                              ),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  entry.message,
                                  style: TextStyle(
                                    color: entry.isError
                                        ? TS.redOf(context)
                                        : isLatest
                                            ? TS.inkOf(context)
                                            : TS.mutedOf(context),
                                    fontSize: 12,
                                    height: 1.3,
                                    fontWeight: isLatest
                                        ? FontWeight.w700
                                        : FontWeight.w500,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
            const SizedBox(height: 9),
            if (runner.awaitingSignIn)
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      key: const ValueKey('agent-continue-after-sign-in'),
                      onPressed: widget.onSignIn,
                      icon: const Icon(Icons.lock_open_rounded),
                      label: const Text('I have signed in'),
                    ),
                  ),
                ],
              )
            else if (finished)
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      key: const ValueKey('agent-open-cart'),
                      onPressed: widget.onOpenCart,
                      icon: const Icon(Icons.shopping_cart_outlined),
                      label: Text(
                        runner.addedCount > 0
                            ? 'Open the store cart'
                            : 'Open the store',
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  TextButton(
                    onPressed: widget.onClose,
                    child: const Text('Done'),
                  ),
                ],
              )
            else
              LinearProgressIndicator(
                minHeight: 3,
                color: TS.redOf(context),
                backgroundColor: TS.lineSoftOf(context),
              ),
            const SizedBox(height: 6),
            Text(
              latest?.isError == true
                  ? 'Mr Scout stops at the cart. Nothing is ever paid for on your behalf.'
                  : 'Mr Scout only fills the cart in your own store session. It never sees your password and never pays.',
              style: TextStyle(
                color: TS.mutedOf(context),
                fontSize: 10,
                height: 1.25,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhaseBadge extends StatelessWidget {
  const _PhaseBadge({required this.phase});

  final AgentPhase phase;

  @override
  Widget build(BuildContext context) {
    final (icon, colour) = switch (phase) {
      AgentPhase.finished => (Icons.check_rounded, TS.green),
      AgentPhase.failed => (Icons.priority_high_rounded, TS.yellow),
      AgentPhase.cancelled => (Icons.stop_rounded, TS.yellow),
      AgentPhase.needsSignIn => (Icons.lock_outline_rounded, TS.yellow),
      _ => (Icons.smart_toy_outlined, TS.yellow),
    };
    return Container(
      padding: const EdgeInsets.all(7),
      decoration: BoxDecoration(
        color: colour,
        border: Border.all(color: TS.ink),
        borderRadius: BorderRadius.circular(11),
      ),
      child: Icon(icon, color: TS.ink, size: 18),
    );
  }
}
