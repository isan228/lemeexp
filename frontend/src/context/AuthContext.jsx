/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiBase } from "../config.js";
import { getDeviceId } from "../utils/deviceId.js";

const AuthContext = createContext(null);

const LS_TOKEN = "drm_token";
const LS_REFRESH = "drm_refresh";
const LS_PROFILE = "drm_profile";

function readInitialSession() {
  if (typeof window === "undefined") {
    return { token: "", refresh: "", profile: null };
  }
  const token = localStorage.getItem(LS_TOKEN) || "";
  const refresh = localStorage.getItem(LS_REFRESH) || "";
  let profile = null;
  const pRaw = localStorage.getItem(LS_PROFILE);
  if (pRaw) {
    try {
      profile = JSON.parse(pRaw);
    } catch {
      profile = null;
    }
  }
  return { token, refresh, profile };
}

function deviceIdHeaders() {
  if (typeof window === "undefined") return {};
  const id = getDeviceId();
  return id ? { "x-device-id": id } : {};
}

export function AuthProvider({ children }) {
  const [bootstrap] = useState(() => readInitialSession());
  const tokenRef = useRef(bootstrap.token);
  const refreshTokenRef = useRef(bootstrap.refresh);
  const [token, setToken] = useState(bootstrap.token);
  const [profile, setProfile] = useState(bootstrap.profile);
  const [chapters, setChapters] = useState([]);
  const [progress, setProgress] = useState({
    percentage: 0,
    completedCount: 0,
    totalVideos: 0,
    lastVideoId: null,
    watchedSeconds: {},
    videoCompleted: {},
    watchStats: {
      last7Days: []
    }
  });
  const [hydrated] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(() => Boolean(bootstrap.token));
  const [catalogError, setCatalogError] = useState("");
  const [favoriteItems, setFavoriteItems] = useState([]);

  const applyFavorites = useCallback((items) => {
    const list = Array.isArray(items) ? items : [];
    setFavoriteItems(list);
  }, []);

  const updateProfile = useCallback((nextProfile) => {
    setProfile(nextProfile || null);
    if (nextProfile) {
      localStorage.setItem(LS_PROFILE, JSON.stringify(nextProfile));
    } else {
      localStorage.removeItem(LS_PROFILE);
    }
  }, []);

  const setAuthState = useCallback((nextToken, nextRefreshToken, nextProfile) => {
    tokenRef.current = nextToken || "";
    setToken(nextToken || "");

    if (nextRefreshToken !== undefined) {
      refreshTokenRef.current = nextRefreshToken || "";
      if (nextRefreshToken) {
        localStorage.setItem(LS_REFRESH, nextRefreshToken);
      } else {
        localStorage.removeItem(LS_REFRESH);
      }
    } else if (!nextToken) {
      refreshTokenRef.current = "";
      localStorage.removeItem(LS_REFRESH);
    }

    if (nextProfile !== undefined) {
      updateProfile(nextProfile);
    }

    if (nextToken) {
      localStorage.setItem(LS_TOKEN, nextToken);
    } else {
      localStorage.removeItem(LS_TOKEN);
    }
  }, [updateProfile]);

  const apiRequest = useCallback(
    async (path, options = {}, retry = true) => {
      const headers = {
        ...deviceIdHeaders(),
        ...(options.headers || {}),
        ...(tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {})
      };

      const response = await fetch(`${apiBase}${path}`, { ...options, headers });
      if (response.status !== 401 || !retry || !refreshTokenRef.current) {
        return response;
      }

      const refreshResponse = await fetch(`${apiBase}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...deviceIdHeaders() },
        body: JSON.stringify({ refreshToken: refreshTokenRef.current })
      });
      if (!refreshResponse.ok) return response;

      const refreshData = await refreshResponse.json();
      setAuthState(refreshData.token, refreshData.refreshToken, undefined);

      return fetch(`${apiBase}${path}`, {
        ...options,
        headers: {
          ...deviceIdHeaders(),
          ...(options.headers || {}),
          Authorization: `Bearer ${refreshData.token}`
        }
      });
    },
    [setAuthState]
  );

  const chaptersRef = useRef([]);
  chaptersRef.current = chapters;

  const loadFavorites = useCallback(async () => {
    if (!tokenRef.current) {
      applyFavorites([]);
      return;
    }
    const res = await apiRequest("/favorites", {}, false);
    if (!res.ok) return;
    const data = await res.json();
    const items = Array.isArray(data.items)
      ? data.items
      : (data.videoIds || []).map((videoId) => ({ videoId, createdAt: null }));
    applyFavorites(items);
  }, [apiRequest, applyFavorites]);

  const loadCatalog = useCallback(async () => {
    if (!tokenRef.current) {
      setCatalogLoading(false);
      setCatalogError("");
      return;
    }
    const isInitialLoad = chaptersRef.current.length === 0;
    if (isInitialLoad) setCatalogLoading(true);
    try {
      const [chaptersRes, progressRes, favoritesRes] = await Promise.all([
        apiRequest("/chapters"),
        apiRequest("/progress"),
        apiRequest("/favorites")
      ]);
      if (chaptersRes.ok) {
        setChapters(await chaptersRes.json());
        setCatalogError("");
      } else if (chaptersRes.status === 401) {
        setCatalogError("Сессия истекла. Обновите страницу или войдите снова.");
      } else {
        setCatalogError("Не удалось загрузить каталог уроков.");
      }
      if (progressRes.ok) {
        setProgress(await progressRes.json());
      }
      if (favoritesRes.ok) {
        const data = await favoritesRes.json();
        const items = Array.isArray(data.items)
          ? data.items
          : (data.videoIds || []).map((videoId) => ({ videoId, createdAt: null }));
        applyFavorites(items);
      }
    } catch {
      setCatalogError("Не удалось загрузить каталог. Проверьте соединение.");
    } finally {
      setCatalogLoading(false);
    }
  }, [apiRequest, applyFavorites]);

  const refreshProgress = useCallback(async () => {
    if (!tokenRef.current) return;
    const res = await apiRequest("/progress", {}, false);
    if (res.ok) {
      setProgress(await res.json());
    }
  }, [apiRequest]);

  const login = useCallback(
    async (email, password) => {
      const deviceId = getDeviceId();
      const loginRes = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-id": deviceId },
        body: JSON.stringify({ email, password })
      });
      if (!loginRes.ok) {
        const err = await loginRes.json().catch(() => ({}));
        throw new Error(err.message || "Неверный email или пароль");
      }
      const authData = await loginRes.json();
      setAuthState(authData.token, authData.refreshToken, authData.profile);

      const [chaptersRes, progressRes, favoritesRes] = await Promise.all([
        fetch(`${apiBase}/chapters`, {
          headers: { Authorization: `Bearer ${authData.token}` }
        }),
        fetch(`${apiBase}/progress`, {
          headers: { Authorization: `Bearer ${authData.token}` }
        }),
        fetch(`${apiBase}/favorites`, {
          headers: { Authorization: `Bearer ${authData.token}` }
        })
      ]);
      if (chaptersRes.ok) setChapters(await chaptersRes.json());
      if (progressRes.ok) setProgress(await progressRes.json());
      if (favoritesRes.ok) {
        const data = await favoritesRes.json();
        const items = Array.isArray(data.items)
          ? data.items
          : (data.videoIds || []).map((videoId) => ({ videoId, createdAt: null }));
        applyFavorites(items);
      }
      setCatalogError("");
      setCatalogLoading(false);
      return authData.profile;
    },
    [setAuthState, applyFavorites]
  );

  const register = useCallback(
    async (email, password, nickname) => {
      const deviceId = getDeviceId();
      const payload = { email, password };
      if (nickname?.trim()) payload.nickname = nickname.trim();
      const res = await fetch(`${apiBase}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-id": deviceId },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Регистрация не удалась");
      }
      const authData = await res.json();
      setAuthState(authData.token, authData.refreshToken, authData.profile);

      const [chaptersRes, progressRes, favoritesRes] = await Promise.all([
        fetch(`${apiBase}/chapters`, {
          headers: { Authorization: `Bearer ${authData.token}` }
        }),
        fetch(`${apiBase}/progress`, {
          headers: { Authorization: `Bearer ${authData.token}` }
        }),
        fetch(`${apiBase}/favorites`, {
          headers: { Authorization: `Bearer ${authData.token}` }
        })
      ]);
      if (chaptersRes.ok) setChapters(await chaptersRes.json());
      if (progressRes.ok) setProgress(await progressRes.json());
      if (favoritesRes.ok) {
        const data = await favoritesRes.json();
        const items = Array.isArray(data.items)
          ? data.items
          : (data.videoIds || []).map((videoId) => ({ videoId, createdAt: null }));
        applyFavorites(items);
      }
      setCatalogError("");
      setCatalogLoading(false);
      return authData.profile;
    },
    [setAuthState, applyFavorites]
  );

  const isVideoFavorite = useCallback(
    (videoId) => {
      const vid = Number(videoId);
      return favoriteItems.some((item) => Number(item.videoId) === vid);
    },
    [favoriteItems]
  );

  const toggleFavorite = useCallback(
    async (videoId) => {
      const vid = Number(videoId);
      if (!Number.isFinite(vid) || vid <= 0) return false;
      const res = await apiRequest(`/videos/${vid}/favorite`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Не удалось обновить избранное");
      }
      const data = await res.json();
      if (Array.isArray(data.videoIds)) {
        const prevMap = new Map(favoriteItems.map((item) => [Number(item.videoId), item]));
        applyFavorites(
          data.videoIds.map((id) => {
            const num = Number(id);
            const prev = prevMap.get(num);
            if (prev) return prev;
            return { videoId: num, createdAt: new Date().toISOString() };
          })
        );
      } else {
        await loadFavorites();
      }
      return Boolean(data.favorited);
    },
    [apiRequest, applyFavorites, favoriteItems, loadFavorites]
  );

  const logout = useCallback(async () => {
    try {
      if (refreshTokenRef.current) {
        await fetch(`${apiBase}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: refreshTokenRef.current })
        });
      }
    } catch {
      /* ignore */
    }
    setAuthState("", "", null);
    setChapters([]);
    applyFavorites([]);
    setCatalogLoading(false);
    setCatalogError("");
    setProgress({
      percentage: 0,
      completedCount: 0,
      totalVideos: 0,
      lastVideoId: null,
      watchedSeconds: {},
      videoCompleted: {},
      watchStats: {
        last7Days: []
      }
    });
  }, [setAuthState, applyFavorites]);

  const value = useMemo(
    () => ({
      apiBase,
      token,
      profile,
      chapters,
      catalogLoading,
      catalogError,
      progress,
      favoriteItems,
      hydrated,
      login,
      register,
      updateProfile,
      logout,
      apiRequest,
      loadCatalog,
      loadFavorites,
      refreshProgress,
      isVideoFavorite,
      toggleFavorite,
      setProgress,
      tokenRef,
      refreshTokenRef
    }),
    [
      token,
      profile,
      chapters,
      catalogLoading,
      catalogError,
      progress,
      favoriteItems,
      hydrated,
      login,
      register,
      updateProfile,
      logout,
      apiRequest,
      loadCatalog,
      loadFavorites,
      refreshProgress,
      isVideoFavorite,
      toggleFavorite
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
