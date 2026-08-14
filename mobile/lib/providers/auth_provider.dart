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

  bool get isLoggedIn => (token ?? "").isNotEmpty;

  Future<void> bootstrap() async {
    final session = await _storage.readSession();
    token = session.token;
    profile = session.profile;
    await _api.hydrate(session.token, session.refresh);
    hydrated = true;
    notifyListeners();
    if (!isLoggedIn) return;

    // Если токен есть, а профиль потерялся — восстановим через refresh / каталог.
    if (profile == null && session.refresh.isNotEmpty) {
      final refreshed = await _api.request("GET", "/progress", retry: true);
      if (refreshed.statusCode == 401) {
        await logout();
        return;
      }
    }
    await loadCatalog();
    await refreshSupportUnread();
  }

  Future<void> _persistAuth(String nextToken, String nextRefresh, UserProfile? nextProfile) async {
    token = nextToken;
    profile = nextProfile;
    _api.setTokens(nextToken, nextRefresh);
    await _storage.saveSession(token: nextToken, refreshToken: nextRefresh, profile: nextProfile);
    notifyListeners();
  }

  Future<UserProfile> login(String email, String password) async {
    try {
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
      final profileRaw = data["profile"];
      if (profileRaw is! Map) {
        throw ApiException("Сервер не вернул профиль пользователя");
      }
      final nextProfile = UserProfile.fromJson(Map<String, dynamic>.from(profileRaw));
      final nextToken = data["token"] as String? ?? "";
      if (nextToken.isEmpty) {
        throw ApiException("Сервер не вернул токен");
      }
      await _persistAuth(
        nextToken,
        data["refreshToken"] as String? ?? "",
        nextProfile,
      );
      await loadCatalog();
      await refreshSupportUnread();
      return nextProfile;
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException("Ошибка входа: $e");
    }
  }

  Future<UserProfile> register(String email, String password, String nickname) async {
    try {
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
      final profileRaw = data["profile"];
      if (profileRaw is! Map) {
        throw ApiException("Сервер не вернул профиль пользователя");
      }
      final nextProfile = UserProfile.fromJson(Map<String, dynamic>.from(profileRaw));
      final nextToken = data["token"] as String? ?? "";
      if (nextToken.isEmpty) {
        throw ApiException("Сервер не вернул токен");
      }
      await _persistAuth(
        nextToken,
        data["refreshToken"] as String? ?? "",
        nextProfile,
      );
      await loadCatalog();
      return nextProfile;
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException("Ошибка регистрации: $e");
    }
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
          .map((id) => FavoriteItem(videoId: asInt(id)))
          .where((item) => item.videoId > 0)
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
        final numId = asInt(id);
        return prev[numId] ?? FavoriteItem(videoId: numId, createdAt: DateTime.now().toIso8601String());
      }).where((item) => item.videoId > 0).toList();
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
      supportUnread = asInt(data["total"]);
      notifyListeners();
    }
  }

  Future<List<SupportMessage>> loadSupportMessages({int? videoId, bool markRead = true}) async {
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
    if (markRead) {
      await _api.request("POST", "/support/mark-read");
      supportUnread = 0;
      notifyListeners();
    }
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
      final rawRank = current["rank"];
      rank = rawRank == null ? null : asInt(rawRank);
      seconds = asInt(current["seconds"]);
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
      amount: asDouble(data["amount"]),
      periodLabel: asStringOrNull(data["periodLabel"]) ?? "1 месяц",
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
    final discount = data["discount"] ?? data["discountLabel"] ?? data["discountValue"];
    return PromoResult(
      code: asStringOrNull(data["code"]) ?? code.trim(),
      finalAmount: asDouble(data["finalAmount"]),
                  discountLabel: discount?.toString(),
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
      paymentUrl: asStringOrNull(data["paymentUrl"]),
      paymentId: asStringOrNull(data["paymentId"]),
      profile: nextProfile,
    );
  }

  /// Returns access JWT and TTL seconds (default 300).
  Future<({String token, int expiresIn})> getVideoAccessToken(int videoId) async {
    final res = await _api.request("POST", "/videos/$videoId/access-token");
    if (res.statusCode < 200 || res.statusCode >= 300) {
      _api.throwFrom(res, "Не удалось получить доступ к видео");
    }
    final data = await _api.decodeMap(res);
    final token = asStringOrNull(data["token"]) ?? "";
    if (token.isEmpty) {
      throw ApiException("Пустой токен доступа к видео");
    }
    final expiresIn = asInt(data["expiresIn"], 300);
    return (token: token, expiresIn: expiresIn > 0 ? expiresIn : 300);
  }

  Future<({String status, UserProfile? profile})> getPaymentStatus(String paymentId) async {
    final res = await _api.request("GET", "/billing/payment-status/$paymentId");
    if (res.statusCode < 200 || res.statusCode >= 300) {
      _api.throwFrom(res, "Не удалось проверить оплату");
    }
    final data = await _api.decodeMap(res);
    UserProfile? nextProfile;
    if (data["profile"] is Map) {
      nextProfile = UserProfile.fromJson(Map<String, dynamic>.from(data["profile"] as Map));
    }
    return (
      status: asStringOrNull(data["status"]) ?? "unknown",
      profile: nextProfile,
    );
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

    // Keep local progress in sync so «Продолжить урок» and bars update immediately.
    final nextWatched = Map<int, int>.from(progress.watchedSeconds);
    final prev = nextWatched[videoId] ?? 0;
    nextWatched[videoId] = watchedSeconds > prev ? watchedSeconds : prev;
    final nextCompleted = Map<int, bool>.from(progress.videoCompleted);
    if (completed) nextCompleted[videoId] = true;

    var completedCount = progress.completedCount;
    if (completed && progress.videoCompleted[videoId] != true) {
      completedCount += 1;
    }
    final total = progress.totalVideos;
    final pct = total > 0 ? (completedCount / total) * 100 : progress.percentage;

    progress = LearningProgress(
      percentage: pct,
      completedCount: completedCount,
      totalVideos: total,
      lastVideoId: videoId,
      watchedSeconds: nextWatched,
      videoCompleted: nextCompleted,
      last7Days: progress.last7Days,
      dailyRecordDate: progress.dailyRecordDate,
      dailyRecordSeconds: progress.dailyRecordSeconds,
    );
    notifyListeners();
  }

  VideoLocation? continueLesson() => findVideoById(chapters, progress.lastVideoId);
}
