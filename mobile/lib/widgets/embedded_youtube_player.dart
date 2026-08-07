import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

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

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) {
          if (mounted) setState(() => _loading = false);
        },
      ));
    // Without this, Android's WebView refuses the embed's autoplay and the
    // player just sits on its thumbnail looking broken.
    final platform = _controller.platform;
    if (platform is AndroidWebViewController) {
      platform.setMediaPlaybackRequiresUserGesture(false);
    }

    final videoId = widget.customVideoId?.trim();
    if (videoId != null && videoId.isNotEmpty) {
      _showEmbed('https://www.youtube.com/embed/$videoId'
          '?autoplay=1&playsinline=1&rel=0');
      return;
    }
    // Nothing loads until the right video is known: eagerly starting the
    // search-playlist fallback flashed "Video unavailable" at every open,
    // then jarringly swapped to the real review. The spinner holds the
    // screen instead, and the fallback only appears if the lookup fails.
    _loadTopVideos();
  }

  String get _searchFallbackEmbedUrl =>
      'https://www.youtube.com/embed?listType=search&list=${Uri.encodeComponent("${widget.productTitle} review")}&autoplay=1&playsinline=1';

  /// YouTube refuses to play inside a WebView that loads the embed URL bare —
  /// there is no embedding page, so playback dies with "Video unavailable".
  /// Hosting the embed in a real page with our own origin satisfies it.
  void _showEmbed(String embedUrl) {
    _controller.loadHtmlString(
      '''
<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}
iframe{border:0;width:100%;height:100%}</style>
</head>
<body>
<iframe src="$embedUrl"
  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
  allowfullscreen></iframe>
</body>
</html>
''',
      baseUrl: 'https://trolleyscout.co.za',
    );
  }

  Future<void> _loadTopVideos() async {
    final api = widget.api;
    if (api == null) {
      _showEmbed(_searchFallbackEmbedUrl);
      return;
    }
    try {
      final videos = await api.productVideos('${widget.productTitle} review');
      if (!mounted) return;
      if (videos.isEmpty) {
        _showEmbed(_searchFallbackEmbedUrl);
        return;
      }
      setState(() {
        _videos = videos;
        _index = 0;
        _loading = true;
      });
      _showEmbed('https://www.youtube.com/embed/${videos.first.videoId}'
          '?autoplay=1&playsinline=1&rel=0');
    } catch (_) {
      if (mounted) _showEmbed(_searchFallbackEmbedUrl);
    }
  }

  void _showVideo(int index) {
    if (index < 0 || index >= _videos.length) return;
    uxTap();
    setState(() {
      _index = index;
      _loading = true;
    });
    _showEmbed('https://www.youtube.com/embed/${_videos[index].videoId}'
        '?autoplay=1&playsinline=1&rel=0');
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
                    onPressed: _index > 0 ? () => _showVideo(_index - 1) : null,
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
