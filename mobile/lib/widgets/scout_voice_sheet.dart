import 'dart:async';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:speech_to_text/speech_recognition_error.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../theme.dart';
import 'scout_mark.dart';

typedef ScoutVoiceAsker = Future<ScoutVoiceReply> Function(
  String question,
  List<ScoutChatTurn> history,
);

Future<void> showScoutVoiceSheet(
  BuildContext context, {
  required Api api,
  required String surface,
  ScrollDeal? product,
  ScoutVoiceAsker? ask,
  SpeechToText? speech,
  AudioPlayer? player,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (context) => ScoutVoiceSheet(
      api: api,
      surface: surface,
      product: product,
      ask: ask,
      speech: speech,
      player: player,
    ),
  );
}

class ScoutVoiceSheet extends StatefulWidget {
  const ScoutVoiceSheet({
    super.key,
    required this.api,
    required this.surface,
    this.product,
    this.ask,
    this.speech,
    this.player,
  });

  final Api api;
  final String surface;
  final ScrollDeal? product;
  final ScoutVoiceAsker? ask;
  final SpeechToText? speech;
  final AudioPlayer? player;

  @override
  State<ScoutVoiceSheet> createState() => _ScoutVoiceSheetState();
}

class _ScoutVoiceSheetState extends State<ScoutVoiceSheet> {
  late final SpeechToText _speech;
  late final AudioPlayer _player;
  late final StreamSubscription<PlayerState> _playerStateSubscription;
  final _controller = TextEditingController();
  final _history = <ScoutChatTurn>[];
  ScoutVoiceReply? _reply;
  String? _error;
  var _initialized = false;
  var _listening = false;
  var _sending = false;
  var _playing = false;
  var _submittedFinalResult = false;

  @override
  void initState() {
    super.initState();
    _speech = widget.speech ?? SpeechToText();
    _player = widget.player ?? AudioPlayer(playerId: 'mr_scout_voice');
    _controller.addListener(_refreshComposer);
    _playerStateSubscription = _player.onPlayerStateChanged.listen((state) {
      if (!mounted) return;
      setState(() => _playing = state == PlayerState.playing);
    });
  }

  @override
  void dispose() {
    unawaited(_speech.cancel());
    unawaited(_playerStateSubscription.cancel());
    unawaited(_player.dispose());
    _controller.removeListener(_refreshComposer);
    _controller.dispose();
    super.dispose();
  }

  void _refreshComposer() {
    if (mounted) setState(() {});
  }

  Future<void> _toggleListening() async {
    if (_sending) return;
    if (_listening) {
      await _speech.stop();
      if (mounted) setState(() => _listening = false);
      return;
    }

    setState(() {
      _error = null;
      _submittedFinalResult = false;
    });
    if (!_initialized) {
      final available = await _speech.initialize(
        finalTimeout: const Duration(milliseconds: 900),
        onError: _onSpeechError,
        onStatus: _onSpeechStatus,
      );
      if (!available) {
        if (!mounted) return;
        setState(() => _error =
            'Voice recognition is unavailable on this device. Type your question below.');
        return;
      }
      _initialized = true;
    }

    if (!mounted) return;
    setState(() {
      _controller.clear();
      _listening = true;
    });
    await _speech.listen(
      onResult: _onSpeechResult,
      listenOptions: SpeechListenOptions(
        autoPunctuation: true,
        cancelOnError: true,
        listenFor: const Duration(seconds: 24),
        listenMode: ListenMode.dictation,
        partialResults: true,
        pauseFor: const Duration(seconds: 3),
      ),
    );
  }

  void _onSpeechResult(SpeechRecognitionResult result) {
    if (!mounted) return;
    _controller.text = result.recognizedWords;
    _controller.selection = TextSelection.collapsed(
      offset: _controller.text.length,
    );
    setState(() {});
    if (result.finalResult && !_submittedFinalResult) {
      _submittedFinalResult = true;
      setState(() => _listening = false);
      unawaited(_submit());
    }
  }

  void _onSpeechStatus(String status) {
    if (!mounted) return;
    if (status == SpeechToText.doneStatus ||
        status == SpeechToText.notListeningStatus) {
      setState(() => _listening = false);
    }
  }

  void _onSpeechError(SpeechRecognitionError error) {
    if (!mounted) return;
    setState(() {
      _listening = false;
      _error = error.permanent
          ? 'Microphone access is off. Allow it in your phone settings, or type your question.'
          : 'I did not catch that. Tap the microphone and try again.';
    });
  }

