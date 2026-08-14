import "dart:convert";

import "package:http/http.dart" as http;

import "../config/api_config.dart";
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

  String _token = "";
  String _refresh = "";
  String _deviceId = "";

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
      switch (method.toUpperCase()) {
        case "GET":
          return _http.get(uri, headers: headers);
        case "POST":
          return _http.post(uri, headers: headers, body: encoded);
        case "PATCH":
          return _http.patch(uri, headers: headers, body: encoded);
        case "DELETE":
          return _http.delete(uri, headers: headers, body: encoded);
        default:
          throw ApiException("Unsupported method $method");
      }
    }

    var response = await send();
    if (response.statusCode == 401 && retry && _refresh.isNotEmpty && auth) {
      final refreshed = await _tryRefresh();
      if (refreshed) {
        response = await send();
      }
    }
    return response;
  }

  Future<bool> _tryRefresh() async {
    final res = await _http.post(
      _uri("/auth/refresh"),
      headers: _headers(auth: false),
      body: jsonEncode({"refreshToken": _refresh}),
    );
    if (res.statusCode < 200 || res.statusCode >= 300) return false;
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final nextToken = data["token"] as String? ?? "";
    final nextRefresh = data["refreshToken"] as String? ?? _refresh;
    if (nextToken.isEmpty) return false;
    _token = nextToken;
    _refresh = nextRefresh;
    await _storage.saveSession(token: nextToken, refreshToken: nextRefresh);
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
