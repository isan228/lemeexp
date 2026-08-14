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

class _VideoPlayerScreenState extends State<VideoPlayerScreen> {
  VideoPlayerController? _videoController;
  ChewieController? _chewieController;
  Timer? _saveTimer;
  String? _error;
  bool _loading = true;
  AuthProvider? _auth;
  int _durationSec = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _initPlayer());
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

    try {
      final accessToken = await auth.getVideoAccessToken(widget.videoId);
      final url = auth.api.hlsManifestUrl(widget.videoId, accessToken);
      final controller = VideoPlayerController.networkUrl(Uri.parse(url));
      await controller.initialize();

      final startAt = widget.resume
          ? getVideoWatchedSeconds(auth.progress.watchedSeconds, widget.videoId)
          : 0;
      if (startAt > 0 && startAt < (video.duration > 0 ? video.duration - 5 : 1 << 30)) {
        await controller.seekTo(Duration(seconds: startAt));
      }

      final chewie = ChewieController(
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

      _videoController = controller;
      _chewieController = chewie;
      _saveTimer = Timer.periodic(const Duration(seconds: 15), (_) => _persist(false));
      controller.addListener(_onTick);

      if (!mounted) return;
      setState(() => _loading = false);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    } catch (_) {
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
    // no-op; periodic timer handles saves
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
    _saveTimer?.cancel();
    _videoController?.removeListener(_onTick);
    final c = _videoController;
    final auth = _auth;
    if (c != null && c.value.isInitialized && auth != null) {
      final seconds = c.value.position.inSeconds;
      if (seconds > 0) {
        unawaited(auth.saveVideoPosition(widget.videoId, seconds, _durationSec));
      }
    }
    _chewieController?.dispose();
    _videoController?.dispose();
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
          if (video != null && video.duration > 0) ...[
            const SizedBox(height: 4),
            Text(formatWatchDuration(video.duration), style: const TextStyle(color: AppColors.textMuted)),
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