  Future<void> _submit() async {
    final question = _controller.text.trim();
    if (question.length < 2 || _sending) return;
    await _speech.stop();
    if (_playing) await _player.stop();
    if (!mounted) return;
    setState(() {
      _sending = true;
      _listening = false;
      _error = null;
      _reply = null;
    });

    try {
      final reply = await (widget.ask ?? _askApi)(question, List.of(_history));
      _history
        ..add(ScoutChatTurn(role: ScoutChatRole.user, text: question))
        ..add(ScoutChatTurn(role: ScoutChatRole.assistant, text: reply.answer));
      if (_history.length > 8) _history.removeRange(0, _history.length - 8);
      if (!mounted) return;
      setState(() => _reply = reply);
      if (reply.audioBytes.isNotEmpty) {
        await _player.play(BytesSource(Uint8List.fromList(reply.audioBytes)));
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) {
        setState(
            () => _error = 'Mr Scout could not answer right now. Try again.');
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<ScoutVoiceReply> _askApi(
    String question,
    List<ScoutChatTurn> history,
  ) {
    return widget.api.scoutVoice(
      question: question,
      surface: widget.surface,
      history: history,
      product: widget.product,
    );
  }

  Future<void> _replay() async {
    final reply = _reply;
    if (reply == null || reply.audioBytes.isEmpty) return;
    await _player.stop();
    await _player.play(BytesSource(Uint8List.fromList(reply.audioBytes)));
  }

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final viewInsets = MediaQuery.viewInsetsOf(context);
    final viewPadding = MediaQuery.viewPaddingOf(context);
    final reportedBottom = viewInsets.bottom > viewPadding.bottom
        ? viewInsets.bottom
        : viewPadding.bottom;
    final safeBottom = reportedBottom < 20 ? 20.0 : reportedBottom;
    final sheetHeight = MediaQuery.sizeOf(context).height * 0.86;
    return Container(
      key: const ValueKey('scout-voice-sheet'),
      constraints: BoxConstraints(maxHeight: sheetHeight),
      padding: EdgeInsets.fromLTRB(16, 10, 16, 18 + safeBottom),
      decoration: BoxDecoration(
        color: TS.bgOf(context),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        border: Border.all(color: TS.lineSoftOf(context)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 42,
            height: 4,
            decoration: BoxDecoration(
              color: TS.lineOf(context),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(5),
                decoration: BoxDecoration(
                  color: TS.yellow,
                  border: Border.all(color: TS.ink, width: 1.5),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const AnimatedScoutMark(
                  motion: ScoutMarkMotion.scout,
                  size: 38,
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product == null
                          ? 'Talk to Mr Scout'
                          : 'Ask about this product',
                      style: Theme.of(context)
                          .textTheme
                          .titleLarge
                          ?.merge(TS.display),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      product == null
                          ? 'Speak naturally about deals, lists, and shopping choices.'
                          : '${product.title} · ${product.retailerName}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: TS.mutedOf(context),
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Close voice chat',
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close_rounded),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_reply == null && !_sending)
                    _VoicePromptCard(product: product),
                  if (_sending)
                    const _VoiceStatusCard(
                      icon: Icons.auto_awesome_rounded,
                      label: 'Mr Scout is checking that for you…',
                      showProgress: true,
                    ),
                  if (_reply != null)
                    _VoiceAnswerCard(
                      reply: _reply!,
                      playing: _playing,
                      onReplay: _replay,
                    ),
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Container(
                      key: const ValueKey('scout-voice-error'),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.errorContainer,
                        border: Border.all(color: TS.redOf(context)),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Text(
                        _error!,
                        style: TextStyle(
                          color: TS.inkOf(context),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const ValueKey('scout-voice-question'),
            controller: _controller,
            enabled: !_sending,
            maxLength: 500,
            maxLines: 3,
            minLines: 1,
            textCapitalization: TextCapitalization.sentences,
            style: TextStyle(
              color: TS.inkOf(context),
              fontWeight: FontWeight.w600,
            ),
            decoration: InputDecoration(
              counterText: '',
              hintText: _listening ? 'Listening…' : 'Ask a shopping question',
              hintStyle: TextStyle(color: TS.mutedOf(context)),
              filled: true,
              fillColor: TS.surfaceOf(context),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(18),
                borderSide: BorderSide(color: TS.lineSoftOf(context)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(18),
                borderSide: BorderSide(color: TS.lineSoftOf(context)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(18),
                borderSide: BorderSide(color: TS.redOf(context), width: 1.8),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  key: const ValueKey('scout-voice-mic'),
                  onPressed: _sending ? null : _toggleListening,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(50),
                    backgroundColor: _listening ? TS.redOf(context) : TS.yellow,
                    foregroundColor: _listening ? Colors.white : TS.ink,
                  ),
                  icon:
                      Icon(_listening ? Icons.stop_rounded : Icons.mic_rounded),
                  label: Text(_listening ? 'Stop listening' : 'Tap to speak'),
                ),
              ),
              const SizedBox(width: 9),
              IconButton.filled(
                key: const ValueKey('scout-voice-send'),
                tooltip: 'Ask Mr Scout',
                onPressed: _sending || _controller.text.trim().length < 2
                    ? null
                    : _submit,
                style: IconButton.styleFrom(
                  minimumSize: const Size(50, 50),
                  backgroundColor: TS.redOf(context),
                  foregroundColor: Colors.white,
                ),
                icon: const Icon(Icons.arrow_upward_rounded),
              ),
            ],
          ),
          const SizedBox(height: 9),
          Text(
            'Your device transcribes your words. The question and reply are sent to our AI voice services. Check important details with the retailer.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: TS.mutedOf(context),
              fontSize: 10.5,
              height: 1.25,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _VoicePromptCard extends StatelessWidget {
  const _VoicePromptCard({required this.product});

  final ScrollDeal? product;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: TS.surfaceOf(context),
        border: Border.all(color: TS.lineSoftOf(context)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Icon(Icons.graphic_eq_rounded, color: TS.redOf(context), size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              product == null
                  ? 'Try “Find the best coffee deal near me” or ask Mr Scout to build a grocery list.'
                  : 'Try “Does this support Netflix?”, “What size room is this good for?”, or “Is this a fair price?”',
              style: TextStyle(
                color: TS.inkOf(context),
                fontWeight: FontWeight.w700,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _VoiceStatusCard extends StatelessWidget {
  const _VoiceStatusCard({
    required this.icon,
    required this.label,
    this.showProgress = false,
  });

  final IconData icon;
  final String label;
  final bool showProgress;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: TS.surfaceOf(context),
        border: Border.all(color: TS.lineSoftOf(context)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          if (showProgress)
            SizedBox.square(
              dimension: 24,
              child: CircularProgressIndicator(
                color: TS.redOf(context),
                strokeWidth: 2.5,
              ),
            )
          else
            Icon(icon, color: TS.redOf(context)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: TS.inkOf(context),
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _VoiceAnswerCard extends StatelessWidget {
  const _VoiceAnswerCard({
    required this.reply,
    required this.playing,
    required this.onReplay,
  });

  final ScoutVoiceReply reply;
  final bool playing;
  final VoidCallback onReplay;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const ValueKey('scout-voice-answer'),
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: TS.surfaceOf(context),
        border: Border.all(color: TS.lineSoftOf(context)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                playing ? Icons.graphic_eq_rounded : Icons.volume_up_outlined,
                color: TS.redOf(context),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  playing ? 'Mr Scout is speaking' : 'Mr Scout answered',
                  style: TextStyle(
                    color: TS.inkOf(context),
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              IconButton(
                key: const ValueKey('scout-voice-replay'),
                tooltip: 'Play answer again',
                onPressed: reply.audioBytes.isEmpty ? null : onReplay,
                icon: const Icon(Icons.replay_rounded),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SelectableText(
            reply.answer,
            style: TextStyle(
              color: TS.inkOf(context),
              height: 1.45,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (reply.sources.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              'Checked sources',
              style: TextStyle(
                color: TS.mutedOf(context),
                fontSize: 11,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 5),
            for (final source in reply.sources)
              TextButton.icon(
                onPressed: () => launchUrl(
                  Uri.parse(source.url),
                  mode: LaunchMode.externalApplication,
                ),
                style: TextButton.styleFrom(
                  alignment: Alignment.centerLeft,
                  foregroundColor: TS.redOf(context),
                  padding: const EdgeInsets.symmetric(vertical: 2),
                ),
                icon: const Icon(Icons.open_in_new_rounded, size: 16),
                label: Text(
                  source.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
        ],
      ),
    );
  }
}
