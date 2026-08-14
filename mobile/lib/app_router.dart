import "package:go_router/go_router.dart";

import "providers/auth_provider.dart";
import "screens/favorites_screen.dart";
import "screens/home_screen.dart";
import "screens/landing_screen.dart";
import "screens/leaderboard_screen.dart";
import "screens/lessons/chapters_screen.dart";
import "screens/lessons/subjects_screen.dart";
import "screens/lessons/video_player_screen.dart";
import "screens/lessons/videos_screen.dart";
import "screens/login_screen.dart";
import "screens/payment_screen.dart";
import "screens/payment_success_screen.dart";
import "screens/profile_screen.dart";
import "screens/register_screen.dart";
import "screens/shell/main_shell.dart";
import "screens/splash_screen.dart";
import "screens/support_screen.dart";

GoRouter createRouter(AuthProvider auth) {
  return GoRouter(
    initialLocation: "/splash",
    refreshListenable: auth,
    redirect: (context, state) {
      final loc = state.matchedLocation;
      if (!auth.hydrated) {
        return loc == "/splash" ? null : "/splash";
      }
      if (loc == "/splash") {
        return auth.isLoggedIn ? "/learning/home" : "/";
      }

      final public = {"/", "/login", "/register", "/payment", "/payment/success"};
      final isPublic = public.contains(loc) || loc.startsWith("/payment");

      if (!auth.isLoggedIn && !isPublic) return "/login";
      if (auth.isLoggedIn && (loc == "/login" || loc == "/register" || loc == "/")) {
        return "/learning/home";
      }
      return null;
    },
    routes: [
      GoRoute(path: "/splash", builder: (_, _) => const SplashScreen()),
      GoRoute(path: "/", builder: (_, _) => const LandingScreen()),
      GoRoute(path: "/login", builder: (_, _) => const LoginScreen()),
      GoRoute(
        path: "/register",
        builder: (context, state) {
          final trial = state.uri.queryParameters["intent"] == "trial";
          return RegisterScreen(isTrial: trial);
        },
      ),
      GoRoute(
        path: "/payment",
        builder: (context, state) => PaymentScreen(plan: state.uri.queryParameters["plan"]),
      ),
      GoRoute(
        path: "/payment/success",
        builder: (context, state) =>
            PaymentSuccessScreen(paymentId: state.uri.queryParameters["paymentId"]),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => MainShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(path: "/learning/home", builder: (_, _) => const HomeScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: "/learning/lessons",
                builder: (_, _) => const SubjectsScreen(),
                routes: [
                  GoRoute(
                    path: ":subjectId",
                    builder: (context, state) {
                      final sid = int.tryParse(state.pathParameters["subjectId"] ?? "") ?? 0;
                      return ChaptersScreen(subjectId: sid);
                    },
                    routes: [
                      GoRoute(
                        path: "chapters/:chapterId",
                        builder: (context, state) {
                          final sid = int.tryParse(state.pathParameters["subjectId"] ?? "") ?? 0;
                          final cid = int.tryParse(state.pathParameters["chapterId"] ?? "") ?? 0;
                          return VideosScreen(subjectId: sid, chapterId: cid);
                        },
                        routes: [
                          GoRoute(
                            path: "videos/:videoId",
                            builder: (context, state) {
                              final sid = int.tryParse(state.pathParameters["subjectId"] ?? "") ?? 0;
                              final cid = int.tryParse(state.pathParameters["chapterId"] ?? "") ?? 0;
                              final vid = int.tryParse(state.pathParameters["videoId"] ?? "") ?? 0;
                              final resume = state.uri.queryParameters["resume"] == "1";
                              return VideoPlayerScreen(
                                subjectId: sid,
                                chapterId: cid,
                                videoId: vid,
                                resume: resume,
                              );
                            },
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: "/learning/favorites", builder: (_, _) => const FavoritesScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: "/learning/leaderboard", builder: (_, _) => const LeaderboardScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: "/learning/profile", builder: (_, _) => const ProfileScreen()),
            ],
          ),
        ],
      ),
      GoRoute(
        path: "/learning/support",
        builder: (context, state) {
          final videoId = int.tryParse(state.uri.queryParameters["videoId"] ?? "");
          final videoTitle = state.uri.queryParameters["videoTitle"];
          return SupportScreen(videoId: videoId, videoTitle: videoTitle);
        },
      ),
    ],
  );
}
