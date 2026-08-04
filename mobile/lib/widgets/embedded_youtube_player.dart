import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../theme.dart';
import '../ux.dart';

/// Opens an embedded YouTube video player modal directly inside the Window
/// Shopping screen for the specified product query.
Future<void> showEmbeddedYouTubeVideoModal(
  BuildContext context, {
  required String productTitle,
  String? customVideoId,
}) async {
  uxTap();
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.black,
    clipBehavior: Clip.antiAlias,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(TS.panelRadius)),
    ),
    builder: (context) => _YouTubeModalContent(
      productTitle: productTitle,
      customVideoId: customVideoId,
    ),
  );
}

class _YouTubeModalContent extends StatefulWidget {
  const _YouTubeModalContent({
    required this.productTitle,
    this.customVideoId,
  });

  final String productTitle;
  final String? customVideoId;

  @override
  State<_YouTubeModalContent> createState() => _YouTubeModalContentState();
}

class _YouTubeModalContentState extends State<_YouTubeModalContent> {
  late final WebViewController _controller;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    final videoId = widget.customVideoId?.trim();
    final embedUrl = (videoId != null && videoId.isNotEmpty)
        ? 'https://www.youtube.com/embed/$videoId?autoplay=1&enablejsapi=1'
        : 'https://www.youtube.com/embed?listType=search&list=${Uri.encodeComponent("${widget.productTitle} review")}&autoplay=1';

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) {
          if (mounted) setState(() => _loading = false);
        },
      ))
      ..loadRequest(Uri.parse(embedUrl));
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.75,
      color: Colors.black,
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            color: const Color(0xFF181818),
            child: Row(
              children: [
                const Icon(Icons.play_circle_fill, color: Colors.red, size: 24),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.productTitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                        ),
                      ),
                      const Text(
                        'YouTube Video Review',
                        style: TextStyle(color: Colors.white70, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.white),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          Expanded(
            child: Stack(
              children: [
                WebViewWidget(controller: _controller),
                if (_loading)
                  const Center(
                    child: CircularProgressIndicator(color: Colors.red),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
