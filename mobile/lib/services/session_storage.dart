import "dart:convert";

import "package:flutter_secure_storage/flutter_secure_storage.dart";
import "package:shared_preferences/shared_preferences.dart";
import "package:uuid/uuid.dart";

import "../models/models.dart";

class SessionStorage {
  SessionStorage();

  static const _tokenKey = "drm_token";
  static const _refreshKey = "drm_refresh";
  static const _profileKey = "drm_profile";
  static const _deviceKey = "deviceId";

  final FlutterSecureStorage _secure = const FlutterSecureStorage();

  Future<String> getDeviceId() async {
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString(_deviceKey);
    if (id == null || id.isEmpty) {
      id = const Uuid().v4();
      await prefs.setString(_deviceKey, id);
    }
    return id;
  }

  Future<({String token, String refresh, UserProfile? profile})> readSession() async {
    final token = await _secure.read(key: _tokenKey) ?? "";
    final refresh = await _secure.read(key: _refreshKey) ?? "";
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_profileKey);
    UserProfile? profile;
    if (raw != null && raw.isNotEmpty) {
      try {
        final map = jsonDecode(raw) as Map<String, dynamic>;
        profile = UserProfile.fromJson(map);
      } catch (_) {
        profile = null;
      }
    }
    return (token: token, refresh: refresh, profile: profile);
  }

  Future<void> saveSession({
    required String token,
    String? refreshToken,
    UserProfile? profile,
  }) async {
    if (token.isEmpty) {
      await _secure.delete(key: _tokenKey);
    } else {
      await _secure.write(key: _tokenKey, value: token);
    }
    if (refreshToken != null) {
      if (refreshToken.isEmpty) {
        await _secure.delete(key: _refreshKey);
      } else {
        await _secure.write(key: _refreshKey, value: refreshToken);
      }
    }
    final prefs = await SharedPreferences.getInstance();
    if (profile == null) {
      await prefs.remove(_profileKey);
    } else {
      await prefs.setString(_profileKey, jsonEncode(profile.toJson()));
    }
  }

  Future<void> clear() async {
    await _secure.delete(key: _tokenKey);
    await _secure.delete(key: _refreshKey);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_profileKey);
  }
}
