import "dart:convert";

import "package:http/http.dart" as http;

import "../config/api_config.dart";
import "../models/models.dart";
import "session_storage.dart";

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient(this._storage, {http.Client? httpClient})
      : _http = httpClient ?? http.Client();

  final SessionStorage _storage;
  final http.Client _http;

  static const _requestTimeout = Duration(seconds: 30);

  String _token = "";
  String _refresh = "";
  String _deviceId = "";
  Future<bool>? _refreshing;

  /// После успешного /auth/refresh: новый access-токен и профиль (если сервер его прислал).
  void Function(String token, UserProfile? profile)? onSessionRefreshed;

  /// Сервер окончательно отклонил сессию (refresh 401/403) — нужен повторный вход.
  /// Сетевые ошибки и 5xx сюда не попадают.
  void Function()? onSessionRejected;

  String get token => _token;
  bool get isAuthenticated => _token.isNotEmpty;

  Future<void> hydrate(String token, String refresh) async {
    _token = token;
    _refresh = refresh;
    _deviceId = await _storage.getDeviceId();
  }

  void setTokens(String token, String? refresh) {
    _token = token;
    if (refresh != null) _refresh = refresh;
  }

  void clearTokens() {
    _token = "";
    _refresh = "";
  }

  Map<String, String> _headers({Map<String, String>? extra, bool auth = true}) {
    return {
      "Content-Type": "application/json",
      "Accept": "application/json",
      if (_deviceId.isNotEmpty) "x-device-id": _deviceId,
      if (auth && _token.isNotEmpty) "Authorization": "Bearer $_token",
      ...?extra,
    };
  }

  Uri _uri(String path, [Map<String, String>? query]) {
    final base = kApiBaseUrl.endsWith("/") ? kApiBaseUrl.substring(0, kApiBaseUrl.length - 1) : kApiBaseUrl;
    final p = path.startsWith("/") ? path : "/$path";
    return Uri.parse("$base$p").replace(queryParameters: query);
  }

  Future<http.Response> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? query,
    bool auth = true,
    bool retry = true,
  }) async {
    if (_deviceId.isEmpty) {
      _deviceId = await _storage.getDeviceId();
    }

    Future<http.Response> send() {
      final uri = _uri(path, query);
      final headers = _headers(auth: auth);
      final encoded = body == null ? null : jsonEncode(body);
      final Future<http.Response> future;
      switch (method.toUpperCase()) {
        case "GET":
          future = _http.get(uri, headers: headers);
        case "POST":
          future = _http.post(uri, headers: headers, body: encoded);
        case "PATCH":
          future = _http.patch(uri, headers: headers, body: encoded);
        case "DELETE":
          future = _http.delete(uri, headers: headers, body: encoded);
        default:
          throw ApiException("Unsupported method $method");
      }
      return future.timeout(_requestTimeout);
    }

    final usedToken = _token;
    var response = await send();
    if (response.statusCode == 401 && retry && auth && usedToken.isNotEmpty) {
      if (_token.isNotEmpty && _token != usedToken) {
        // Пока запрос летел, другой запрос уже обновил токен.
        response = await send();
      } else if (_refresh.isEmpty) {
        onSessionRejected?.call();
      } else if (await _tryRefresh()) {
        response = await send();
      }
    }
    return response;
  }

  /// Параллельные 401 ждут одно обновление: сервер ротирует refresh-токен.
  Future<bool> _tryRefresh() {
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<bool> _doRefresh() async {
    final http.Response res;
    try {
      res = await _http
          .post(
            _uri("/auth/refresh"),
            headers: _headers(auth: false),
            body: jsonEncode({"refreshToken": _refresh}),
          )
          .timeout(_requestTimeout);
    } catch (_) {
      return false;
    }
    if (res.statusCode == 401 || res.statusCode == 403) {
      onSessionRejected?.call();
      return false;
    }
    if (res.statusCode < 200 || res.statusCode >= 300) return false;

    final Map<String, dynamic> data;
    try {
      data = Map<String, dynamic>.from(jsonDecode(res.body) as Map);
    } catch (_) {
      return false;
    }
    final nextToken = data["token"] as String? ?? "";
    final nextRefresh = data["refreshToken"] as String? ?? _refresh;
    if (nextToken.isEmpty) return false;
    UserProfile? profile;
    final rawProfile = data["profile"];
    if (rawProfile is Map) {
      profile = UserProfile.fromJson(Map<String, dynamic>.from(rawProfile));
    }

    _token = nextToken;
    _refresh = nextRefresh;
    await _storage.saveSession(token: nextToken, refreshToken: nextRefresh, profile: profile);
    onSessionRefreshed?.call(nextToken, profile);
    return true;
  }

  Future<Map<String, dynamic>> decodeMap(http.Response res) async {
    if (res.body.isEmpty) return {};
    final decoded = jsonDecode(res.body);
    if (decoded is Map<String, dynamic>) return decoded;
    if (decoded is Map) return Map<String, dynamic>.from(decoded);
    throw ApiException("Некорректный ответ сервера", statusCode: res.statusCode);
  }

  Future<dynamic> decode(http.Response res) async {
    if (res.body.isEmpty) return null;
    return jsonDecode(res.body);
  }

  Never throwFrom(http.Response res, [String fallback = "Ошибка запроса"]) {
    try {
      final data = jsonDecode(res.body);
      if (data is Map && data["message"] is String) {
        throw ApiException(data["message"] as String, statusCode: res.statusCode);
      }
    } catch (e) {
      if (e is ApiException) rethrow;
    }
    throw ApiException(fallback, statusCode: res.statusCode);
  }

  String hlsManifestUrl(int videoId, String accessToken) {
    final base = kApiBaseUrl.endsWith("/") ? kApiBaseUrl.substring(0, kApiBaseUrl.length - 1) : kApiBaseUrl;
    final did = Uri.encodeComponent(_deviceId);
    final tok = Uri.encodeComponent(accessToken);
    return "$base/hls/$videoId/manifest.m3u8?token=$tok&did=$did";
  }
}
