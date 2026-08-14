import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../config/theme.dart";
import "../models/models.dart";
import "../providers/auth_provider.dart";
import "../utils/helpers.dart";
import "../widgets/common.dart";

class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({super.key});

  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen> {
  LeaderboardData? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await context.read<AuthProvider>().loadLeaderboard();
      if (!mounted) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = "$e";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PageKicker("Соревнование"),
            Text("Рейтинг за неделю"),
          ],
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? ListView(children: const [LoadingBlock(label: "Загрузка рейтинга…")])
            : _error != null
                ? ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      EmptyState(message: _error!, actionLabel: "Повторить", onAction: _load),
                    ],
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                    children: [
                      if (_data?.currentRank != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text(
                            "Ваше место: #${_data!.currentRank}",
                            style: const TextStyle(color: AppColors.textSecondary, fontWeight: FontWeight.w600),
                          ),
                        ),
                      if (_data?.entries.isEmpty ?? true)
                        const EmptyState(
                          message: "Пока никто не смотрел уроки на этой неделе.",
                          hint: "Будьте первым!",
                        )
                      else
                        AppCard(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Column(
                            children: [
                              for (final entry in _data!.entries)
                                ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor: entry.rank <= 3 ? AppColors.primary : AppColors.primaryWeak,
                                    foregroundColor: entry.rank <= 3 ? Colors.white : AppColors.primaryHover,
                                    child: Text("${entry.rank}", style: const TextStyle(fontWeight: FontWeight.w800)),
                                  ),
                                  title: Text(
                                    entry.isCurrentUser ? "Вы" : entry.nickname,
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      color: entry.isCurrentUser ? AppColors.primaryHover : AppColors.text,
                                    ),
                                  ),
                                  trailing: Text(
                                    formatWatchDuration(entry.seconds),
                                    style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.textSecondary),
                                  ),
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
      ),
    );
  }
}
