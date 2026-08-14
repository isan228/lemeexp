import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:provider/provider.dart";

import "../config/api_config.dart";
import "../config/theme.dart";
import "../providers/auth_provider.dart";
import "../utils/helpers.dart";
import "../widgets/common.dart";

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final progress = auth.progress;
    final pct = progress.totalVideos == 0 ? 0.0 : progress.percentage.clamp(0, 100);
    final days = normalizeLast7Days(progress);
    final chartMax = days.map((d) => d.seconds).fold<int>(1, (a, b) => a > b ? a : b);
    final continueLesson = auth.continueLesson();
    final fullAccess = hasFullAccess(auth.profile);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const PageKicker("Личный кабинет"),
            Text(
              auth.profile?.displayName ?? "Студент",
              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: "Поддержка",
            onPressed: () => context.push("/learning/support"),
            icon: Badge(
              isLabelVisible: auth.supportUnread > 0,
              label: Text("${auth.supportUnread}"),
              child: const Icon(Icons.chat_bubble_outline_rounded),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => auth.loadCatalog(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
          children: [
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text("Статистика", style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                      const Spacer(),
                      Text("${pct.round()}%", style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.primary)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    "${progress.completedCount} / ${progress.totalVideos} уроков",
                    style: const TextStyle(color: AppColors.textSecondary),
                  ),
                  const SizedBox(height: 10),
                  ProgressBarLine(percent: pct.toDouble()),
                  const SizedBox(height: 18),
                  const Text("7 дней", style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 120,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        for (final day in days)
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 3),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  Expanded(
                                    child: Align(
                                      alignment: Alignment.bottomCenter,
                                      child: day.seconds <= 0
                                          ? const SizedBox.shrink()
                                          : FractionallySizedBox(
                                              heightFactor: (day.seconds / chartMax).clamp(0.05, 1),
                                              widthFactor: 1,
                                              child: Container(
                                                decoration: BoxDecoration(
                                                  color: AppColors.primary,
                                                  borderRadius: BorderRadius.circular(8),
                                                ),
                                              ),
                                            ),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    watchHoursLabel(day.seconds),
                                    style: const TextStyle(fontSize: 9, color: AppColors.textMuted),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  Text(day.label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (continueLesson != null) ...[
              const SizedBox(height: 14),
              AppCard(
                onTap: () => context.push(
                  "/learning/lessons/${continueLesson.subject.id}/chapters/${continueLesson.chapter.id}/videos/${continueLesson.video.id}?resume=1",
                ),
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text("Продолжить урок", style: TextStyle(color: AppColors.textMuted, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 4),
                          Text(
                            continueLesson.video.title,
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          Text(
                            "${continueLesson.subject.title} · ${continueLesson.chapter.title}",
                            style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      width: 48,
                      height: 48,
                      decoration: const BoxDecoration(
                        color: AppColors.primary,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 30),
                    ),
                  ],
                ),
              ),
            ],
            if (!fullAccess) ...[
              const SizedBox(height: 14),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("Пробный доступ", style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 6),
                    const Text(
                      "Смотрите бесплатные уроки или оформите подписку на 1 месяц.",
                      style: TextStyle(color: AppColors.textSecondary),
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: () => context.push("/payment?plan=$kSubscriptionPlanId"),
                      child: Text(kGetAccessLabel),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: AppCard(
                    onTap: () => context.go("/learning/lessons"),
                    child: const Row(
                      children: [
                        Expanded(child: Text("Каталог уроков", style: TextStyle(fontWeight: FontWeight.w700))),
                        Icon(Icons.arrow_forward_rounded, color: AppColors.primary),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: AppCard(
                    onTap: () => context.push("/learning/support"),
                    child: const Row(
                      children: [
                        Expanded(child: Text("Вопросы", style: TextStyle(fontWeight: FontWeight.w700))),
                        Icon(Icons.arrow_forward_rounded, color: AppColors.primary),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
