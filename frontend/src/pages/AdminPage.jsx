import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { routes } from "../config/site.js";
import AdminSearchBox from "../components/AdminSearchBox.jsx";
import { formatPlanPrice } from "../config/billing.js";
import { filterAssociative, suggestAssociative } from "../utils/adminSearch.js";
import { isPlayableStream, isProcessingStream } from "../utils/streamPath.js";
import "./AdminPage.css";

function swapInList(ids, id, dir) {
  const idx = ids.indexOf(id);
  const next = idx + dir;
  if (idx < 0 || next < 0 || next >= ids.length) return ids;
  const copy = [...ids];
  [copy[idx], copy[next]] = [copy[next], copy[idx]];
  return copy;
}

const NAV_ITEMS = [
  { id: "content", label: "Курсы и уроки", icon: "📚", desc: "Предметы, главы и видеоуроки" },
  { id: "promo", label: "Биллинг", icon: "🎟", desc: "Цена подписки и промокоды" },
  { id: "users", label: "Пользователи", icon: "👥", desc: "Учётные записи и тарифы" },
  { id: "devices", label: "Устройства", icon: "📱", desc: "Входы учеников с разных устройств" },
  { id: "news", label: "Новости", icon: "📰", desc: "Публикации на главной" },
  { id: "support", label: "Поддержка", icon: "💬", desc: "Чат с учениками" }
];

const SUBSCRIPTION_TAGS = {
  free: { label: "Free", className: "adm-tag-free" },
  basic: { label: "Basic", className: "adm-tag-basic" },
  premium: { label: "Pro", className: "adm-tag-premium" },
  mentor: { label: "Mentor", className: "adm-tag-mentor" },
  admin: { label: "Admin", className: "adm-tag-admin" }
};

function formatLessonDuration(seconds) {
  const total = Number(seconds || 0);
  if (total <= 0) return "—";
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return sec ? `${min} мин ${sec} сек` : `${min} мин`;
}

function subscriptionTag(type) {
  return SUBSCRIPTION_TAGS[type] || { label: type, className: "adm-tag-free" };
}

function formatPromoType(type, value) {
  if (type === "full") return "100% (бесплатно)";
  if (type === "percent") return `${value}%`;
  if (type === "fixed") return `${value} сом`;
  return type;
}

function shortenDeviceId(id) {
  if (!id) return "—";
  const text = String(id);
  if (text.length <= 14) return text;
  return `${text.slice(0, 8)}…${text.slice(-4)}`;
}

