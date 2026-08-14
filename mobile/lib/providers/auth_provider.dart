import "package:flutter/foundation.dart";

import "../models/models.dart";
import "../services/api_client.dart";
import "../services/session_storage.dart";
import "../utils/helpers.dart";

class AuthProvider extends ChangeNotifier {
  AuthProvider({SessionStorage? storage, ApiClient? api}) : _storage = storage ?? SessionStorage() {
    _api = api ?? ApiClient(_storage);
  }

  final SessionStorage _storage;
  late final ApiClient _api;

  ApiClient get api => _api;

  bool hydrated = false;
  bool catalogLoading = false;
  String catalogError = "";
  String? token;
  UserProfile? profile;
  List<LessonSubject> chapters = const [];
  LearningProgress progress = LearningProgress.empty;
  List<FavoriteItem> favoriteItems = const [];
  int supportUnread = 0;

  bool get isLoggedIn => (token ?? "").isNotEmpty && profile != null;

  Future<void> bootstrap() async {
    final session = await _storage.readSession();
    token = session.token;
    profile = session.profile;
    await _api.hydrate(session.token, session.refresh);
    hydrated = true;
    notifyListeners();
    if (isLoggedIn) {
      await loadCatalog();
      await refreshSupportUnread();
    }
  }

  Future<void> _persistAuth(String nextToken, String nextRefresh, UserProfile? nextProfile) async {
    token = nextToken;
    profile = nextProfile;
    _api.setTokens(nextToken, nextRefresh);
    await _storage.saveSession(token: nextToken, refreshToken: nextRefresh, profile: nextProfile);
    notifyListeners();
  }

  Future<UserProfile> login(String email, String password) async {
    final res = await _api.request(
      "POST",
      "/auth/login",
      body: {"email": email.trim(), "password": password},
      auth: false,
      retry: false,
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      _api.throwFrom(res, "Неверный email или пароль");
    }
    final data = await _api.decodeMap(res);
    final nextProfile = UserProfile.fromJson(Map<String, dynamic>.from(data["profile"] as Map));
    await _persistAuth(
      data["token"] as String? ?? "",
      data["refreshToken"] as String? ?? "",
      nextProfile,
    );
    await loadCatalog();
    await refreshSupportUnread();
    return nextProfile;
  }

  Future<UserProfile> register(String email, String password, String nickname) async {
    final res = await _api.request(
      "POST",
      "/auth/register",
      body: {
        "email": email.trim(),
        "password": password,
        "nickname": nickname.trim(),
      },
      auth: false,
      retry: false,
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      _api.throwFrom(res, "Регистрация не удалась");
    }
    final data = await _api.decodeMap(res);
    final nextProfile = UserProfile.fromJson(Map<String, dynamic>.from(data["profile"] as Map));
    await _persistAuth(
      data["token"] as String? ?? "",
      data["refreshToken"] as String? ?? "",
      nextProfile,
    );
    await loadCatalog();
    return nextProfile;
  }

  Future<void> logout() async {
    try {
      final session = await _storage.readSession();
      if (session.refresh.isNotEmpty) {
        await _api.request(
          "POST",
          "/auth/logout",
          body: {"refreshToken": session.refresh},
          auth: false,
          retry: false,
        );
      }
    } catch (_) {
      // ignore network errors on logout
    }
    token = null;
    profile = null;
    chapters = const [];
    progress = LearningProgress.empty;
    favoriteItems = const [];
    supportUnread = 0;
    catalogError = "";
    catalogLoading = false;
    _api.clearTokens();
    await _storage.clear();
    notifyListeners();
  }

  void updateProfile(UserProfile? next) {
    profile = next;
    _storage.saveSession(token: token ?? "", profile: next);
    notifyListeners();
  }

