import "dart:async";

import "package:chewie/chewie.dart";
import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:provider/provider.dart";
import "package:video_player/video_player.dart";

import "../../config/api_config.dart";
import "../../config/theme.dart";
import "../../providers/auth_provider.dart";
import "../../services/api_client.dart";
import "../../utils/helpers.dart";
import "../../widgets/common.dart";

class VideoPlayerScreen extends StatefulWidget {
  const VideoPlayerScreen({
    super.key,
    required this.subjectId,
    required this.chapterId,
    required this.videoId,
    this.resume = false,
  });

  final int subjectId;
  final int chapterId;
  final int videoId;
  final bool resume;

  @override
  State<VideoPlayerScreen> createState() => _VideoPlayerScreenState();
}

class _VideoPlayerScreenState extends State<VideoPlayerScreen> with WidgetsBindingObserver {
  VideoPlayerController? _videoController;
  ChewieController? _chewieController;
  Timer? _saveTimer;
  Timer? _tokenRefreshTimer;
  String? _error;
  bool _loading = true;
  bool _refreshingToken = false;
  AuthProvider? _auth;
  int _durationSec = 0;
  bool _wasPlaying = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _initPlayer());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      unawaited(_persist(false));
    }
  }

  Future<void> _disposeControllers() async {
    _saveTimer?.cancel();
    _saveTimer = null;
    _tokenRefreshTimer?.cancel();
    _tokenRefreshTimer = null;
    final video = _videoController;
    final chewie = _chewieController;
    _videoController = null;
    _chewieController = null;
    video?.removeListener(_onTick);
    chewie?.dispose();
    await video?.dispose();
  }

  void _scheduleTokenRefresh(int expiresInSec) {
    _tokenRefreshTimer?.cancel();
    final refreshAfter = Duration(seconds: (expiresInSec - 45).clamp(30, expiresInSec));
    _tokenRefreshTimer = Timer(refreshAfter, () => unawaited(_refreshAccessToken()));
  }

  Future<void> _refreshAccessToken() async {
    if (_refreshingToken || !mounted) return;
    final auth = _auth;
    final old = _videoController;
    if (auth == null || old == null || !old.value.isInitialized) return;

    _refreshingToken = true;
    try {
      final position = old.value.position;
      final playing = old.value.isPlaying;
      final access = await auth.getVideoAccessToken(widget.videoId);
      if (!mounted) return;

      final url = auth.api.hlsManifestUrl(widget.videoId, access.token);
      final next = VideoPlayerController.networkUrl(Uri.parse(url));
      await next.initialize();
      if (!mounted) {
        await next.dispose();
        return;
      }

      await next.seekTo(position);
      if (playing) await next.play();

      final chewie = ChewieController(
        videoPlayerController: next,
        autoPlay: playing,
        looping: false,
        allowFullScreen: true,
        allowMuting: true,
        materialProgressColors: ChewieProgressColors(
          playedColor: AppColors.primary,
          handleColor: AppColors.accent,
          bufferedColor: AppColors.primaryWeak,
          backgroundColor: Colors.white24,
        ),
      );

      final prevChewie = _chewieController;
      final prevVideo = _videoController;
      prevVideo?.removeListener(_onTick);
      _videoController = next;
      _chewieController = chewie;
      next.addListener(_onTick);
      prevChewie?.dispose();
      await prevVideo?.dispose();

      _scheduleTokenRefresh(access.expiresIn);
      if (mounted) setState(() {});
    } catch (_) {
      // Keep current stream; try again soon.
      _tokenRefreshTimer = Timer(const Duration(seconds: 30), () => unawaited(_refreshAccessToken()));
    } finally {
      _refreshingToken = false;
    }
  }

  Future<void> _initPlayer() async {
    final auth = context.read<AuthProvider>();
    _auth = auth;
    final location = findVideoById(auth.chapters, widget.videoId);
    final video = location?.video;
    _durationSec = video?.duration ?? 0;

    if (video == null) {
      setState(() {
        _loading = false;
        _error = "Урок не найден.";
      });
      return;
    }
    if (video.locked) {
      setState(() {
        _loading = false;
        _error = "locked";
      });
      return;
    }
    if (isProcessingStream(video.streamPath)) {
      setState(() {
        _loading = false;
        _error = "Видео готовится к просмотру. Подождите 1–2 минуты.";
      });
      return;
    }
    if (!isPlayableStream(video.streamPath)) {
      setState(() {
        _loading = false;
        _error = "Видеофайл ещё не загружен.";
      });
      return;
    }

    VideoPlayerController? controller;
    ChewieController? chewie;
    try {
      final access = await auth.getVideoAccessToken(widget.videoId);
      final url = auth.api.hlsManifestUrl(widget.videoId, access.token);
      controller = VideoPlayerController.networkUrl(Uri.parse(url));
      await controller.initialize();

      if (!mounted) {
        await controller.dispose();
        return;
      }

      final mediaDuration = controller.value.duration.inSeconds;
      if (mediaDuration > 0) _durationSec = mediaDuration;

      final startAt = widget.resume
          ? getVideoWatchedSeconds(auth.progress.watchedSeconds, widget.videoId)
          : 0;
      final maxSeek = _durationSec > 5 ? _durationSec - 5 : _durationSec;
      if (startAt > 0 && (maxSeek <= 0 || startAt < maxSeek)) {
        await controller.seekTo(Duration(seconds: startAt));
      }

      chewie = ChewieController(
        videoPlayerController: controller,
        autoPlay: true,
        looping: false,
        allowFullScreen: true,
        allowMuting: true,
        materialProgressColors: ChewieProgressColors(
          playedColor: AppColors.primary,
          handleColor: AppColors.accent,
          bufferedColor: AppColors.primaryWeak,
          backgroundColor: Colors.white24,
        ),
      );

      if (!mounted) {
        chewie.dispose();
        await controller.dispose();
        return;
      }

      _videoController = controller;
      _chewieController = chewie;
      _saveTimer = Timer.periodic(const Duration(seconds: 15), (_) => _persist(false));
      controller.addListener(_onTick);
      _scheduleTokenRefresh(access.expiresIn);
      setState(() => _loading = false);
    } on ApiException catch (e) {
      chewie?.dispose();
      await controller?.dispose();
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    } catch (_) {
      chewie?.dispose();
      await controller?.dispose();
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = "Не удалось запустить видео.";
      });
    }
  }

  void _onTick() {
    final c = _videoController;
    if (c == null || !c.value.isInitialized) return;
    final playing = c.value.isPlaying;
    if (_wasPlaying && !playing) {
      unawaited(_persist(false));
    }
    _wasPlaying = playing;
  }

  Future<void> _persist(bool refresh) async {
    final c = _videoController;
    final auth = _auth;
    if (c == null || !c.value.isInitialized || auth == null) return;
    final seconds = c.value.position.inSeconds;
    if (seconds <= 0) return;
    try {
      await auth.saveVideoPosition(widget.videoId, seconds, _durationSec);
      if (refresh) await auth.refreshProgress();
    } catch (_) {
      // ignore transient save errors
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _saveTimer?.cancel();
    _tokenRefreshTimer?.cancel();
    final c = _videoController;
    final auth = _auth;
    if (c != null && c.value.isInitialized && auth != null) {
      final seconds = c.value.position.inSeconds;
      if (seconds > 0) {
        unawaited(auth.saveVideoPosition(widget.videoId, seconds, _durationSec));
      }
    }
    unawaited(_disposeControllers());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final location = findVideoById(auth.chapters, widget.videoId);
    final subject = location?.subject;
    final chapter = location?.chapter;
    final video = location?.video;
    final videos = chapter?.videos ?? const [];
    final index = videos.indexWhere((v) => v.id == widget.videoId);
    final favorite = auth.isVideoFavorite(widget.videoId);

    if (_error == "locked") {
      return Scaffold(
        appBar: AppBar(title: Text(video?.title ?? "Урок")),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: EmptyState(
            message: video?.title ?? "Урок по подписке",
            hint: "Этот урок доступен только по подписке.",
            actionLabel: kGetAccessLabel,
            onAction: () => context.push("/payment?plan=$kSubscriptionPlanId"),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(video?.title ?? "Урок", overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            onPressed: () async {
              try {
                await auth.toggleFavorite(widget.videoId);
              } catch (e) {
                if (!mounted) return;
                final messenger = ScaffoldMessenger.of(this.context);
                messenger.showSnackBar(SnackBar(content: Text("$e")));
              }
            },
            icon: Icon(
              favorite ? Icons.star_rounded : Icons.star_outline_rounded,
              color: favorite ? const Color(0xFFF59E0B) : null,
            ),
          ),
          IconButton(
            tooltip: "Вопрос ментору",
            onPressed: () => context.push(
              "/learning/support?videoId=${widget.videoId}&videoTitle=${Uri.encodeComponent(video?.title ?? "")}",
            ),
            icon: const Icon(Icons.chat_bubble_outline_rounded),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
        children: [
          AspectRatio(
            aspectRatio: 16 / 9,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: ColoredBox(
                color: const Color(0xFF0A0F0E),
                child: _loading
                    ? const Center(child: CircularProgressIndicator(color: Colors.white))
                    : _error != null
                        ? Center(
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Text(
                                _error!,
                                textAlign: TextAlign.center,
                                style: const TextStyle(color: Colors.white),
                              ),
                            ),
                          )
                        : _chewieController == null
                            ? const SizedBox.shrink()
                            : Chewie(controller: _chewieController!),
              ),
            ),
          ),
          const SizedBox(height: 14),
          if (subject != null && chapter != null)
            Text(
              "${subject.title} · ${chapter.title}",
              style: const TextStyle(color: AppColors.textSecondary),
            ),
          const SizedBox(height: 6),
          Text(
            video?.title ?? "",
            style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
          ),
          if ((video?.duration ?? 0) > 0 || _durationSec > 0) ...[
            const SizedBox(height: 4),
            Text(
              formatWatchDuration(_durationSec > 0 ? _durationSec : video!.duration),
              style: const TextStyle(color: AppColors.textMuted),
            ),
          ],
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: index > 0
                      ? () {
                          final prev = videos[index - 1];
                          context.pushReplacement(
                            "/learning/lessons/${widget.subjectId}/chapters/${widget.chapterId}/videos/${prev.id}",
                          );
                        }
                      : null,
                  icon: const Icon(Icons.skip_previous_rounded),
                  label: const Text("Пред."),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: index >= 0 && index < videos.length - 1
                      ? () {
                          final next = videos[index + 1];
                          if (next.locked) {
                            context.push("/payment?plan=$kSubscriptionPlanId");
                            return;
                          }
                          context.pushReplacement(
                            "/learning/lessons/${widget.subjectId}/chapters/${widget.chapterId}/videos/${next.id}",
                          );
                        }
                      : null,
                  icon: const Icon(Icons.skip_next_rounded),
                  label: const Text("След."),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
