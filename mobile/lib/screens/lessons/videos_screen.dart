import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:provider/provider.dart";

import "../../config/api_config.dart";
import "../../config/theme.dart";
import "../../models/models.dart";
import "../../providers/auth_provider.dart";
import "../../utils/helpers.dart";
import "../../widgets/common.dart";

class VideosScreen extends StatelessWidget {
  const VideosScreen({super.key, required this.subjectId, required this.chapterId});

  final int subjectId;
  final int chapterId;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    LessonSubject? subject;
    for (final s in auth.chapters) {
      if (s.id == subjectId) {
        subject = s;
        break;
      }
    }
    LessonChapter? chapter;
    if (subject != null) {
      for (final c in subject.subtopics) {
        if (c.id == chapterId) {
          chapter = c;
          break;
        }
      }
    }

    if (auth.catalogLoading && auth.chapters.isEmpty) {
      return const Scaffold(body: LoadingBlock());
    }
    if (subject == null || chapter == null) {
      return Scaffold(
        appBar: AppBar(title: const Text("Уроки")),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: EmptyState(
            message: "Раздел не найден.",
            actionLabel: "К предметам",
            onAction: () => context.go("/learning/lessons"),
          ),
        ),
      );
    }

    final resolvedSubject = subject;
    final resolvedChapter = chapter;
    final watched = auth.progress.watchedSeconds;
    final completedMap = auth.progress.videoCompleted;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(resolvedSubject.title, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
            Text(resolvedChapter.title, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
      body: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
        itemCount: resolvedChapter.videos.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          final video = resolvedChapter.videos[index];
          final watchedSec = getVideoWatchedSeconds(watched, video.id);
          final pct = getVideoWatchProgressPercent(
            watchedSeconds: watchedSec,
            durationSeconds: video.duration,
            videoCompleted: completedMap,
            videoId: video.id,
          );
          final done = pct >= 100;
          final favorite = auth.isVideoFavorite(video.id);
          final ready = isPlayableStream(video.streamPath) && !isProcessingStream(video.streamPath);

          return AppCard(
            onTap: () {
              if (video.locked) {
                context.push("/payment?plan=$kSubscriptionPlanId");
                return;
              }
              if (!ready) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text("Видео ещё готовится к просмотру")),
                );
                return;
              }
              context.push("/learning/lessons/$subjectId/chapters/$chapterId/videos/${video.id}");
            },
            padding: EdgeInsets.zero,
            child: Stack(
              children: [
                Positioned.fill(
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: FractionallySizedBox(
                      widthFactor: pct / 100,
                      child: Container(color: AppColors.primaryWeak.withValues(alpha: 0.5)),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: video.locked
                              ? AppColors.borderSoft
                              : done
                                  ? const Color(0xFFDCFCE7)
                                  : AppColors.primaryWeak,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          video.locked
                              ? Icons.lock_rounded
                              : done
                                  ? Icons.check_rounded
                                  : Icons.play_arrow_rounded,
                          color: video.locked
                              ? AppColors.textMuted
                              : done
                                  ? const Color(0xFF16A34A)
                                  : AppColors.primary,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(video.title, style: const TextStyle(fontWeight: FontWeight.w800)),
                            const SizedBox(height: 2),
                            Text(
                              [
                                if (video.duration > 0) formatWatchDuration(video.duration),
                                if (pct > 0) "$pct%",
                                if (video.isTrial) "пробный",
                                if (video.locked) "по подписке",
                              ].join(" · "),
                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: video.locked
                            ? null
                            : () async {
                                try {
                                  await auth.toggleFavorite(video.id);
                                } catch (e) {
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text("$e")),
                                  );
                                }
                              },
                        icon: Icon(
                          favorite ? Icons.star_rounded : Icons.star_outline_rounded,
                          color: favorite ? const Color(0xFFF59E0B) : AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