function describeUserAgent(ua) {
  if (!ua) return "Браузер неизвестен";
  if (/Edg\//.test(ua)) return "Microsoft Edge";
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) return "Мобильный браузер";
  return ua.length > 56 ? `${ua.slice(0, 56)}…` : ua;
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { login, logout, token, profile, hydrated, apiRequest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState("content");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const [adminCatalog, setAdminCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedSubtopic, setSelectedSubtopic] = useState(null);
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newSubtopicTitle, setNewSubtopicTitle] = useState("");
  const [newVideoTitle, setNewVideoTitle] = useState("");
  const [newVideoDurationMin, setNewVideoDurationMin] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [editCourseTitle, setEditCourseTitle] = useState("");
  const [editingSubtopicId, setEditingSubtopicId] = useState(null);
  const [editSubtopicTitle, setEditSubtopicTitle] = useState("");
  const [editingVideoId, setEditingVideoId] = useState(null);
  const [editVideoTitle, setEditVideoTitle] = useState("");
  const [editVideoDurationMin, setEditVideoDurationMin] = useState("");
  const [catalogGlobalSearch, setCatalogGlobalSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [subtopicSearch, setSubtopicSearch] = useState("");
  const [lessonSearch, setLessonSearch] = useState("");

  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserNickname, setNewUserNickname] = useState("");
  const [newUserSubscription, setNewUserSubscription] = useState("free");
  const [userCreating, setUserCreating] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserPassword, setEditUserPassword] = useState("");
  const [editUserNickname, setEditUserNickname] = useState("");
  const [editUserSubscription, setEditUserSubscription] = useState("free");
  const [editUserBanReason, setEditUserBanReason] = useState("");
  const [userSaving, setUserSaving] = useState(false);
  const [securityAlerts, setSecurityAlerts] = useState([]);
  const [securityAlertsLoading, setSecurityAlertsLoading] = useState(false);
  const [userDevices, setUserDevices] = useState([]);
  const [userDevicesError, setUserDevicesError] = useState("");
  const [userDevicesLoading, setUserDevicesLoading] = useState(false);
  const [devicesSearch, setDevicesSearch] = useState("");
  const [devicesFocusUserId, setDevicesFocusUserId] = useState(null);
  const devicesListRef = useRef(null);

  const [chatUserId, setChatUserId] = useState(null);
  const [chatSearch, setChatSearch] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatUnreadTotal, setChatUnreadTotal] = useState(0);
  const [chatUnreadByUser, setChatUnreadByUser] = useState({});
  const chatListRef = useRef(null);

  const [newsList, setNewsList] = useState([]);
  const [newsError, setNewsError] = useState("");
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsSaving, setNewsSaving] = useState(false);
  const [editingNewsId, setEditingNewsId] = useState(null);
  const [nTitle, setNTitle] = useState("");
  const [nSlug, setNSlug] = useState("");
  const [nBody, setNBody] = useState("");
  const [nPublished, setNPublished] = useState(false);
  const [newsSearch, setNewsSearch] = useState("");

  const [promoList, setPromoList] = useState([]);
  const [promoError, setPromoError] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoSearch, setPromoSearch] = useState("");
  const [pCode, setPCode] = useState("");
  const [pDiscountType, setPDiscountType] = useState("full");
  const [pDiscountValue, setPDiscountValue] = useState("");
  const [pMaxUses, setPMaxUses] = useState("");
  const [pExpiresAt, setPExpiresAt] = useState("");
  const [pActive, setPActive] = useState(true);

  const [subscriptionAmount, setSubscriptionAmount] = useState("");
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);

  const isAdmin = profile?.subscriptionType === "admin";
  const activeNav = NAV_ITEMS.find((n) => n.id === tab) || NAV_ITEMS[0];

  const selectedCourseObj = useMemo(
    () => adminCatalog.find((c) => c.id === selectedCourse),
    [adminCatalog, selectedCourse]
  );

  const selectedSubtopicObj = useMemo(() => {
    for (const c of adminCatalog) {
      const st = c.subtopics?.find((s) => s.id === selectedSubtopic);
      if (st) return st;
    }
    return null;
  }, [adminCatalog, selectedSubtopic]);

  const contentPath = useMemo(() => {
    const parts = [];
    if (selectedCourseObj) parts.push(selectedCourseObj.title);
    if (selectedSubtopicObj) parts.push(selectedSubtopicObj.title);
    return parts;
  }, [selectedCourseObj, selectedSubtopicObj]);

  const catalogStats = useMemo(() => {
    let chapters = 0;
    let lessons = 0;
    for (const c of adminCatalog) {
      chapters += c.subtopics?.length || 0;
      for (const st of c.subtopics || []) {
        lessons += st.videos?.length || 0;
      }
    }
    return { subjects: adminCatalog.length, chapters, lessons };
  }, [adminCatalog]);

  const catalogIndex = useMemo(() => {
    const items = [];
    for (const course of adminCatalog) {
      items.push({
        key: `course-${course.id}`,
        type: "course",
        label: course.title,
        meta: "Предмет",
        courseId: course.id
      });
      for (const st of course.subtopics || []) {
        items.push({
          key: `subtopic-${st.id}`,
          type: "subtopic",
          label: st.title,
          meta: `${course.title} · глава`,
          courseId: course.id,
          subtopicId: st.id
        });
        for (const v of st.videos || []) {
          items.push({
            key: `video-${v.id}`,
            type: "video",
            label: v.title,
            meta: `${course.title} → ${st.title}`,
            courseId: course.id,
            subtopicId: st.id,
            videoId: v.id
          });
        }
      }
    }
    return items;
  }, [adminCatalog]);

  const filteredCourses = useMemo(
    () => filterAssociative(adminCatalog, courseSearch, (c) => [c.title]),
    [adminCatalog, courseSearch]
  );

  const filteredSubtopics = useMemo(() => {
    const list = selectedCourseObj?.subtopics || [];
    return filterAssociative(list, subtopicSearch, (st) => [st.title]);
  }, [selectedCourseObj, subtopicSearch]);

  const filteredLessons = useMemo(() => {
    const list = selectedSubtopicObj?.videos || [];
    return filterAssociative(list, lessonSearch, (v) => [v.title]);
  }, [selectedSubtopicObj, lessonSearch]);

  const filteredNews = useMemo(
    () => filterAssociative(newsList, newsSearch, (n) => [n.title, n.slug, n.body]),
    [newsList, newsSearch]
  );

  const filteredPromos = useMemo(
    () => filterAssociative(promoList, promoSearch, (p) => [p.code, p.discountType]),
    [promoList, promoSearch]
  );

  const promoSuggestions = useMemo(
    () =>
      suggestAssociative(
        promoList,
        promoSearch,
        (p) => p.code,
        (p) => formatPromoType(p.discountType, p.discountValue)
      ).map(({ item, label, meta }) => ({ key: `promo-${item.id}`, label, meta, item })),
    [promoList, promoSearch]
  );

  const catalogGlobalSuggestions = useMemo(
    () =>
      suggestAssociative(
        catalogIndex,
        catalogGlobalSearch,
        (x) => x.label,
        (x) => x.meta
      ).map(({ item, label, meta }) => ({ key: item.key, label, meta, item })),
    [catalogIndex, catalogGlobalSearch]
  );

  const courseSuggestions = useMemo(
    () =>
      suggestAssociative(
        adminCatalog,
        courseSearch,
        (c) => c.title,
        (c) => `${c.subtopics?.length || 0} глав`
      ).map(({ item, label, meta }) => ({ key: `course-${item.id}`, label, meta, item })),
    [adminCatalog, courseSearch]
  );

  const subtopicSuggestions = useMemo(() => {
    const list = selectedCourseObj?.subtopics || [];
    return suggestAssociative(
      list,
      subtopicSearch,
      (st) => st.title,
      (st) => `${st.videos?.length || 0} уроков`
    ).map(({ item, label, meta }) => ({ key: `subtopic-${item.id}`, label, meta, item }));
  }, [selectedCourseObj, subtopicSearch]);

  const lessonSuggestions = useMemo(() => {
    const list = selectedSubtopicObj?.videos || [];
    return suggestAssociative(list, lessonSearch, (v) => v.title, () => selectedSubtopicObj?.title || "").map(
      ({ item, label, meta }) => ({ key: `video-${item.id}`, label, meta, item })
    );
  }, [selectedSubtopicObj, lessonSearch]);

  const userSuggestions = useMemo(
    () =>
      suggestAssociative(
        users,
        userSearch,
        (u) => u.nickname || u.email,
        (u) => `${u.email} · #${u.id}`
      ).map(({ item, label, meta }) => ({ key: `user-${item.id}`, label, meta, item })),
    [users, userSearch]
  );

  const chatUserSuggestions = useMemo(() => {
    const list = users.filter((u) => u.subscriptionType !== "admin");
    return suggestAssociative(
      list,
      chatSearch,
      (u) => u.nickname || u.email,
      (u) => u.email
    ).map(({ item, label, meta }) => ({ key: `chat-${item.id}`, label, meta, item }));
  }, [users, chatSearch]);

  const newsSuggestions = useMemo(
    () =>
      suggestAssociative(
        newsList,
        newsSearch,
        (n) => n.title,
        (n) => (n.published ? "Опубликовано" : "Черновик")
      ).map(({ item, label, meta }) => ({ key: `news-${item.id}`, label, meta, item })),
    [newsList, newsSearch]
  );

  const filteredUsers = useMemo(
    () => filterAssociative(users, userSearch, (u) => [u.email, u.nickname, String(u.id)]),
    [users, userSearch]
  );

  const multiDeviceUsersCount = useMemo(
    () => users.filter((u) => u.subscriptionType !== "admin" && u.multiDevice).length,
    [users]
  );

  const filteredUserDevices = useMemo(() => {
    const multiOnly = userDevices.filter((item) => item.multiDevice);
    return filterAssociative(multiOnly, devicesSearch, (item) => [
      item.email,
      item.nickname,
      String(item.userId)
    ]);
  }, [userDevices, devicesSearch]);

  const supportUsersOrdered = useMemo(() => {
    const nonAdmin = users.filter((u) => u.subscriptionType !== "admin");
    const matched = filterAssociative(nonAdmin, chatSearch, (u) => [u.email, u.nickname]);
    return matched.slice().sort((a, b) => {
      const aUnread = Number(chatUnreadByUser[Number(a.id)] || 0);
      const bUnread = Number(chatUnreadByUser[Number(b.id)] || 0);
      if (aUnread !== bUnread) return bUnread - aUnread;
      return Number(a.id) - Number(b.id);
    });
  }, [users, chatUnreadByUser, chatSearch]);

  const showToast = useCallback((message, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const loadAdminCatalog = useCallback(async () => {
    setCatalogError("");
    setCatalogLoading(true);
    try {
      const res = await apiRequest("/admin/catalog");
      if (res.status === 503) {
        setCatalogError("Нужна PostgreSQL (DATABASE_URL на сервере).");
        setAdminCatalog([]);
        return;
      }
      if (!res.ok) {
        setCatalogError("Не удалось загрузить каталог.");
        return;
      }
      const data = await res.json();
      setAdminCatalog(data);
      setSelectedCourse((prev) => prev ?? data[0]?.id ?? null);
      setSelectedSubtopic((prev) => {
        if (prev && data.some((c) => c.subtopics?.some((s) => s.id === prev))) return prev;
        return data[0]?.subtopics?.[0]?.id ?? null;
      });
    } finally {
      setCatalogLoading(false);
    }
  }, [apiRequest]);

  const loadUsers = useCallback(async () => {
    setUsersError("");
    setUsersLoading(true);
    try {
      const res = await apiRequest("/admin/users");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setUsersError(err.message || "Не удалось загрузить пользователей");
        setUsers([]);
        return;
      }
      setUsers(await res.json());
    } finally {
      setUsersLoading(false);
    }
  }, [apiRequest]);

  const loadSecurityAlerts = useCallback(async () => {
    setSecurityAlertsLoading(true);
    try {
      const res = await apiRequest("/admin/security-alerts");
      if (!res.ok) {
        setSecurityAlerts([]);
        return;
      }
      setSecurityAlerts(await res.json());
    } finally {
      setSecurityAlertsLoading(false);
    }
  }, [apiRequest]);

  const loadUserDevices = useCallback(async () => {
    setUserDevicesError("");
    setUserDevicesLoading(true);
    try {
      const res = await apiRequest("/admin/user-devices?multiOnly=1");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setUserDevicesError(err.message || "Не удалось загрузить устройства");
        setUserDevices([]);
        return;
      }
      setUserDevices(await res.json());
    } finally {
      setUserDevicesLoading(false);
    }
  }, [apiRequest]);

  async function submitCreateUser(e) {
    e.preventDefault();
    const email = newUserEmail.trim();
    const password = newUserPassword;
    if (!email || password.length < 6) return;

    setUsersError("");
    setUserCreating(true);
    try {
      const payload = {
        email,
        password,
        subscriptionType: newUserSubscription
      };
      const nickname = newUserNickname.trim();
      if (nickname) payload.nickname = nickname;

      const res = await apiRequest("/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setUsersError(err.message || "Не удалось создать ученика");
        showToast(err.message || "Не удалось создать ученика", "error");
        return;
      }
      const created = await res.json();
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserNickname("");
      setNewUserSubscription("free");
      await loadUsers();
      showToast(`Ученик «${created.nickname || created.email}» добавлен`);
    } finally {
      setUserCreating(false);
    }
  }

  function resetUserEditForm() {
    setEditingUserId(null);
    setEditUserEmail("");
    setEditUserPassword("");
    setEditUserNickname("");
    setEditUserSubscription("free");
    setEditUserBanReason("");
  }

  function startEditUser(user) {
    if (user.subscriptionType === "admin") return;
    setEditingUserId(user.id);
    setEditUserEmail(user.email);
    setEditUserPassword("");
    setEditUserNickname(user.nickname);
    setEditUserSubscription(user.subscriptionType);
    setEditUserBanReason(user.banReason || "");
    setUsersError("");
  }

  async function submitEditUser(e) {
    e.preventDefault();
    if (!editingUserId) return;

    const email = editUserEmail.trim();
    const nickname = editUserNickname.trim();
    if (!email || !nickname) return;

    setUsersError("");
    setUserSaving(true);
    try {
      const payload = {
        email,
        nickname,
        subscriptionType: editUserSubscription
      };
      if (editUserPassword.length >= 6) payload.password = editUserPassword;
      if (editUserBanReason.trim()) payload.banReason = editUserBanReason.trim();

      const res = await apiRequest(`/admin/users/${editingUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setUsersError(err.message || "Не удалось сохранить изменения");
        showToast(err.message || "Не удалось сохранить изменения", "error");
        return;
      }
      resetUserEditForm();
      await loadUsers();
      showToast("Данные ученика обновлены");
    } finally {
      setUserSaving(false);
    }
  }

  async function toggleUserBan(user) {
    if (user.subscriptionType === "admin") return;
    const banning = !user.banned;
    let banReason = user.banReason || "";
    if (banning) {
      const input = window.prompt("Причина блокировки (необязательно):", banReason);
      if (input === null) return;
      banReason = input.trim();
    } else if (!window.confirm(`Разблокировать ученика «${user.nickname || user.email}»?`)) {
      return;
    }

    setUsersError("");
    try {
      const payload = { banned: banning };
      if (banning && banReason) payload.banReason = banReason;
      const res = await apiRequest(`/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.message || "Не удалось изменить статус", "error");
        return;
      }
      if (editingUserId === user.id) {
        if (banning) setEditUserBanReason(banReason);
        else setEditUserBanReason("");
      }
      await loadUsers();
      showToast(banning ? "Ученик заблокирован" : "Ученик разблокирован");
    } catch {
      showToast("Не удалось изменить статус", "error");
    }
  }

  async function dismissSecurityAlert(alertId) {
    const res = await apiRequest(`/admin/security-alerts/${alertId}/dismiss`, { method: "POST" });
    if (!res.ok) {
      showToast("Не удалось скрыть уведомление", "error");
      return;
    }
    setSecurityAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }

  function openUserDevices(userId) {
    setDevicesFocusUserId(Number(userId));
    switchTab("devices");
  }

  const loadNews = useCallback(async () => {
    setNewsError("");
    setNewsLoading(true);
    try {
      const res = await apiRequest("/admin/news");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setNewsError(err.message || "Не удалось загрузить новости");
        setNewsList([]);
        return;
      }
      setNewsList(await res.json());
    } finally {
      setNewsLoading(false);
    }
  }, [apiRequest]);

  const loadPromoCodes = useCallback(async () => {
    setPromoError("");
    setPromoLoading(true);
    try {
      const res = await apiRequest("/admin/promo-codes");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPromoError(err.message || "Не удалось загрузить промокоды");
        setPromoList([]);
        return;
      }
      setPromoList(await res.json());
    } finally {
      setPromoLoading(false);
    }
  }, [apiRequest]);

  const loadBillingSettings = useCallback(async () => {
    setBillingLoading(true);
    try {
      const res = await apiRequest("/admin/billing/settings");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPromoError(err.message || "Не удалось загрузить цену");
        return;
      }
      const data = await res.json();
      setSubscriptionAmount(String(data.amount ?? ""));
    } finally {
      setBillingLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin) return;
    void loadAdminCatalog();
  }, [hydrated, token, isAdmin, loadAdminCatalog]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin || tab !== "users") return;
    void loadUsers();
  }, [hydrated, token, isAdmin, tab, loadUsers]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin) return;
    void loadUsers();
  }, [hydrated, token, isAdmin, loadUsers]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin) return;
    void loadSecurityAlerts();
    const timer = setInterval(() => void loadSecurityAlerts(), 30_000);
    return () => clearInterval(timer);
  }, [hydrated, token, isAdmin, loadSecurityAlerts]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin || tab !== "devices") return;
    void loadUserDevices();
    void loadSecurityAlerts();
    void loadUsers();
    const timer = setInterval(() => {
      void loadUserDevices();
      void loadSecurityAlerts();
    }, 30_000);
    return () => clearInterval(timer);
  }, [hydrated, token, isAdmin, tab, loadUserDevices, loadSecurityAlerts, loadUsers]);

  useEffect(() => {
    if (!devicesFocusUserId || tab !== "devices") return;
    const el = devicesListRef.current?.querySelector(`[data-user-id="${devicesFocusUserId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      el.classList.add("adm-device-card-focus");
      const timer = setTimeout(() => el.classList.remove("adm-device-card-focus"), 2400);
      return () => clearTimeout(timer);
    }
  }, [devicesFocusUserId, tab, userDevices]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin || tab !== "support") return;
    void loadUsers();
  }, [hydrated, token, isAdmin, tab, loadUsers]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin || tab !== "news") return;
    void loadNews();
  }, [hydrated, token, isAdmin, tab, loadNews]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin || tab !== "promo") return;
    void loadPromoCodes();
    void loadBillingSettings();
  }, [hydrated, token, isAdmin, tab, loadPromoCodes, loadBillingSettings]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  async function onAdminLogin(e) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const p = await login(email, password);
      if (p?.subscriptionType !== "admin") {
        await logout();
        throw new Error("Нужны права администратора");
      }
    } catch (err) {
      setError(err.message || "Ошибка входа");
    } finally {
      setPending(false);
    }
  }

  async function onLogout() {
    await logout();
    navigate(routes.admin, { replace: true });
  }

  function switchTab(id) {
    setTab(id);
    setSidebarOpen(false);
  }

  function pickCatalogGlobal({ item }) {
    setSelectedCourse(item.courseId);
    if (item.subtopicId) setSelectedSubtopic(item.subtopicId);
    setCatalogGlobalSearch(item.label);
    cancelCatalogEdit();
  }

  function pickCourseSearch({ item }) {
    setSelectedCourse(item.id);
    setSelectedSubtopic(item.subtopics?.[0]?.id ?? null);
    setCourseSearch(item.title);
    cancelCatalogEdit();
  }

  function pickSubtopicSearch({ item }) {
    setSelectedSubtopic(item.id);
    setSubtopicSearch(item.title);
    cancelCatalogEdit();
  }

  function pickLessonSearch({ item }) {
    setLessonSearch(item.title);
    cancelCatalogEdit();
  }

  function pickUserSearch({ item }) {
    setUserSearch(item.email || item.nickname || "");
  }

  function pickChatUserSearch({ item }) {
    setChatUserId(Number(item.id));
    setChatSearch(item.nickname || item.email || "");
  }

  function pickNewsSearch({ item }) {
    setNewsSearch(item.title);
    startEditNews(item);
  }

  function pickPromoSearch({ item }) {
    setPromoSearch(item.code);
  }

  function resetPromoForm() {
    setPCode("");
    setPDiscountType("full");
    setPDiscountValue("");
    setPMaxUses("");
    setPExpiresAt("");
    setPActive(true);
  }

  async function saveBillingSettings(e) {
    e.preventDefault();
    const amount = Number(subscriptionAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setPromoError("Укажите корректную цену (0 или больше)");
      return;
    }
    setBillingSaving(true);
    setPromoError("");
    try {
      const res = await apiRequest("/admin/billing/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Не удалось сохранить цену");
      }
      const data = await res.json();
      setSubscriptionAmount(String(data.amount));
      showToast(`Цена обновлена: ${formatPlanPrice(data.amount)}`);
    } catch (err) {
      setPromoError(err.message || "Ошибка сохранения цены");
    } finally {
      setBillingSaving(false);
    }
  }

  async function submitPromo(e) {
    e.preventDefault();
    const code = pCode.trim();
    if (!code) return;
    setPromoSaving(true);
    setPromoError("");
    try {
      const payload = {
        code,
        discountType: pDiscountType,
        discountValue: pDiscountType === "full" ? 100 : Number(pDiscountValue || 0),
        maxUses: pMaxUses.trim() ? Number(pMaxUses) : null,
        expiresAt: pExpiresAt ? new Date(pExpiresAt).toISOString() : null,
        active: pActive
      };
      const res = await apiRequest("/admin/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Не удалось создать промокод");
      }
      resetPromoForm();
      await loadPromoCodes();
      showToast(`Промокод «${code.toUpperCase()}» создан`);
    } catch (err) {
      setPromoError(err.message || "Ошибка");
    } finally {
      setPromoSaving(false);
    }
  }

  async function togglePromoActive(promo) {
    setPromoError("");
    const res = await apiRequest(`/admin/promo-codes/${promo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !promo.active })
    });
    if (!res.ok) {
      setPromoError("Не удалось обновить промокод");
      return;
    }
    await loadPromoCodes();
    showToast(promo.active ? "Промокод деактивирован" : "Промокод активирован");
  }

  async function deletePromo(id, code) {
    if (!window.confirm(`Удалить промокод «${code}»?`)) return;
    setPromoError("");
    const res = await apiRequest(`/admin/promo-codes/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({}));
      setPromoError(err.message || "Не удалось удалить");
      return;
    }
    await loadPromoCodes();
    showToast("Промокод удалён");
  }

  async function reorderCourses(ids) {
    await apiRequest("/admin/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courses: ids })
    });
    await loadAdminCatalog();
  }

  async function reorderSubtopics(courseId, ids) {
    await apiRequest("/admin/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtopics: [{ courseId, ids }] })
    });
    await loadAdminCatalog();
  }

  async function reorderVideos(subtopicId, ids) {
    await apiRequest("/admin/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videos: [{ subtopicId, ids }] })
    });
    await loadAdminCatalog();
  }

  async function createCourse() {
    const title = newCourseTitle.trim();
    if (!title) return;
    setCatalogError("");
    await apiRequest("/admin/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
    setNewCourseTitle("");
    await loadAdminCatalog();
    showToast(`Предмет «${title}» добавлен`);
  }

  async function createSubtopic() {
    const title = newSubtopicTitle.trim();
    if (!title || !selectedCourse) return;
    setCatalogError("");
    await apiRequest("/admin/subtopics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: selectedCourse, title })
    });
    setNewSubtopicTitle("");
    await loadAdminCatalog();
    showToast(`Глава «${title}» добавлена`);
  }

  async function createVideo() {
    const title = newVideoTitle.trim();
    if (!title || !selectedSubtopic) return;
    const minutes = Number(newVideoDurationMin);
    const durationSec = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0;
    setCatalogError("");
    await apiRequest("/admin/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subtopicId: selectedSubtopic,
        title,
        duration: durationSec,
        streamPath: ""
      })
    });
    setNewVideoTitle("");
    setNewVideoDurationMin("");
    await loadAdminCatalog();
    showToast(`Урок «${title}» создан — загрузите mp4`);
  }

  async function deleteVideo(videoId, title) {
    if (!window.confirm(`Удалить урок «${title}»? Видеофайлы тоже будут удалены.`)) return;
    setCatalogError("");
    const res = await apiRequest(`/admin/videos/${videoId}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      setCatalogError("Не удалось удалить урок");
      showToast("Не удалось удалить урок", "error");
      return;
    }
    await loadAdminCatalog();
    showToast("Урок удалён");
  }

  async function deleteSubtopic(subtopicId, title) {
    if (!window.confirm(`Удалить главу «${title}» и все уроки в ней?`)) return;
    setCatalogError("");
    const res = await apiRequest(`/admin/subtopics/${subtopicId}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      setCatalogError("Не удалось удалить главу");
      showToast("Не удалось удалить главу", "error");
      return;
    }
    if (selectedSubtopic === subtopicId) setSelectedSubtopic(null);
    await loadAdminCatalog();
    showToast("Глава удалена");
  }

  async function deleteCourse(courseId, title) {
    if (!window.confirm(`Удалить предмет «${title}» со всеми главами и уроками?`)) return;
    setCatalogError("");
    const res = await apiRequest(`/admin/courses/${courseId}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      setCatalogError("Не удалось удалить предмет");
      showToast("Не удалось удалить предмет", "error");
      return;
    }
    if (selectedCourse === courseId) {
      setSelectedCourse(null);
      setSelectedSubtopic(null);
    }
    await loadAdminCatalog();
    showToast("Предмет удалён");
  }

  function cancelCatalogEdit() {
    setEditingCourseId(null);
    setEditCourseTitle("");
    setEditingSubtopicId(null);
    setEditSubtopicTitle("");
    setEditingVideoId(null);
    setEditVideoTitle("");
    setEditVideoDurationMin("");
  }

  function startEditCourse(course) {
    cancelCatalogEdit();
    setEditingCourseId(course.id);
    setEditCourseTitle(course.title);
  }

  function startEditSubtopic(subtopic) {
    cancelCatalogEdit();
    setEditingSubtopicId(subtopic.id);
    setEditSubtopicTitle(subtopic.title);
  }

  function startEditVideo(video) {
    cancelCatalogEdit();
    setEditingVideoId(video.id);
    setEditVideoTitle(video.title);
    const minutes = Number(video.duration || 0) > 0 ? String(Math.round(Number(video.duration) / 60)) : "";
    setEditVideoDurationMin(minutes);
  }

  async function saveCourseEdit() {
    const title = editCourseTitle.trim();
    if (!title || !editingCourseId) return;
    setCatalogSaving(true);
    setCatalogError("");
    try {
      const res = await apiRequest(`/admin/courses/${editingCourseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Не удалось сохранить");
      }
      cancelCatalogEdit();
      await loadAdminCatalog();
      showToast("Предмет обновлён");
    } catch (err) {
      setCatalogError(err.message || "Ошибка сохранения");
      showToast(err.message || "Не удалось сохранить", "error");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function saveSubtopicEdit() {
    const title = editSubtopicTitle.trim();
    if (!title || !editingSubtopicId) return;
    setCatalogSaving(true);
    setCatalogError("");
    try {
      const res = await apiRequest(`/admin/subtopics/${editingSubtopicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Не удалось сохранить");
      }
      cancelCatalogEdit();
      await loadAdminCatalog();
      showToast("Глава обновлена");
    } catch (err) {
      setCatalogError(err.message || "Ошибка сохранения");
      showToast(err.message || "Не удалось сохранить", "error");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function saveVideoEdit() {
    const title = editVideoTitle.trim();
    if (!title || !editingVideoId) return;
    const minutes = Number(editVideoDurationMin);
    const durationSec = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0;
    setCatalogSaving(true);
    setCatalogError("");
    try {
      const res = await apiRequest(`/admin/videos/${editingVideoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, duration: durationSec })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Не удалось сохранить");
      }
      cancelCatalogEdit();
      await loadAdminCatalog();
      showToast("Урок обновлён");
    } catch (err) {
      setCatalogError(err.message || "Ошибка сохранения");
      showToast(err.message || "Не удалось сохранить", "error");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function pollHlsReady(videoId) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const res = await apiRequest(`/admin/videos/${videoId}/hls-status`);
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({}));
      if (data.ready) {
        await loadAdminCatalog();
        showToast("Защищённый поток готов к просмотру");
        return;
      }
      if (!data.processing && !data.ready) break;
    }
    showToast("Конвертация ещё идёт — обновите каталог через минуту", "error");
  }

  async function packageExistingVideo(videoId) {
    const res = await apiRequest(`/admin/videos/${videoId}/package-hls`, { method: "POST" });
    if (!res.ok) {
      showToast("Не удалось запустить подготовку видео", "error");
      return;
    }
    showToast("Подготовка защищённого потока…");
    void pollHlsReady(videoId);
  }

  async function uploadVideoFile(videoId, file) {
    const maxBytes = 2 * 1024 * 1024 * 1024;
    if (file.size > maxBytes) {
      setCatalogError("Файл больше 2 ГБ — уменьшите размер или сожмите видео.");
      showToast("Файл слишком большой", "error");
      return;
    }

    const form = new FormData();
    form.append("file", file);
    try {
      const res = await apiRequest(`/admin/videos/${videoId}/upload`, { method: "POST", body: form });
      if (!res.ok) {
        const msg =
          res.status === 413
            ? "Файл слишком большой для сервера. На VPS в nginx для api.lemexplain.com задайте client_max_body_size 2G (в блоке HTTPS)."
            : "Загрузка файла не удалась";
        setCatalogError(msg);
        showToast(res.status === 413 ? "Файл слишком большой (413)" : "Ошибка загрузки видео", "error");
        return;
      }
    } catch {
      setCatalogError(
        "Загрузка не удалась. Частая причина — лимит nginx (413): в конфиге api.lemexplain.com нужен client_max_body_size 2G на порту 443."
      );
      showToast("Ошибка загрузки видео", "error");
      return;
    }
    await loadAdminCatalog();
    showToast("Видео загружено, идёт защита и конвертация…");
    void pollHlsReady(videoId);
  }

  function resetNewsForm() {
    setEditingNewsId(null);
    setNTitle("");
    setNSlug("");
    setNBody("");
    setNPublished(false);
  }

  function startEditNews(item) {
    setEditingNewsId(item.id);
    setNTitle(item.title || "");
    setNSlug(item.slug || "");
    setNBody(item.body || "");
    setNPublished(Boolean(item.published));
  }

  async function submitNews(e) {
    e.preventDefault();
    const title = nTitle.trim();
    if (!title) return;
    setNewsSaving(true);
    setNewsError("");
    try {
      const payload = { title, slug: nSlug.trim() || null, body: nBody, published: nPublished };
      const url = editingNewsId ? `/admin/news/${editingNewsId}` : "/admin/news";
      const res = await apiRequest(url, {
        method: editingNewsId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Не удалось сохранить");
      }
      resetNewsForm();
      await loadNews();
      showToast(editingNewsId ? "Новость обновлена" : "Новость создана");
    } catch (err) {
      setNewsError(err.message || "Ошибка");
    } finally {
      setNewsSaving(false);
    }
  }

  async function deleteNews(id) {
    if (!window.confirm("Удалить эту новость?")) return;
    setNewsError("");
    const res = await apiRequest(`/admin/news/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      setNewsError("Не удалось удалить");
      return;
    }
    if (editingNewsId === id) resetNewsForm();
    await loadNews();
    showToast("Новость удалена");
  }

  const loadChatMessages = useCallback(
    async (userId) => {
      if (!userId) return;
      setChatError("");
      setChatLoading(true);
      try {
        const res = await apiRequest(`/support/messages?userId=${userId}`);
        if (!res.ok) {
          setChatError("Не удалось загрузить чат");
          setChatMessages([]);
          return;
        }
        const data = await res.json();
        setChatMessages(data.messages || []);
        await apiRequest("/support/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId })
        });
      } finally {
        setChatLoading(false);
      }
    },
    [apiRequest]
  );

  const loadChatUnread = useCallback(async () => {
    const res = await apiRequest("/support/unread");
    if (!res.ok) return;
    const data = await res.json().catch(() => ({ total: 0, byUser: [] }));
    setChatUnreadTotal(Number(data.total || 0));
    const map = {};
    for (const row of data.byUser || []) map[row.userId] = Number(row.count || 0);
    setChatUnreadByUser(map);
  }, [apiRequest]);

  useEffect(() => {
    if (tab !== "support" || !users.length) return;
    const nonAdmin = users.filter((u) => u.subscriptionType !== "admin");
    if (!nonAdmin.some((u) => Number(u.id) === Number(chatUserId))) {
      setChatUserId(nonAdmin[0] ? Number(nonAdmin[0].id) : null);
    }
  }, [tab, users, chatUserId]);

  useEffect(() => {
    if (!chatUserId || tab !== "support") return;
    void loadChatMessages(chatUserId);
    const timer = setInterval(() => {
      void loadChatMessages(chatUserId);
      void loadChatUnread();
    }, 5000);
    return () => clearInterval(timer);
  }, [chatUserId, tab, loadChatMessages, loadChatUnread]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin) return;
    void loadChatUnread();
    const timer = setInterval(() => void loadChatUnread(), 5000);
    return () => clearInterval(timer);
  }, [hydrated, token, isAdmin, loadChatUnread]);

  useEffect(() => {
    const el = chatListRef.current;
    if (!el || tab !== "support") return;
    el.scrollTop = el.scrollHeight;
  }, [chatMessages, tab]);

  async function sendChatMessage(e) {
    e.preventDefault();
    const clean = chatText.trim();
    if (!clean || !chatUserId) return;
    setChatSending(true);
    setChatError("");
    try {
      const res = await apiRequest("/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: chatUserId, text: clean })
      });
      if (!res.ok) throw new Error("Не удалось отправить");
      setChatText("");
      await loadChatMessages(chatUserId);
    } catch (err) {
      setChatError(err.message || "Ошибка отправки");
    } finally {
      setChatSending(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="page-loading">
        <p>Загрузка…</p>
      </div>
    );
  }

  if (!token || !isAdmin) {
    return (
      <div className="adm-login">
        <div className="adm-login-box">
          <Link to={routes.home} className="adm-back">
            ← На главную
          </Link>
          <h1>Админ-панель</h1>
          <p style={{ margin: 0, color: "var(--adm-text-muted)", fontSize: 14 }}>
            Вход для управления курсами, пользователями и контентом.
          </p>
          {error && <div className="adm-login-error" style={{ marginTop: 16 }}>{error}</div>}
          <form className="adm-login-form" onSubmit={onAdminLogin}>
            <div className="adm-field">
              <label htmlFor="admin-email">Email</label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div className="adm-field">
              <label htmlFor="admin-password">Пароль</label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="current-password"
              />
            </div>
            <button type="submit" className="adm-btn adm-btn-primary" disabled={pending} style={{ width: "100%" }}>
              {pending ? "Вход…" : "Войти"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const step1Class = selectedCourse ? "done" : "active";
  const step2Class = selectedCourse && !selectedSubtopic ? "active" : selectedSubtopic ? "done" : "";
  const step3Class = selectedSubtopic ? "active" : "";

  return (
    <div className="adm">
      {sidebarOpen && <div className="adm-overlay" onClick={() => setSidebarOpen(false)} aria-hidden />}

      <aside className={`adm-sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="adm-sidebar-brand">
          <strong>Lemexplain</strong>
          <span title={profile?.email}>{profile?.email}</span>
        </div>
        <nav className="adm-nav" aria-label="Разделы">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "adm-nav-item active" : "adm-nav-item"}
              onClick={() => switchTab(item.id)}
            >
              <span className="adm-nav-icon" aria-hidden>{item.icon}</span>
              {item.label}
              {item.id === "support" && chatUnreadTotal > 0 ? (
                <span className="adm-nav-badge">{chatUnreadTotal}</span>
              ) : null}
              {item.id === "users" && multiDeviceUsersCount > 0 ? (
                <span className="adm-nav-badge adm-nav-badge-warn">{multiDeviceUsersCount}</span>
              ) : null}
              {item.id === "devices" && (multiDeviceUsersCount > 0 || securityAlerts.length > 0) ? (
                <span className="adm-nav-badge adm-nav-badge-warn">
                  {Math.max(multiDeviceUsersCount, securityAlerts.length)}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="adm-sidebar-foot">
          <Link to={routes.homePublic} className="adm-sidebar-link">
            Открыть сайт
          </Link>
          <button type="button" className="adm-sidebar-btn" onClick={() => void onLogout()}>
            Выйти
          </button>
        </div>
      </aside>

      <div className="adm-main">
        <header className="adm-topbar">
          <button type="button" className="adm-menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Меню">
            ☰
          </button>
          <div>
            <h1 className="adm-page-title">{activeNav.label}</h1>
            <p className="adm-page-desc">{activeNav.desc}</p>
          </div>
        </header>

        <main className="adm-body">
          {tab === "content" && catalogError && <div className="adm-alert warn">{catalogError}</div>}

          {tab === "content" && (
            <>
              <div className="adm-stats">
                <div className="adm-stat adm-card">
                  <div className="adm-stat-value">{catalogStats.subjects}</div>
                  <div className="adm-stat-label">предметов</div>
                </div>
                <div className="adm-stat adm-card">
                  <div className="adm-stat-value">{catalogStats.chapters}</div>
                  <div className="adm-stat-label">глав</div>
                </div>
                <div className="adm-stat adm-card">
                  <div className="adm-stat-value">{catalogStats.lessons}</div>
                  <div className="adm-stat-label">уроков</div>
                </div>
              </div>

              <div className="adm-guide adm-card">
                <button type="button" className="adm-guide-toggle" onClick={() => setGuideOpen((v) => !v)}>
                  Как добавить урок
                  <span aria-hidden>{guideOpen ? "▲" : "▼"}</span>
                </button>
                {guideOpen && (
                  <div className="adm-guide-body">
                    <div className="adm-steps">
                      <div className={`adm-step ${step1Class}`}>
                        <span className="adm-step-num">1</span>
                        Создайте или выберите <strong>предмет</strong>
                      </div>
                      <div className={`adm-step ${step2Class}`}>
                        <span className="adm-step-num">2</span>
                        Добавьте <strong>главу</strong> в предмете
                      </div>
                      <div className={`adm-step ${step3Class}`}>
                        <span className="adm-step-num">3</span>
                        Создайте <strong>урок</strong> и загрузите mp4
                      </div>
                    </div>
                    {contentPath.length > 0 && (
                      <div className="adm-breadcrumb">{contentPath.join(" → ")}</div>
                    )}
                  </div>
                )}
              </div>

              {catalogLoading ? (
                <div className="adm-loading-block adm-card" style={{ padding: 24 }}>
                  <span className="adm-spinner" />
                  Загрузка каталога…
                </div>
              ) : (
                <>
                  <div className="adm-card adm-catalog-global-search" style={{ padding: 16 }}>
                    <AdminSearchBox
                      id="catalog-global-search"
                      value={catalogGlobalSearch}
                      onChange={setCatalogGlobalSearch}
                      suggestions={catalogGlobalSuggestions}
                      onPick={pickCatalogGlobal}
                      placeholder="Поиск по всему каталогу: предмет, глава, урок…"
                      ariaLabel="Поиск по каталогу"
                      style={{ maxWidth: "100%" }}
                    />
                    <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--adm-text-muted)" }}>
                      Подсказки по совпадению букв — например, «бхм» найдёт «Биохимия».
                    </p>
                  </div>
                  <div className="adm-grid-3">
                  <section className="adm-panel adm-card">
                    <div className="adm-panel-head">
                      <div>
                        <h2>Предметы</h2>
                        <p>Дисциплина или курс верхнего уровня</p>
                      </div>
                    </div>
                    <AdminSearchBox
                      className="adm-search-wrap--panel"
                      id="course-search"
                      value={courseSearch}
                      onChange={setCourseSearch}
                      suggestions={courseSuggestions}
                      onPick={pickCourseSearch}
                      placeholder="Поиск предмета…"
                      ariaLabel="Поиск предмета"
                    />
                    <form
                      className="adm-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void createCourse();
                      }}
                    >
                      <div className="adm-field">
                        <label htmlFor="new-course">Название</label>
                        <input
                          id="new-course"
                          value={newCourseTitle}
                          onChange={(e) => setNewCourseTitle(e.target.value)}
                          placeholder="Биохимия"
                        />
                      </div>
                      <button type="submit" className="adm-btn adm-btn-primary" disabled={!newCourseTitle.trim()}>
                        + Добавить предмет
                      </button>
                    </form>
                    {adminCatalog.length === 0 ? (
                      <div className="adm-empty">
                        <div className="adm-empty-icon">📚</div>
                        Добавьте первый предмет
                      </div>
                    ) : filteredCourses.length === 0 ? (
                      <div className="adm-empty">Ничего не найдено</div>
                    ) : (
                      <ul className="adm-list">
                        {filteredCourses.map((course) => (
                          <li key={course.id} className={`adm-list-item${editingCourseId === course.id ? " is-editing" : ""}`}>
                            {editingCourseId === course.id ? (
                              <form
                                className="adm-list-edit"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void saveCourseEdit();
                                }}
                              >
                                <input
                                  value={editCourseTitle}
                                  onChange={(e) => setEditCourseTitle(e.target.value)}
                                  aria-label="Название предмета"
                                  disabled={catalogSaving}
                                  autoFocus
                                />
                                <div className="adm-list-edit-actions">
                                  <button type="submit" className="adm-btn adm-btn-primary adm-btn-sm" disabled={catalogSaving || !editCourseTitle.trim()}>
                                    {catalogSaving ? "…" : "Сохранить"}
                                  </button>
                                  <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={cancelCatalogEdit} disabled={catalogSaving}>
                                    Отмена
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className={selectedCourse === course.id ? "adm-list-btn active" : "adm-list-btn"}
                                  onClick={() => {
                                    setSelectedCourse(course.id);
                                    setSelectedSubtopic(course.subtopics?.[0]?.id ?? null);
                                  }}
                                >
                                  <strong>{course.title}</strong>
                                  <span>
                                    {course.subtopics?.length || 0}{" "}
                                    {(course.subtopics?.length || 0) === 1 ? "глава" : "глав"}
                                  </span>
                                </button>
                                <div className="adm-list-actions">
                                  <button
                                    type="button"
                                    className="adm-btn adm-btn-secondary adm-btn-sm"
                                    onClick={() => startEditCourse(course)}
                                  >
                                    Изменить
                                  </button>
                                  <div className="adm-reorder">
                                    <button type="button" aria-label="Выше" onClick={() => void reorderCourses(swapInList(adminCatalog.map((c) => c.id), course.id, -1))}>▲</button>
                                    <button type="button" aria-label="Ниже" onClick={() => void reorderCourses(swapInList(adminCatalog.map((c) => c.id), course.id, 1))}>▼</button>
                                  </div>
                                  <button
                                    type="button"
                                    className="adm-btn adm-btn-ghost adm-btn-sm"
                                    aria-label={`Удалить ${course.title}`}
                                    onClick={() => void deleteCourse(course.id, course.title)}
                                  >
                                    Удалить
                                  </button>
                                </div>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className={`adm-panel adm-card${!selectedCourse ? " is-disabled" : ""}`}>
                    <div className="adm-panel-head">
                      <div>
                        <h2>Главы</h2>
                        <p>{selectedCourseObj ? `В «${selectedCourseObj.title}»` : "Выберите предмет"}</p>
                      </div>
                    </div>
                    <AdminSearchBox
                      className="adm-search-wrap--panel"
                      id="subtopic-search"
                      value={subtopicSearch}
                      onChange={setSubtopicSearch}
                      suggestions={subtopicSuggestions}
                      onPick={pickSubtopicSearch}
                      placeholder="Поиск главы…"
                      ariaLabel="Поиск главы"
                      style={{ opacity: selectedCourse ? 1 : 0.5, pointerEvents: selectedCourse ? "auto" : "none" }}
                    />
                    <form
                      className="adm-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void createSubtopic();
                      }}
                    >
                      <div className="adm-field">
                        <label htmlFor="new-chapter">Название главы</label>
                        <input
                          id="new-chapter"
                          value={newSubtopicTitle}
                          onChange={(e) => setNewSubtopicTitle(e.target.value)}
                          placeholder="Белки и ферменты"
                          disabled={!selectedCourse}
                        />
                      </div>
                      <button type="submit" className="adm-btn adm-btn-primary" disabled={!selectedCourse || !newSubtopicTitle.trim()}>
                        + Добавить главу
                      </button>
                    </form>
                    {!selectedCourse ? (
                      <div className="adm-empty">
                        <div className="adm-empty-icon">👈</div>
                        Выберите предмет слева
                      </div>
                    ) : (selectedCourseObj?.subtopics || []).length === 0 ? (
                      <div className="adm-empty">
                        <div className="adm-empty-icon">📑</div>
                        Добавьте первую главу
                      </div>
                    ) : filteredSubtopics.length === 0 ? (
                      <div className="adm-empty">Ничего не найдено</div>
                    ) : (
                      <ul className="adm-list">
                        {filteredSubtopics.map((st) => (
                          <li key={st.id} className={`adm-list-item${editingSubtopicId === st.id ? " is-editing" : ""}`}>
                            {editingSubtopicId === st.id ? (
                              <form
                                className="adm-list-edit"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void saveSubtopicEdit();
                                }}
                              >
                                <input
                                  value={editSubtopicTitle}
                                  onChange={(e) => setEditSubtopicTitle(e.target.value)}
                                  aria-label="Название главы"
                                  disabled={catalogSaving}
                                  autoFocus
                                />
                                <div className="adm-list-edit-actions">
                                  <button type="submit" className="adm-btn adm-btn-primary adm-btn-sm" disabled={catalogSaving || !editSubtopicTitle.trim()}>
                                    {catalogSaving ? "…" : "Сохранить"}
                                  </button>
                                  <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={cancelCatalogEdit} disabled={catalogSaving}>
                                    Отмена
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className={selectedSubtopic === st.id ? "adm-list-btn active" : "adm-list-btn"}
                                  onClick={() => setSelectedSubtopic(st.id)}
                                >
                                  <strong>{st.title}</strong>
                                  <span>
                                    {st.videos?.length || 0}{" "}
                                    {(st.videos?.length || 0) === 1 ? "урок" : "уроков"}
                                  </span>
                                </button>
                                <div className="adm-list-actions">
                                  <button
                                    type="button"
                                    className="adm-btn adm-btn-secondary adm-btn-sm"
                                    onClick={() => startEditSubtopic(st)}
                                  >
                                    Изменить
                                  </button>
                                  <div className="adm-reorder">
                                    <button type="button" aria-label="Выше" onClick={() => { const ids = selectedCourseObj?.subtopics?.map((s) => s.id) || []; void reorderSubtopics(selectedCourse, swapInList(ids, st.id, -1)); }}>▲</button>
                                    <button type="button" aria-label="Ниже" onClick={() => { const ids = selectedCourseObj?.subtopics?.map((s) => s.id) || []; void reorderSubtopics(selectedCourse, swapInList(ids, st.id, 1)); }}>▼</button>
                                  </div>
                                  <button
                                    type="button"
                                    className="adm-btn adm-btn-ghost adm-btn-sm"
                                    aria-label={`Удалить ${st.title}`}
                                    onClick={() => void deleteSubtopic(st.id, st.title)}
                                  >
                                    Удалить
                                  </button>
                                </div>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className={`adm-panel adm-card${!selectedSubtopic ? " is-disabled" : ""}`}>
                    <div className="adm-panel-head">
                      <div>
                        <h2>Уроки</h2>
                        <p>{selectedSubtopicObj ? `В «${selectedSubtopicObj.title}»` : "Выберите главу"}</p>
                      </div>
                    </div>
                    <AdminSearchBox
                      className="adm-search-wrap--panel"
                      id="lesson-search"
                      value={lessonSearch}
                      onChange={setLessonSearch}
                      suggestions={lessonSuggestions}
                      onPick={pickLessonSearch}
                      placeholder="Поиск урока…"
                      ariaLabel="Поиск урока"
                      style={{ opacity: selectedSubtopic ? 1 : 0.5, pointerEvents: selectedSubtopic ? "auto" : "none" }}
                    />
                    <form
                      className="adm-form adm-form-row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void createVideo();
                      }}
                    >
                      <div className="adm-field">
                        <label htmlFor="new-lesson">Название урока</label>
                        <input
                          id="new-lesson"
                          value={newVideoTitle}
                          onChange={(e) => setNewVideoTitle(e.target.value)}
                          placeholder="Введение в белки"
                          disabled={!selectedSubtopic}
                        />
                      </div>
                      <div className="adm-field">
                        <label htmlFor="lesson-min">Мин</label>
                        <input
                          id="lesson-min"
                          type="number"
                          min={1}
                          value={newVideoDurationMin}
                          onChange={(e) => setNewVideoDurationMin(e.target.value)}
                          placeholder="15"
                          disabled={!selectedSubtopic}
                        />
                      </div>
                      <button type="submit" className="adm-btn adm-btn-primary" disabled={!selectedSubtopic || !newVideoTitle.trim()}>
                        + Урок
                      </button>
                    </form>
                    {!selectedSubtopic ? (
                      <div className="adm-empty">
                        <div className="adm-empty-icon">👈</div>
                        Выберите главу
                      </div>
                    ) : (selectedSubtopicObj?.videos || []).length === 0 ? (
                      <div className="adm-empty">
                        <div className="adm-empty-icon">🎬</div>
                        Создайте урок и загрузите видео
                      </div>
                    ) : filteredLessons.length === 0 ? (
                      <div className="adm-empty">Ничего не найдено</div>
                    ) : (
                      <ul className="adm-lesson-list">
                        {filteredLessons.map((v) => (
                          <li key={v.id} className={`adm-lesson${editingVideoId === v.id ? " is-editing" : ""}`}>
                            {editingVideoId === v.id ? (
                              <form
                                className="adm-lesson-edit"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void saveVideoEdit();
                                }}
                              >
                                <div className="adm-form-row">
                                  <div className="adm-field">
                                    <label htmlFor={`edit-lesson-${v.id}`}>Название</label>
                                    <input
                                      id={`edit-lesson-${v.id}`}
                                      value={editVideoTitle}
                                      onChange={(e) => setEditVideoTitle(e.target.value)}
                                      disabled={catalogSaving}
                                      autoFocus
                                    />
                                  </div>
                                  <div className="adm-field">
                                    <label htmlFor={`edit-min-${v.id}`}>Мин</label>
                                    <input
                                      id={`edit-min-${v.id}`}
                                      type="number"
                                      min={1}
                                      value={editVideoDurationMin}
                                      onChange={(e) => setEditVideoDurationMin(e.target.value)}
                                      disabled={catalogSaving}
                                    />
                                  </div>
                                </div>
                                <div className="adm-list-edit-actions">
                                  <button type="submit" className="adm-btn adm-btn-primary adm-btn-sm" disabled={catalogSaving || !editVideoTitle.trim()}>
                                    {catalogSaving ? "…" : "Сохранить"}
                                  </button>
                                  <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={cancelCatalogEdit} disabled={catalogSaving}>
                                    Отмена
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <>
                                <div>
                                  <strong>{v.title}</strong>
                                  <div className="adm-lesson-meta">
                                    {formatLessonDuration(v.duration)}
                                    {isPlayableStream(v.streamPath) ? (
                                      <span className="adm-badge ok"> Готово (защищённый HLS)</span>
                                    ) : isProcessingStream(v.streamPath) ? (
                                      <span className="adm-badge pending"> Конвертация…</span>
                                    ) : v.streamPath ? (
                                      <span className="adm-badge pending"> Нужна подготовка</span>
                                    ) : (
                                      <span className="adm-badge pending"> Нужен файл</span>
                                    )}
                                  </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <button
                                    type="button"
                                    className="adm-btn adm-btn-secondary adm-btn-sm"
                                    onClick={() => startEditVideo(v)}
                                  >
                                    Изменить
                                  </button>
                                  <div className="adm-reorder">
                                    <button type="button" aria-label="Выше" onClick={() => { const ids = selectedSubtopicObj?.videos?.map((x) => x.id) || []; void reorderVideos(selectedSubtopic, swapInList(ids, v.id, -1)); }}>▲</button>
                                    <button type="button" aria-label="Ниже" onClick={() => { const ids = selectedSubtopicObj?.videos?.map((x) => x.id) || []; void reorderVideos(selectedSubtopic, swapInList(ids, v.id, 1)); }}>▼</button>
                                  </div>
                                  <label className={`adm-upload${isPlayableStream(v.streamPath) ? " done" : ""}`}>
                                    {isPlayableStream(v.streamPath) ? "Заменить" : "Загрузить mp4"}
                                    <input
                                      type="file"
                                      accept="video/*"
                                      className="sr-only"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) void uploadVideoFile(v.id, file);
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                  {v.streamPath && !isPlayableStream(v.streamPath) ? (
                                    <button
                                      type="button"
                                      className="btn-secondary inline"
                                      onClick={() => void packageExistingVideo(v.id)}
                                    >
                                      Подготовить поток
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="adm-btn adm-btn-ghost adm-btn-sm"
                                    aria-label={`Удалить ${v.title}`}
                                    onClick={() => void deleteVideo(v.id, v.title)}
                                  >
                                    Удалить
                                  </button>
                                </div>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
                </>
              )}
            </>
          )}

          {tab === "promo" && (
            <>
              <section className="adm-card" style={{ padding: 20, marginBottom: 16 }}>
                {promoError && <div className="adm-alert warn">{promoError}</div>}
                <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Цена подписки</h2>
                <p className="adm-page-desc" style={{ margin: "0 0 16px" }}>
                  Отображается на регистрации и странице оплаты. Промокоды считаются от этой суммы.
                </p>
                {billingLoading ? (
                  <div className="adm-loading-block">
                    <span className="adm-spinner" />
                    Загрузка…
                  </div>
                ) : (
                  <form className="adm-form adm-form-row" style={{ gridTemplateColumns: "1fr auto", maxWidth: 360 }} onSubmit={saveBillingSettings}>
                    <div className="adm-field">
                      <label htmlFor="subscription-amount">Сумма, сом</label>
                      <input
                        id="subscription-amount"
                        type="number"
                        min={0}
                        step={1}
                        value={subscriptionAmount}
                        onChange={(e) => setSubscriptionAmount(e.target.value)}
                        required
                      />
                    </div>
                    <button type="submit" className="adm-btn adm-btn-primary" disabled={billingSaving} style={{ alignSelf: "end" }}>
                      {billingSaving ? "Сохранение…" : "Сохранить"}
                    </button>
                  </form>
                )}
                {subscriptionAmount !== "" && !billingLoading ? (
                  <p className="muted small" style={{ margin: "12px 0 0" }}>
                    Сейчас на сайте: <strong>{formatPlanPrice(Number(subscriptionAmount))}</strong>
                  </p>
                ) : null}
              </section>

            <div className="adm-news-layout">
              <section className="adm-card" style={{ padding: 20 }}>
                <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Новый промокод</h2>
                <p className="adm-page-desc" style={{ margin: "0 0 16px" }}>
                  «100%» даёт бесплатный доступ без Finik. Процент и фиксированная скидка считаются от цены выше.
                </p>
                <form className="adm-form" onSubmit={submitPromo}>
                  <div className="adm-field">
                    <label htmlFor="promo-code-new">Код</label>
                    <input
                      id="promo-code-new"
                      value={pCode}
                      onChange={(e) => setPCode(e.target.value.toUpperCase())}
                      placeholder="WELCOME2026"
                      required
                      maxLength={32}
                    />
                  </div>
                  <div className="adm-field">
                    <label htmlFor="promo-type">Тип скидки</label>
                    <select
                      id="promo-type"
                      value={pDiscountType}
                      onChange={(e) => setPDiscountType(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--adm-border)" }}
                    >
                      <option value="full">100% — бесплатно</option>
                      <option value="percent">Процент</option>
                      <option value="fixed">Фиксированная сумма (сом)</option>
                    </select>
                  </div>
                  {pDiscountType !== "full" ? (
                    <div className="adm-field">
                      <label htmlFor="promo-value">{pDiscountType === "percent" ? "Процент" : "Сумма скидки"}</label>
                      <input
                        id="promo-value"
                        type="number"
                        min={0}
                        max={pDiscountType === "percent" ? 100 : undefined}
                        value={pDiscountValue}
                        onChange={(e) => setPDiscountValue(e.target.value)}
                        required
                      />
                    </div>
                  ) : null}
                  <div className="adm-field">
                    <label htmlFor="promo-max">Лимит активаций (необязательно)</label>
                    <input
                      id="promo-max"
                      type="number"
                      min={1}
                      value={pMaxUses}
                      onChange={(e) => setPMaxUses(e.target.value)}
                      placeholder="Без лимита"
                    />
                  </div>
                  <div className="adm-field">
                    <label htmlFor="promo-expires">Действует до (необязательно)</label>
                    <input
                      id="promo-expires"
                      type="datetime-local"
                      value={pExpiresAt}
                      onChange={(e) => setPExpiresAt(e.target.value)}
                    />
                  </div>
                  <label className="adm-checkbox">
                    <input type="checkbox" checked={pActive} onChange={(e) => setPActive(e.target.checked)} />
                    Активен сразу после создания
                  </label>
                  <button type="submit" className="adm-btn adm-btn-primary" disabled={promoSaving}>
                    {promoSaving ? "Создание…" : "Выпустить промокод"}
                  </button>
                </form>
              </section>

              <section className="adm-card" style={{ padding: 20 }}>
                <h2 style={{ margin: "0 0 16px", fontSize: "1rem" }}>Все промокоды</h2>
                <AdminSearchBox
                  id="promo-search"
                  value={promoSearch}
                  onChange={setPromoSearch}
                  suggestions={promoSuggestions}
                  onPick={pickPromoSearch}
                  placeholder="Поиск по коду…"
                  ariaLabel="Поиск промокодов"
                  style={{ marginBottom: 16 }}
                />
                {promoLoading ? (
                  <div className="adm-loading-block">
                    <span className="adm-spinner" />
                    Загрузка…
                  </div>
                ) : promoList.length === 0 ? (
                  <div className="adm-empty">Промокодов пока нет</div>
                ) : filteredPromos.length === 0 ? (
                  <div className="adm-empty">Ничего не найдено</div>
                ) : (
                  <ul className="adm-list" style={{ maxHeight: "none" }}>
                    {filteredPromos.map((p) => (
                      <li key={p.id} className="adm-list-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
                        <div className="adm-lesson" style={{ flexWrap: "wrap" }}>
                          <div>
                            <strong>{p.code}</strong>
                            <div className="adm-lesson-meta">
                              <span className="adm-badge ok">{formatPromoType(p.discountType, p.discountValue)}</span>
                              {p.active ? (
                                <span className="adm-badge ok"> Активен</span>
                              ) : (
                                <span className="adm-badge pending"> Выключен</span>
                              )}
                              {" · "}
                              {p.usesCount}
                              {p.maxUses != null ? ` / ${p.maxUses}` : ""} использ.
                              {p.expiresAt ? ` · до ${new Date(p.expiresAt).toLocaleDateString("ru-RU")}` : ""}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => void togglePromoActive(p)}>
                              {p.active ? "Выключить" : "Включить"}
                            </button>
                            <button
                              type="button"
                              className="adm-btn adm-btn-ghost adm-btn-sm"
                              onClick={() => void deletePromo(p.id, p.code)}
                              disabled={p.usesCount > 0}
                              title={p.usesCount > 0 ? "Уже использован — только выключение" : undefined}
                            >
                              Удалить
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
            </>
          )}

          {tab === "users" && (
            <div className="adm-news-layout">
              <section className="adm-card" style={{ padding: 20 }}>
                <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>
                  {editingUserId ? `Редактирование #${editingUserId}` : "Новый ученик"}
                </h2>
                <p className="adm-page-desc" style={{ margin: "0 0 16px" }}>
                  {editingUserId
                    ? "Измените данные ученика, тариф или пароль. Для смены пароля введите новый (мин. 6 символов)."
                    : "Создайте учётную запись вручную. Ученик сможет войти с указанным email и паролем."}
                </p>
                {usersError && <div className="adm-alert warn">{usersError}</div>}
                {editingUserId ? (
                  <form className="adm-form" onSubmit={submitEditUser}>
                    <div className="adm-field">
                      <label htmlFor="edit-user-email">Email</label>
                      <input
                        id="edit-user-email"
                        type="email"
                        value={editUserEmail}
                        onChange={(e) => setEditUserEmail(e.target.value)}
                        required
                        autoComplete="off"
                      />
                    </div>
                    <div className="adm-field">
                      <label htmlFor="edit-user-nickname">Ник</label>
                      <input
                        id="edit-user-nickname"
                        value={editUserNickname}
                        onChange={(e) => setEditUserNickname(e.target.value)}
                        required
                        maxLength={80}
                      />
                    </div>
                    <div className="adm-field">
                      <label htmlFor="edit-user-password">Новый пароль (необязательно)</label>
                      <input
                        id="edit-user-password"
                        type="password"
                        value={editUserPassword}
                        onChange={(e) => setEditUserPassword(e.target.value)}
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="Оставьте пустым, чтобы не менять"
                      />
                    </div>
                    <div className="adm-field">
                      <label htmlFor="edit-user-subscription">Тариф</label>
                      <select
                        id="edit-user-subscription"
                        value={editUserSubscription}
                        onChange={(e) => setEditUserSubscription(e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--adm-border)" }}
                      >
                        <option value="free">Free</option>
                        <option value="basic">Basic</option>
                        <option value="premium">Pro</option>
                        <option value="mentor">Mentor</option>
                      </select>
                    </div>
                    <div className="adm-field">
                      <label htmlFor="edit-user-ban-reason">Причина блокировки (если заблокирован)</label>
                      <input
                        id="edit-user-ban-reason"
                        value={editUserBanReason}
                        onChange={(e) => setEditUserBanReason(e.target.value)}
                        maxLength={500}
                        placeholder="Видна только администратору"
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="submit" className="adm-btn adm-btn-primary" disabled={userSaving}>
                        {userSaving ? "Сохранение…" : "Сохранить"}
                      </button>
                      <button type="button" className="adm-btn adm-btn-secondary" onClick={resetUserEditForm}>
                        Отмена
                      </button>
                    </div>
                  </form>
                ) : (
                <form className="adm-form" onSubmit={submitCreateUser}>
                  <div className="adm-field">
                    <label htmlFor="new-user-email">Email</label>
                    <input
                      id="new-user-email"
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      required
                      autoComplete="off"
                    />
                  </div>
                  <div className="adm-field">
                    <label htmlFor="new-user-password">Пароль</label>
                    <input
                      id="new-user-password"
                      type="password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="adm-field">
                    <label htmlFor="new-user-nickname">Ник (необязательно)</label>
                    <input
                      id="new-user-nickname"
                      value={newUserNickname}
                      onChange={(e) => setNewUserNickname(e.target.value)}
                      maxLength={80}
                      placeholder="Из email, если пусто"
                    />
                  </div>
                  <div className="adm-field">
                    <label htmlFor="new-user-subscription">Тариф</label>
                    <select
                      id="new-user-subscription"
                      value={newUserSubscription}
                      onChange={(e) => setNewUserSubscription(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--adm-border)" }}
                    >
                      <option value="free">Free</option>
                      <option value="basic">Basic</option>
                      <option value="premium">Pro</option>
                      <option value="mentor">Mentor</option>
                    </select>
                  </div>
                  <button type="submit" className="adm-btn adm-btn-primary" disabled={userCreating}>
                    {userCreating ? "Создание…" : "Добавить ученика"}
                  </button>
                </form>
                )}
              </section>

              <section className="adm-card" style={{ padding: 20 }}>
                <h2 style={{ margin: "0 0 16px", fontSize: "1rem" }}>Все пользователи</h2>
                <AdminSearchBox
                  id="user-search"
                  value={userSearch}
                  onChange={setUserSearch}
                  suggestions={userSuggestions}
                  onPick={pickUserSearch}
                  placeholder="Поиск по email, нику или ID…"
                  ariaLabel="Поиск пользователей"
                  style={{ marginBottom: 16 }}
                />
                {usersLoading ? (
                  <div className="adm-loading-block">
                    <span className="adm-spinner" />
                    Загрузка…
                  </div>
                ) : (
                  <div className="adm-table-wrap">
                    <table className="adm-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Email</th>
                          <th>Ник</th>
                          <th>Тариф</th>
                          <th>Статус</th>
                          <th>Устройства</th>
                          <th>Регистрация</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ textAlign: "center", color: "var(--adm-text-muted)" }}>
                              {userSearch.trim() ? "Ничего не найдено" : "Нет пользователей"}
                            </td>
                          </tr>
                        ) : (
                          filteredUsers.map((u) => {
                            const tag = subscriptionTag(u.subscriptionType);
                            const isAdminUser = u.subscriptionType === "admin";
                            const rowClass = [
                              u.banned ? "adm-row-banned" : null,
                              !isAdminUser && u.multiDevice ? "adm-row-multi-device" : null
                            ]
                              .filter(Boolean)
                              .join(" ");
                            return (
                              <tr key={u.id} className={rowClass || undefined}>
                                <td>{u.id}</td>
                                <td>{u.email}</td>
                                <td>{u.nickname}</td>
                                <td>
                                  <span className={`adm-tag ${tag.className}`}>{tag.label}</span>
                                </td>
                                <td>
                                  {u.banned ? (
                                    <span className="adm-tag adm-tag-banned" title={u.banReason || undefined}>
                                      Заблокирован
                                    </span>
                                  ) : u.multiDevice ? (
                                    <span className="adm-tag adm-tag-multi-device">Несколько устройств</span>
                                  ) : (
                                    <span className="adm-tag adm-tag-active">Активен</span>
                                  )}
                                </td>
                                <td>
                                  {isAdminUser ? (
                                    "—"
                                  ) : u.multiDevice ? (
                                    <button
                                      type="button"
                                      className="adm-device-count-btn"
                                      onClick={() => openUserDevices(u.id)}
                                      title="Открыть список устройств"
                                    >
                                      {u.deviceCount ?? 0}
                                    </button>
                                  ) : (
                                    (u.deviceCount ?? 0)
                                  )}
                                </td>
                                <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString("ru-RU") : "—"}</td>
                                <td>
                                  {!isAdminUser && (
                                    <div className="adm-table-actions">
                                      <button
                                        type="button"
                                        className="adm-btn adm-btn-secondary adm-btn-sm"
                                        onClick={() => startEditUser(u)}
                                      >
                                        Изменить
                                      </button>
                                      {u.multiDevice ? (
                                        <button
                                          type="button"
                                          className="adm-btn adm-btn-ghost adm-btn-sm adm-btn-danger-text"
                                          onClick={() => openUserDevices(u.id)}
                                        >
                                          Устройства
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        className={`adm-btn adm-btn-sm ${u.banned ? "adm-btn-primary" : "adm-btn-ghost adm-btn-danger"}`}
                                        onClick={() => void toggleUserBan(u)}
                                      >
                                        {u.banned ? "Разбанить" : "Забанить"}
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === "devices" && (
            <div className="adm-devices-layout">
              {securityAlerts.length > 0 && (
                <section className="adm-security-alerts adm-card">
                  <div className="adm-security-alerts-head">
                    <strong>⚠ Подозрительная активность</strong>
                    {securityAlertsLoading ? (
                      <span className="adm-security-alerts-loading">обновление…</span>
                    ) : null}
                  </div>
                  <ul className="adm-security-alerts-list">
                    {securityAlerts.map((alert) => (
                      <li key={alert.id} className="adm-security-alert-item">
                        <div>
                          <p className="adm-security-alert-msg">{alert.message}</p>
                          <p className="adm-security-alert-meta">
                            {alert.userEmail}
                            {alert.meta?.otherDeviceCount ? ` · устройств: ${alert.meta.otherDeviceCount + 1}` : ""}
                            {alert.createdAt
                              ? ` · ${new Date(alert.createdAt).toLocaleString("ru-RU")}`
                              : ""}
                          </p>
                        </div>
                        <div className="adm-security-alert-actions">
                          <button
                            type="button"
                            className="adm-btn adm-btn-secondary adm-btn-sm"
                            onClick={() => openUserDevices(alert.userId)}
                          >
                            Устройства
                          </button>
                          <button
                            type="button"
                            className="adm-btn adm-btn-ghost adm-btn-sm"
                            onClick={() => void dismissSecurityAlert(alert.id)}
                          >
                            Скрыть
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="adm-card adm-devices-panel">
                <div className="adm-devices-panel-head">
                  <div>
                    <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Ученики с несколькими устройствами</h2>
                    <p className="adm-page-desc" style={{ margin: 0 }}>
                      Показаны активные сессии: ID устройства, IP, браузер и время последнего входа.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    onClick={() => void loadUserDevices()}
                    disabled={userDevicesLoading}
                  >
                    {userDevicesLoading ? "Обновление…" : "Обновить"}
                  </button>
                </div>

                {userDevicesError && <div className="adm-alert warn">{userDevicesError}</div>}

                <AdminSearchBox
                  id="devices-search"
                  value={devicesSearch}
                  onChange={setDevicesSearch}
                  suggestions={[]}
                  placeholder="Поиск по email, нику или ID…"
                  ariaLabel="Поиск по устройствам"
                  style={{ margin: "16px 0" }}
                />

                {userDevicesLoading && filteredUserDevices.length === 0 ? (
                  <div className="adm-loading-block">
                    <span className="adm-spinner" />
                    Загрузка…
                  </div>
                ) : filteredUserDevices.length === 0 ? (
                  <p className="adm-devices-empty">
                    {devicesSearch.trim()
                      ? "Ничего не найдено"
                      : "Сейчас нет учеников с входами с нескольких устройств"}
                  </p>
                ) : (
                  <div className="adm-devices-list" ref={devicesListRef}>
                    {filteredUserDevices.map((item) => (
                      <article
                        key={item.userId}
                        data-user-id={item.userId}
                        className={`adm-device-card ${item.multiDevice ? "adm-device-card-warn" : ""}`}
                      >
                        <div className="adm-device-card-head">
                          <div>
                            <strong>{item.nickname || item.email}</strong>
                            <p className="adm-device-card-meta">
                              {item.email} · ID {item.userId}
                              {item.banned ? " · заблокирован" : ""}
                            </p>
                          </div>
                          <span className="adm-tag adm-tag-multi-device">{item.deviceCount} устройств</span>
                        </div>
                        <div className="adm-table-wrap">
                          <table className="adm-table adm-device-table">
                            <thead>
                              <tr>
                                <th>Устройство</th>
                                <th>IP</th>
                                <th>Браузер</th>
                                <th>Последний вход</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.devices.map((device) => (
                                <tr key={device.deviceId}>
                                  <td>
                                    <code className="adm-device-id" title={device.deviceId}>
                                      {shortenDeviceId(device.deviceId)}
                                    </code>
                                  </td>
                                  <td>{device.ip || "—"}</td>
                                  <td title={device.userAgent || undefined}>{describeUserAgent(device.userAgent)}</td>
                                  <td>
                                    {device.lastActive
                                      ? new Date(device.lastActive).toLocaleString("ru-RU")
                                      : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="adm-device-card-actions">
                          <button
                            type="button"
                            className="adm-btn adm-btn-secondary adm-btn-sm"
                            onClick={() => {
                              const u = users.find((x) => Number(x.id) === Number(item.userId));
                              switchTab("users");
                              if (u) startEditUser(u);
                            }}
                          >
                            Профиль ученика
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === "news" && (
            <div className="adm-news-layout">
              <section className="adm-card" style={{ padding: 20 }}>
                {newsError && <div className="adm-alert warn">{newsError}</div>}
                <h2 style={{ margin: "0 0 16px", fontSize: "1rem" }}>
                  {editingNewsId ? `Редактирование #${editingNewsId}` : "Новая новость"}
                </h2>
                <form className="adm-form" onSubmit={submitNews}>
                  <div className="adm-field">
                    <label htmlFor="news-title">Заголовок</label>
                    <input id="news-title" value={nTitle} onChange={(e) => setNTitle(e.target.value)} required maxLength={500} />
                  </div>
                  <div className="adm-field">
                    <label htmlFor="news-slug">Slug (необязательно)</label>
                    <input id="news-slug" value={nSlug} onChange={(e) => setNSlug(e.target.value)} maxLength={200} placeholder="start-semester" />
                  </div>
                  <div className="adm-field">
                    <label htmlFor="news-body">Текст</label>
                    <textarea id="news-body" className="adm-textarea" value={nBody} onChange={(e) => setNBody(e.target.value)} rows={8} />
                  </div>
                  <label className="adm-checkbox">
                    <input type="checkbox" checked={nPublished} onChange={(e) => setNPublished(e.target.checked)} />
                    Опубликовано на сайте
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="submit" className="adm-btn adm-btn-primary" disabled={newsSaving}>
                      {newsSaving ? "Сохранение…" : editingNewsId ? "Сохранить" : "Создать"}
                    </button>
                    {editingNewsId && (
                      <button type="button" className="adm-btn adm-btn-ghost" onClick={resetNewsForm}>
                        Отмена
                      </button>
                    )}
                  </div>
                </form>
              </section>

              <section className="adm-card" style={{ padding: 20 }}>
                <h2 style={{ margin: "0 0 16px", fontSize: "1rem" }}>Все новости</h2>
                <AdminSearchBox
                  id="news-search"
                  value={newsSearch}
                  onChange={setNewsSearch}
                  suggestions={newsSuggestions}
                  onPick={pickNewsSearch}
                  placeholder="Поиск по заголовку, slug или тексту…"
                  ariaLabel="Поиск новостей"
                  style={{ marginBottom: 16 }}
                />
                {newsLoading ? (
                  <div className="adm-loading-block">
                    <span className="adm-spinner" />
                    Загрузка…
                  </div>
                ) : newsList.length === 0 ? (
                  <div className="adm-empty">Новостей пока нет</div>
                ) : filteredNews.length === 0 ? (
                  <div className="adm-empty">Ничего не найдено</div>
                ) : (
                  <ul className="adm-list" style={{ maxHeight: "none" }}>
                    {filteredNews.map((n) => (
                      <li key={n.id} className="adm-list-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
                        <div className="adm-lesson" style={{ flexWrap: "wrap" }}>
                          <div>
                            <strong>{n.title}</strong>
                            <div className="adm-lesson-meta">
                              {n.published ? (
                                <span className="adm-badge ok">Опубликовано</span>
                              ) : (
                                <span className="adm-badge pending">Черновик</span>
                              )}
                              {n.updatedAt && ` · ${new Date(n.updatedAt).toLocaleDateString("ru-RU")}`}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => startEditNews(n)}>
                              Изменить
                            </button>
                            <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => void deleteNews(n.id)}>
                              Удалить
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {tab === "support" && (
            <section className="adm-card" style={{ padding: 20 }}>
              {chatError && <div className="adm-alert warn">{chatError}</div>}
              <div className="adm-chat-layout">
                <aside>
                  <AdminSearchBox
                    id="chat-user-search"
                    value={chatSearch}
                    onChange={setChatSearch}
                    suggestions={chatUserSuggestions}
                    onPick={pickChatUserSearch}
                    placeholder="Поиск пользователя…"
                    ariaLabel="Поиск пользователя в чате"
                    style={{ marginBottom: 12 }}
                  />
                  <div className="adm-chat-users">
                    {supportUsersOrdered.length === 0 ? (
                      <div className="adm-empty">{chatSearch.trim() ? "Ничего не найдено" : "Нет пользователей"}</div>
                    ) : (
                      supportUsersOrdered.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          className={Number(chatUserId) === Number(u.id) ? "adm-list-btn active" : "adm-list-btn"}
                          onClick={() => setChatUserId(Number(u.id))}
                        >
                          <strong>{u.nickname || u.email}</strong>
                          <span>{u.email}</span>
                          {chatUnreadByUser[Number(u.id)] ? (
                            <span className="adm-nav-badge" style={{ marginTop: 4, alignSelf: "flex-start" }}>
                              {chatUnreadByUser[Number(u.id)]}
                            </span>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                </aside>
                <div className="adm-chat-main">
                  <div className="adm-chat-messages" ref={chatListRef}>
                    {chatLoading ? (
                      <div className="adm-loading-block">
                        <span className="adm-spinner" />
                        Загрузка…
                      </div>
                    ) : chatMessages.length === 0 ? (
                      <div className="adm-empty">Напишите первое сообщение</div>
                    ) : (
                      chatMessages.map((m) => (
                        <div key={m.id} className={m.senderRole === "admin" ? "support-msg support-msg-mine" : "support-msg support-msg-admin"}>
                          <div className="support-msg-meta">
                            <strong>{m.senderRole === "admin" ? "Вы" : "Ученик"}</strong>
                            <span>{new Date(m.createdAt).toLocaleString("ru-RU")}</span>
                          </div>
                          {m.videoTitle || m.videoId ? (
                            <div className="muted small">Урок: {m.videoTitle || `#${m.videoId}`}</div>
                          ) : null}
                          <p>{m.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <form className="adm-chat-compose" onSubmit={sendChatMessage}>
                    <textarea
                      className="adm-textarea"
                      value={chatText}
                      onChange={(e) => setChatText(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="Ответ ученику…"
                    />
                    <button type="submit" className="adm-btn adm-btn-primary" disabled={!chatUserId || chatSending || !chatText.trim()} style={{ alignSelf: "flex-end" }}>
                      {chatSending ? "Отправка…" : "Отправить"}
                    </button>
                  </form>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {toast && (
        <div className="adm-toast-stack" role="status">
          <div className={`adm-toast ${toast.type}`}>{toast.message}</div>
        </div>
      )}
    </div>
  );
}
