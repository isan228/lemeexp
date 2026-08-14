import "dart:convert";

import "package:flutter/foundation.dart";
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

  /// Fallback keys if secure storage is unavailable on some Android devices.
  static const _tokenPrefKey = "drm_token_fallback";
  static const _refreshPrefKey = "drm_refresh_fallback";

  final FlutterSecureStorage _secure = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  Future<String> getDeviceId() async {
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString(_deviceKey);
    if (id == null || id.isEmpty) {
      id = const Uuid().v4();
      await prefs.setString(_deviceKey, id);
    }
    return id;
  }

  Future<String> _readSecret(String secureKey, String prefKey) async {
    try {
      final fromSecure = await _secure.read(key: secureKey);
      if (fromSecure != null && fromSecure.isNotEmpty) return fromSecure;
    } catch (e) {
      debugPrint("secure read failed ($secureKey): $e");
    }
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(prefKey) ?? "";
  }

  Future<void> _writeSecret(String secureKey, String prefKey, String value) async {
    var secureOk = false;
    try {
      if (value.isEmpty) {
        await _secure.delete(key: secureKey);
      } else {
        await _secure.write(key: secureKey, value: value);
      }
      secureOk = true;
    } catch (e) {
      debugPrint("secure write failed ($secureKey): $e");
    }
    final prefs = await SharedPreferences.getInstance();
    if (!secureOk) {
      if (value.isEmpty) {
        await prefs.remove(prefKey);
      } else {
        await prefs.setString(prefKey, value);
      }
    } else {
      await prefs.remove(prefKey);
    }
  }

  Future<({String token, String refresh, UserProfile? profile})> readSession() async {
    final token = await _readSecret(_tokenKey, _tokenPrefKey);
    final refresh = await _readSecret(_refreshKey, _refreshPrefKey);
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
    await _writeSecret(_tokenKey, _tokenPrefKey, token);
    if (refreshToken != null) {
      await _writeSecret(_refreshKey, _refreshPrefKey, refreshToken);
    }
    final prefs = await SharedPreferences.getInstance();
    if (profile == null) {
      await prefs.remove(_profileKey);
    } else {
      await prefs.setString(_profileKey, jsonEncode(profile.toJson()));
    }
  }

  Future<void> clear() async {
    try {
      await _secure.delete(key: _tokenKey);
      await _secure.delete(key: _refreshKey);
    } catch (_) {}
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_profileKey);
    await prefs.remove(_tokenPrefKey);
    await prefs.remove(_refreshPrefKey);
  }
}
