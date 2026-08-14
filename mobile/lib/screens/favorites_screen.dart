import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:provider/provider.dart";

import "../config/theme.dart";
import "../models/models.dart";
import "../providers/auth_provider.dart";
import "../utils/helpers.dart";
import "../widgets/common.dart";

class FavoritesScreen extends StatelessWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final items = <({FavoriteItem item, VideoLocation loc})>[];
    for (final item in auth.favoriteItems) {
      final loc = findVideoById(auth.chapters, item.videoId);
      if (loc != null) items.add((item: item, loc: loc));
    }

    return Scaffold(
      appBar: AppBar(
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PageKicker("Коллекция"),
            Text("Избранное"),
          ],
        ),
      ),
      body: auth.catalogLoading && auth.chapters.isEmpty
          ? const LoadingBlock()
          : items.isEmpty
              ? ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    EmptyState(
                      message: "Пока нет избранных уроков.",
                      hint: "Нажмите ★ на странице урока, чтобы добавить.",
                      actionLabel: "К каталогу",
                      onAction: () => context.go("/learning/lessons"),
                    ),
                  ],
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final row = items[index];
                    final video = row.loc.video;
                    return AppCard(
                      onTap: () => context.push(
                        "/learning/lessons/${row.loc.subject.id}/chapters/${row.loc.chapter.id}/videos/${video.id}",
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.star_rounded, color: Color(0xFFF59E0B)),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(video.title, style: const TextStyle(fontWeight: FontWeight.w800)),
                                Text(
                                  "${row.loc.subject.title} · ${row.loc.chapter.title}${video.duration > 0 ? " · ${formatWatchDuration(video.duration)}" : ""}",
                                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right_rounded, color: AppColors.primary),
                        ],
                      ),
                    );
                  },
                ),
    );
  }
}
