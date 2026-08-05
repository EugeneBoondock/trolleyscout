import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../api.dart';
import '../theme.dart';
import '../ux.dart';

/// Opens an embedded YouTube video player modal directly inside the Window
/// Shopping screen for the specified product query. With an [api] the sheet
/// loads the product's three most-watched reviews and pages between them;
/// without one it falls back to YouTube's own search playlist.
Future<void> showEmbeddedYouTubeVideoModal(
  BuildContext context, {
  required String productTitle,
  String? customVideoId,
  Api? api,
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
      api: api,
    ),
  );
}

class _YouTubeModalContent extends StatefulWidget {
  const _YouTubeModalContent({
    required this.productTitle,
    this.customVideoId,
    this.api,
  });

  final String productTitle;
  final String? customVideoId;
  final Api? api;

  @override
  State<_YouTubeModalContent> createState() => _YouTubeModalContentState();
}

class _YouTubeModalContentState extends State<_YouTubeModalContent> {
  late final WebViewController _controller;
  bool _loading = true;
  List<ProductVideo> _videos = const [];
  int _index = 0;

  String get _searchFallbackUrl =>
      'https://www.youtube.com/embed?listType=search&list=${Uri.encodeComponent("${widget.productTitle} review")}&autoplay=1';

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) {
          if (mounted) setState(() => _loading = false);
        },
      ));

    final videoId = widget.customVideoId?.trim();
    if (videoId != null && videoId.isNotEmpty) {
      _controller.loadRequest(Uri.parse(_embedUrl(videoId)));
      return;
    }
    _controller.loadRequest(Uri.parse(_searchFallbackUrl));
    _loadTopVideos();
  }

  static String _embedUrl(String videoId) =>
      'https://www.youtube.com/embed/$videoId?autoplay=1&enablejsapi=1';

  Future<void> _loadTopVideos() async {
    final api = widget.api;
    if (api == null) return;
    try {
      final videos =
          await api.productVideos('${widget.productTitle} review');
      if (!mounted || videos.isEmpty) return;
      setState(() {
        _videos = videos;
        _index = 0;
        _loading = true;
      });
      await _controller.loadRequest(Uri.parse(_embedUrl(videos.first.videoId)));
    } catch (_) {
      // The search-playlist fallback is already playing; leave it be.
    }
  }

  void _showVideo(int index) {
    if (index < 0 || index >= _videos.length) return;
    uxTap();
    setState(() {
      _index = index;
      _loading = true;
    });
    _controller.loadRequest(Uri.parse(_embedUrl(_videos[index].videoId)));
  }

  @override
  Widget build(BuildContext context) {
    final video = _index < _videos.length ? _videos[_index] : null;
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
                      Text(
                        video == null
                            ? 'YouTube Video Review'
                            : video.channel.isEmpty
                                ? 'Top review ${_index + 1} of ${_videos.length}'
                                : '${video.channel} · ${_index + 1} of ${_videos.length}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 12),
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
          if (_videos.length > 1)
            Container(
              color: const Color(0xFF181818),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              child: Row(
                children: [
                  TextButton.icon(
                    key: const Key('video-review-previous'),
                    onPressed:
                        _index > 0 ? () => _showVideo(_index - 1) : null,
                    icon: const Icon(Icons.skip_previous, size: 20),
                    label: const Text('Previous'),
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.white,
                      disabledForegroundColor: Colors.white30,
                    ),
                  ),
                  const Spacer(),
                  if (video != null)
                    Expanded(
                      flex: 3,
                      child: Text(
                        video.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 12),
                      ),
                    ),
                  const Spacer(),
                  TextButton.icon(
                    key: const Key('video-review-next'),
                    onPressed: _index < _videos.length - 1
                        ? () => _showVideo(_index + 1)
                        : null,
                    icon: const Icon(Icons.skip_next, size: 20),
                    label: const Text('Next'),
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.white,
                      disabledForegroundColor: Colors.white30,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
