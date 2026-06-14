/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { apiBase } from "../config.js";
import { getDeviceId } from "../utils/deviceId.js";

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
    videoCompleted: {}
  });
  const [hydrated] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(() => Boolean(bootstrap.token));

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

  const loadCatalog = useCallback(async () => {
    if (!tokenRef.current) {
      setCatalogLoading(false);
      return;
    }
    setCatalogLoading(true);
    try {
      const [chaptersRes, progressRes] = await Promise.all([
        apiRequest("/chapters", {}, false),
        apiRequest("/progress", {}, false)
      ]);
      if (chaptersRes.ok) {
        setChapters(await chaptersRes.json());
      }
      if (progressRes.ok) {
        setProgress(await progressRes.json());
      }
    } finally {
      setCatalogLoading(false);
    }
  }, [apiRequest]);

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

      const [chaptersRes, progressRes] = await Promise.all([
        fetch(`${apiBase}/chapters`, {
          headers: { Authorization: `Bearer ${authData.token}` }
        }),
        fetch(`${apiBase}/progress`, {
          headers: { Authorization: `Bearer ${authData.token}` }
        })
      ]);
      if (chaptersRes.ok) setChapters(await chaptersRes.json());
      if (progressRes.ok) setProgress(await progressRes.json());
      setCatalogLoading(false);
      return authData.profile;
    },
    [setAuthState]
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

      const [chaptersRes, progressRes] = await Promise.all([
        fetch(`${apiBase}/chapters`, {
          headers: { Authorization: `Bearer ${authData.token}` }
        }),
        fetch(`${apiBase}/progress`, {
          headers: { Authorization: `Bearer ${authData.token}` }
        })
      ]);
      if (chaptersRes.ok) setChapters(await chaptersRes.json());
      if (progressRes.ok) setProgress(await progressRes.json());
      setCatalogLoading(false);
      return authData.profile;
    },
    [setAuthState]
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
    setCatalogLoading(false);
    setProgress({
      percentage: 0,
      completedCount: 0,
      totalVideos: 0,
      lastVideoId: null,
      watchedSeconds: {},
      videoCompleted: {}
    });
  }, [setAuthState]);

  const value = useMemo(
    () => ({
      apiBase,
      token,
      profile,
      chapters,
      catalogLoading,
      progress,
      hydrated,
      login,
      register,
      updateProfile,
      logout,
      apiRequest,
      loadCatalog,
      refreshProgress,
      setProgress,
      tokenRef,
      refreshTokenRef
    }),
    [
      token,
      profile,
      chapters,
      catalogLoading,
      progress,
      hydrated,
      login,
      register,
      updateProfile,
      logout,
      apiRequest,
      loadCatalog,
      refreshProgress
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
