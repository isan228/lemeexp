import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:provider/provider.dart";

import "../config/api_config.dart";
import "../config/theme.dart";
import "../providers/auth_provider.dart";
import "../utils/helpers.dart";
import "../widgets/common.dart";

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  static const planLabels = {
    "free": "Пробный доступ",
    "basic": "Базовый",
    "pro": "Продвинутый",
    "premium": "Подписка",
    "mentor": "Ментор",
    "admin": "Администратор",
  };

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final profile = auth.profile;
    final progress = auth.progress;
    final fullAccess = hasFullAccess(profile);
    final type = profile?.subscriptionType ?? "free";
    final plan = fullAccess ? (planLabels[type] ?? type) : planLabels["free"]!;
    final expiry = formatSubscriptionExpiry(profile?.subscriptionExpiresAt);
    final pct = progress.totalVideos == 0 ? 0.0 : progress.percentage.clamp(0, 100);
    final weekSeconds = normalizeLast7Days(progress).fold<int>(0, (a, b) => a + b.seconds);

    return Scaffold(
      appBar: AppBar(
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PageKicker("Профиль"),
            Text("Аккаунт"),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
        children: [
          AppCard(
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: AppColors.primaryWeak,
                  foregroundColor: AppColors.primaryHover,
                  child: Text(
                    profile?.initial ?? "?",
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 22),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        profile?.displayName ?? "Студент",
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      Text(profile?.email ?? "—", style: const TextStyle(color: AppColors.textSecondary)),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.primaryWeak,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(plan, style: const TextStyle(color: AppColors.primaryHover, fontWeight: FontWeight.w700, fontSize: 12)),
                      ),
                      if (fullAccess && expiry != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text("до $expiry", style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _Stat(value: "${pct.round()}%", label: "Пройдено")),
              const SizedBox(width: 10),
              Expanded(
                child: _Stat(
                  value: "${progress.completedCount}/${progress.totalVideos}",
                  label: "Уроков",
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _Stat(value: formatWatchDuration(weekSeconds), label: "За 7 дней")),
              const SizedBox(width: 10),
              Expanded(
                child: _Stat(
                  value: "${auth.chapters.length}",
                  label: "Предметов",
                ),
              ),
            ],
          ),
          if (!fullAccess) ...[
            const SizedBox(height: 14),
            FilledButton(
              onPressed: () => context.push("/payment?plan=$kSubscriptionPlanId"),
              child: Text(kGetAccessLabel),
            ),
          ],
          const SizedBox(height: 14),
          AppCard(
            onTap: () => context.push("/learning/support"),
            child: const Row(
              children: [
                Icon(Icons.support_agent_rounded, color: AppColors.primary),
                SizedBox(width: 12),
                Expanded(child: Text("Чат с ментором", style: TextStyle(fontWeight: FontWeight.w700))),
                Icon(Icons.chevron_right_rounded),
              ],
            ),
          ),
          const SizedBox(height: 10),
          OutlinedButton(
            onPressed: () async {
              await auth.logout();
              if (!context.mounted) return;
              context.go("/");
            },
            child: const Text("Выйти"),
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
        ],
      ),
    );
  }
}
