import "package:flutter/material.dart";
import "package:go_router/go_router.dart";

import "../config/api_config.dart";
import "../config/theme.dart";
import "../widgets/common.dart";

class LandingScreen extends StatelessWidget {
  const LandingScreen({super.key});

  static const _subjects = [
    "Биохимия",
    "Иммунология",
    "Микробиология",
    "Патология",
    "Фармакология",
    "Кардиология",
    "Нейросайнс",
    "Анатомия",
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                child: Row(
                  children: [
                    const Expanded(child: BrandMark()),
                    TextButton(
                      onPressed: () => context.push("/login"),
                      child: const Text("Войти"),
                    ),
                  ],
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 28, 20, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(22),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(20),
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xFF0F1F35), AppColors.primaryHover, AppColors.primary],
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            "Подготовка к USMLE\nна русском",
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                              height: 1.2,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            "Видеоуроки, прогресс и чат с ментором — в удобном мобильном формате.",
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.88), height: 1.45),
                          ),
                          const SizedBox(height: 20),
                          FilledButton(
                            style: FilledButton.styleFrom(
                              backgroundColor: Colors.white,
                              foregroundColor: AppColors.primaryHover,
                            ),
                            onPressed: () => context.push("/register?intent=trial"),
                            child: const Text("Попробовать бесплатно"),
                          ),
                          const SizedBox(height: 10),
                          OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.white,
                              side: BorderSide(color: Colors.white.withValues(alpha: 0.5)),
                            ),
                            onPressed: () => context.push("/register"),
                            child: Text(kGetAccessLabel),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                    const PageKicker("Что внутри"),
                    const SizedBox(height: 8),
                    Text(
                      "Платформа $kSiteName",
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 12),
                    const _Benefit(icon: Icons.play_circle_outline, text: "Видеоуроки по ключевым предметам"),
                    const _Benefit(icon: Icons.support_agent_outlined, text: "Менторская поддержка"),
                    const _Benefit(icon: Icons.insights_outlined, text: "Прогресс и рейтинг за неделю"),
                    const SizedBox(height: 22),
                    const PageKicker("Предметы"),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final s in _subjects)
                          Chip(
                            label: Text(s),
                            backgroundColor: AppColors.primaryWeak,
                            side: BorderSide.none,
                            labelStyle: const TextStyle(
                              color: AppColors.primaryHover,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 28),
                    AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            "Уже есть аккаунт?",
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            "Войдите, чтобы продолжить обучение с телефона.",
                            style: TextStyle(color: AppColors.textSecondary),
                          ),
                          const SizedBox(height: 14),
                          FilledButton(
                            onPressed: () => context.push("/login"),
                            child: const Text("Войти в кабинет"),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Benefit extends StatelessWidget {
  const _Benefit({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.primaryWeak,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: AppColors.primary),
          ),
          const SizedBox(width: 12),
          Expanded(child: Text(text, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}
