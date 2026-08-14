import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:provider/provider.dart";

import "../../config/theme.dart";
import "../../providers/auth_provider.dart";

class MainShell extends StatelessWidget {
  const MainShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  static const _tabs = [
    (label: "Главная", icon: Icons.home_outlined, active: Icons.home_rounded),
    (label: "Уроки", icon: Icons.menu_book_outlined, active: Icons.menu_book_rounded),
    (label: "Избранное", icon: Icons.star_outline_rounded, active: Icons.star_rounded),
    (label: "Рейтинг", icon: Icons.emoji_events_outlined, active: Icons.emoji_events_rounded),
    (label: "Профиль", icon: Icons.person_outline_rounded, active: Icons.person_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.toString();
    final hideNav = location.contains("/videos/");
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: hideNav
          ? null
          : NavigationBar(
              selectedIndex: navigationShell.currentIndex,
              onDestinationSelected: (index) {
                navigationShell.goBranch(
                  index,
                  initialLocation: index == navigationShell.currentIndex,
                );
              },
              destinations: [
                for (var i = 0; i < _tabs.length; i++)
                  NavigationDestination(
                    icon: Icon(_tabs[i].icon),
                    selectedIcon: Icon(_tabs[i].active),
                    label: _tabs[i].label,
                  ),
              ],
            ),
      floatingActionButton: hideNav
          ? null
          : FloatingActionButton.extended(
              onPressed: () => context.push("/learning/support"),
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              icon: Badge(
                isLabelVisible: auth.supportUnread > 0,
                label: Text("${auth.supportUnread}"),
                child: const Icon(Icons.chat_bubble_outline_rounded),
              ),
              label: const Text("Ментор"),
            ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
    );
  }
}
