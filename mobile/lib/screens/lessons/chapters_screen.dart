import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:provider/provider.dart";

import "../../config/theme.dart";
import "../../models/models.dart";
import "../../providers/auth_provider.dart";
import "../../utils/helpers.dart";
import "../../widgets/common.dart";

class ChaptersScreen extends StatelessWidget {
  const ChaptersScreen({super.key, required this.subjectId});

  final int subjectId;

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
    final watched = auth.progress.watchedSeconds;
    final completed = auth.progress.videoCompleted;

    if (auth.catalogLoading && auth.chapters.isEmpty) {
      return const Scaffold(body: LoadingBlock());
    }
    if (subject == null) {
      return Scaffold(
        appBar: AppBar(title: const Text("Главы")),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: EmptyState(
            message: "Предмет не найден.",
            actionLabel: "К предметам",
            onAction: () => context.go("/learning/lessons"),
          ),
        ),
      );
    }

    final resolved = subject;
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const PageKicker("Главы"),
            Text(resolved.title, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
      body: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
        itemCount: resolved.subtopics.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          final chapter = resolved.subtopics[index];
          final pct = getChapterWatchProgressPercent(chapter.videos, watched, completed);
          return AppCard(
            onTap: () => context.push("/learning/lessons/${resolved.id}/chapters/${chapter.id}"),
            padding: EdgeInsets.zero,
            child: Stack(
              children: [
                Positioned.fill(
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: FractionallySizedBox(
                      widthFactor: pct / 100,
                      child: Container(color: AppColors.primaryWeak.withValues(alpha: 0.55)),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: AppColors.primaryWeak,
                        foregroundColor: AppColors.primaryHover,
                        child: Text("${index + 1}", style: const TextStyle(fontWeight: FontWeight.w800)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(chapter.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                            Text(
                              "${chapter.videos.length} уроков${pct > 0 ? " · $pct%" : ""}",
                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right_rounded, color: AppColors.primary),
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