  Future<void> loadCatalog() async {
    if (!isLoggedIn) {
      catalogLoading = false;
      catalogError = "";
      notifyListeners();
      return;
    }
    final initial = chapters.isEmpty;
    if (initial) {
      catalogLoading = true;
      notifyListeners();
    }
    try {
      final chaptersRes = await _api.request("GET", "/chapters");
      final progressRes = await _api.request("GET", "/progress");
      final favoritesRes = await _api.request("GET", "/favorites");

      if (chaptersRes.statusCode == 200) {
        final raw = await _api.decode(chaptersRes);
        if (raw is List) {
          chapters = raw
              .whereType<Map>()
              .map((e) => LessonSubject.fromJson(Map<String, dynamic>.from(e)))
              .toList();
        }
        catalogError = "";
      } else if (chaptersRes.statusCode == 401) {
        catalogError = "Сессия истекла. Войдите снова.";
      } else {
        catalogError = "Не удалось загрузить каталог уроков.";
      }

      if (progressRes.statusCode == 200) {
        progress = LearningProgress.fromJson(await _api.decodeMap(progressRes));
      }
      if (favoritesRes.statusCode == 200) {
        _applyFavorites(await _api.decodeMap(favoritesRes));
      }
    } catch (_) {
      catalogError = "Не удалось загрузить каталог. Проверьте соединение.";
    } finally {
      catalogLoading = false;
      notifyListeners();
    }
  }

  void _applyFavorites(Map<String, dynamic> data) {
    if (data["items"] is List) {
      favoriteItems = (data["items"] as List)
          .whereType<Map>()
          .map((e) => FavoriteItem.fromJson(Map<String, dynamic>.from(e)))
          .toList();
      return;
    }
    if (data["videoIds"] is List) {
      favoriteItems = (data["videoIds"] as List)
          .map((id) => FavoriteItem(videoId: (id as num).toInt()))
          .toList();
    }
  }

  Future<void> refreshProgress() async {
    if (!isLoggedIn) return;
    final res = await _api.request("GET", "/progress", retry: false);
    if (res.statusCode == 200) {
      progress = LearningProgress.fromJson(await _api.decodeMap(res));
      notifyListeners();
    }
  }

  bool isVideoFavorite(int videoId) => favoriteItems.any((e) => e.videoId == videoId);

  Future<bool> toggleFavorite(int videoId) async {
    final res = await _api.request("POST", "/videos/$videoId/favorite");
    if (res.statusCode < 200 || res.statusCode >= 300) {
      _api.throwFrom(res, "Не удалось обновить избранное");
    }
    final data = await _api.decodeMap(res);
    if (data["videoIds"] is List) {
      final prev = {for (final item in favoriteItems) item.videoId: item};
      favoriteItems = (data["videoIds"] as List).map((id) {
        final numId = (id as num).toInt();
        return prev[numId] ?? FavoriteItem(videoId: numId, createdAt: DateTime.now().toIso8601String());
      }).toList();
      notifyListeners();
    } else {
      await loadCatalog();
    }
    return data["favorited"] == true;
  }

  Future<void> refreshSupportUnread() async {
    if (!isLoggedIn) return;
    final res = await _api.request("GET", "/support/unread", retry: false);
    if (res.statusCode == 200) {
      final data = await _api.decodeMap(res);
      supportUnread = (data["total"] as num?)?.toInt() ?? 0;
      notifyListeners();
    }
  }

  Future<List<SupportMessage>> loadSupportMessages({int? videoId}) async {
    final query = videoId != null && videoId > 0 ? {"videoId": "$videoId"} : null;
    final res = await _api.request("GET", "/support/messages", query: query);
    if (res.statusCode != 200) {
      _api.throwFrom(res, "Не удалось загрузить чат");
    }
    final data = await _api.decodeMap(res);
    final list = (data["messages"] as List? ?? [])
        .whereType<Map>()
        .map((e) => SupportMessage.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    await _api.request("POST", "/support/mark-read");
    supportUnread = 0;
    notifyListeners();
    return list;
  }

  Future<void> sendSupportMessage(String text, {int? videoId}) async {
    final body = <String, dynamic>{"text": text};
    if (videoId != null && videoId > 0) body["videoId"] = videoId;
    final res = await _api.request("POST", "/support/messages", body: body);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      _api.throwFrom(res, "Не удалось отправить сообщение");
    }
  }

