import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import '../ux.dart';
import 'common.dart';

/// The live help chat on About & help. A member says what went wrong or what
/// they would change; the chat asks a question or two, then files a written
/// brief in the admin's support queue. The support form below it stays the
/// fallback for anyone signed out, or who would rather write it all at once.
class SupportChatCard extends StatefulWidget {
  const SupportChatCard({super.key, required this.api});

  final Api api;

  @override
  State<SupportChatCard> createState() => _SupportChatCardState();
}

class _SupportChatCardState extends State<SupportChatCard> {
  static const _greeting =
      'Hi — tell me what went wrong, or what you wish Trolley Scout did. '
      'I will ask a question or two, then pass it to the team with a summary.';

  final TextEditingController _draft = TextEditingController();
  final ScrollController _scroll = ScrollController();
  final List<({bool fromMember, String text})> _lines = [
    (fromMember: false, text: _greeting),
  ];
  bool _sending = false;
  String? _filedNotice;
  String? _error;

  @override
  void dispose() {
    _draft.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final message = _draft.text.trim();
    if (message.isEmpty || _sending) return;

    // Built before this turn is appended: the history is what the model has
    // already seen, and the greeting was never sent to it.
    final history = [
      for (final line in _lines.skip(1))
        (role: line.fromMember ? 'user' : 'assistant', text: line.text),
    ];

    uxTap();
    setState(() {
      _lines.add((fromMember: true, text: message));
      _draft.clear();
      _sending = true;
      _error = null;
    });
    _scrollToEnd();

    try {
      final answer =
          await widget.api.supportChat(message: message, history: history);
      if (!mounted) return;
      setState(() {
        _lines.add((fromMember: false, text: answer.reply));
        if (answer.wasFiled) {
          _filedNotice = 'Sent to the team as "${answer.filedTopic}" '
              '(${answer.filedCategory}, ${answer.filedSeverity} priority). '
              'You will get a reply by email.';
        }
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'The help chat is unavailable. Use the form '
            'below and we will still get it.');
      }
    } finally {
      if (mounted) setState(() => _sending = false);
      _scrollToEnd();
    }
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return PaperCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.forum_outlined, color: TS.redOf(context)),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Talk it through',
                        style: TextStyle(
                            fontWeight: FontWeight.w900, fontSize: 15)),
                    Text(
                      'The chat writes up your report and files it for the team.',
                      style:
                          TextStyle(color: TS.mutedOf(context), fontSize: 12.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 280),
            child: ListView(
              controller: _scroll,
              shrinkWrap: true,
              children: [
                for (final line in _lines)
                  Align(
                    alignment: line.fromMember
                        ? Alignment.centerRight
                        : Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 9),
                      constraints: BoxConstraints(
                        maxWidth: MediaQuery.sizeOf(context).width * 0.72,
                      ),
                      decoration: BoxDecoration(
                        color: line.fromMember
                            ? TS.yellow
                            : TS.surfaceSoftOf(context),
                        border: Border.all(
                            color: TS.lineSoftOf(context), width: 1.5),
                        borderRadius: BorderRadius.circular(TS.cardRadius),
                      ),
                      child: Text(
                        line.text,
                        style: TextStyle(
                          color: line.fromMember ? TS.ink : TS.inkOf(context),
                          fontSize: 13.5,
                          height: 1.35,
                        ),
                      ),
                    ),
                  ),
                if (_sending)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 8, left: 4),
                      child: Text('Thinking…',
                          style: TextStyle(
                              color: TS.mutedOf(context),
                              fontStyle: FontStyle.italic,
                              fontSize: 13)),
                    ),
                  ),
                if (_filedNotice != null)
                  Container(
                    key: const Key('support-chat-filed'),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: TS.greenOf(context).withValues(alpha: 0.1),
                      border: Border.all(color: TS.greenOf(context), width: 1.5),
                      borderRadius: BorderRadius.circular(TS.cardRadius),
                    ),
                    child: Text(
                      _filedNotice!,
                      style: TextStyle(
                        color: TS.greenOf(context),
                        fontWeight: FontWeight.w700,
                        fontSize: 12.5,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!,
                style: TextStyle(color: TS.redOf(context), fontSize: 12.5)),
          ],
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  key: const Key('support-chat-input'),
                  controller: _draft,
                  enabled: !_sending,
                  maxLength: 1200,
                  maxLines: 3,
                  minLines: 1,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: const InputDecoration(
                    counterText: '',
                    hintText: 'What happened, or what would you change?',
                  ),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _sending ? null : _send,
                child: const Text('Send'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
