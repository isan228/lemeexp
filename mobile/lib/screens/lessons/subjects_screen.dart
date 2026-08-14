import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:provider/provider.dart";

import "../../config/theme.dart";
import "../../providers/auth_provider.dart";
import "../../utils/helpers.dart";
import "../../widgets/common.dart";

class SubjectsScreen extends StatelessWidget {
  const SubjectsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final chapters = auth.chapters;
    final watched = auth.progress.watchedSeconds;
    final completed = auth.progress.videoCompleted;

    return Scaffold(
      appBar: AppBar(
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PageKicker("Каталог"),
            Text("Предметы"),
          ],
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => auth.loadCatalog(),
        child: auth.catalogLoading && chapters.isEmpty
            ? ListView(children: const [LoadingBlock(label: "Загрузка каталога…")])
            : auth.catalogError.isNotEmpty && chapters.isEmpty
                ? ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      EmptyState(
                        message: auth.catalogError,
                        actionLabel: "Повторить",
                        onAction: () => auth.loadCatalog(),
                      ),
                    ],
                  )
                : chapters.isEmpty
                    ? ListView(
                        padding: const EdgeInsets.all(16),
                        children: const [
                          EmptyState(
                            message: "Каталог пока пуст.",
                            hint: "Новые предметы появятся после публикации.",
                          ),
                        ],
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                        itemCount: chapters.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 10),
                        itemBuilder: (context, index) {
                          final subject = chapters[index];
                          final pct = getSubjectWatchProgressPercent(subject, watched, completed);
                          return AppCard(
                            onTap: () => context.push("/learning/lessons/${subject.id}"),
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
                                            Text(subject.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                                            Text(
                                              "${subject.subtopics.length} глав · ${subject.videoCount} уроков${pct > 0 ? " · $pct%" : ""}",
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
      ),
    );
  }
}