  Future<LeaderboardData> loadLeaderboard() async {
    final res = await _api.request("GET", "/leaderboard/weekly", query: {"limit": "10"});
    if (res.statusCode != 200) {
      _api.throwFrom(res, "Не удалось загрузить рейтинг");
    }
    final data = await _api.decodeMap(res);
    final entries = (data["entries"] as List? ?? [])
        .whereType<Map>()
        .map((e) => LeaderboardEntry.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    final current = data["currentUser"];
    int? rank;
    var seconds = 0;
    if (current is Map) {
      rank = (current["rank"] as num?)?.toInt();
      seconds = (current["seconds"] as num?)?.toInt() ?? 0;
    }
    return LeaderboardData(entries: entries, currentRank: rank, currentSeconds: seconds);
  }

  Future<BillingPlan> loadBillingPlan() async {
    final res = await _api.request("GET", "/billing/plan", auth: false);
    if (res.statusCode != 200) {
      _api.throwFrom(res, "Не удалось загрузить тариф");
    }
    final data = await _api.decodeMap(res);
    return BillingPlan(
      amount: (data["amount"] as num?)?.toDouble() ?? 0,
      periodLabel: (data["periodLabel"] as String?) ?? "1 месяц",
    );
  }

  Future<PromoResult> validatePromo(String code) async {
    final res = await _api.request(
      "POST",
      "/billing/validate-promo",
      body: {"promoCode": code.trim()},
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      _api.throwFrom(res, "Промокод недействителен");
    }
    final data = await _api.decodeMap(res);
    return PromoResult(
      code: (data["code"] as String?) ?? code.trim(),
      finalAmount: (data["finalAmount"] as num?)?.toDouble() ?? 0,
      discountLabel: data["discountLabel"] as String?,
    );
  }

  Future<({bool free, String? paymentUrl, String? paymentId, UserProfile? profile})> createPayment({
    String? promoCode,
  }) async {
    final body = <String, dynamic>{"plan": "standard"};
    if (promoCode != null && promoCode.isNotEmpty) body["promoCode"] = promoCode;
    final res = await _api.request("POST", "/billing/create-payment", body: body);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      _api.throwFrom(res, "Не удалось создать платёж");
    }
    final data = await _api.decodeMap(res);
    UserProfile? nextProfile;
    if (data["profile"] is Map) {
      nextProfile = UserProfile.fromJson(Map<String, dynamic>.from(data["profile"] as Map));
    }
    return (
      free: data["free"] == true,
      paymentUrl: data["paymentUrl"] as String?,
      paymentId: data["paymentId"] as String?,
      profile: nextProfile,
    );
  }

  Future<String> getVideoAccessToken(int videoId) async {
    final res = await _api.request("POST", "/videos/$videoId/access-token");
    if (res.statusCode < 200 || res.statusCode >= 300) {
      _api.throwFrom(res, "Не удалось получить доступ к видео");
    }
    final data = await _api.decodeMap(res);
    return data["token"] as String? ?? "";
  }

  Future<void> saveVideoPosition(int videoId, int watchedSeconds, int durationSec) async {
    final completed = isLessonVideoCompleted(
      watchedSeconds: watchedSeconds,
      durationSeconds: durationSec,
      videoCompleted: progress.videoCompleted,
      videoId: videoId,
    );
    await _api.request(
      "POST",
      "/videos/$videoId/position",
      body: {"watchedSeconds": watchedSeconds, "completed": completed},
      retry: false,
    );
  }

  VideoLocation? continueLesson() => findVideoById(chapters, progress.lastVideoId);
}
