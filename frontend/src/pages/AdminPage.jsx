import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
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
  { id: "users", label: "Пользователи", icon: "👥", desc: "Учётные записи и тарифы" },
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

  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");

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

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        String(u.email).toLowerCase().includes(q) ||
        String(u.nickname || "").toLowerCase().includes(q) ||
        String(u.id).includes(q)
    );
  }, [users, userSearch]);

  const supportUsersOrdered = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    return users
      .filter((u) => u.subscriptionType !== "admin")
      .filter((u) => {
        if (!q) return true;
        return (
          String(u.email).toLowerCase().includes(q) ||
          String(u.nickname || "").toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => {
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

  useEffect(() => {
    if (!hydrated || !token || !isAdmin) return;
    void loadAdminCatalog();
  }, [hydrated, token, isAdmin, loadAdminCatalog]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin || tab !== "users") return;
    void loadUsers();
  }, [hydrated, token, isAdmin, tab, loadUsers]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin || tab !== "support") return;
    void loadUsers();
  }, [hydrated, token, isAdmin, tab, loadUsers]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin || tab !== "news") return;
    void loadNews();
  }, [hydrated, token, isAdmin, tab, loadNews]);

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
    navigate("/admin", { replace: true });
  }

  function switchTab(id) {
    setTab(id);
    setSidebarOpen(false);
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
    const form = new FormData();
    form.append("file", file);
    const res = await apiRequest(`/admin/videos/${videoId}/upload`, { method: "POST", body: form });
    if (!res.ok) {
      setCatalogError("Загрузка файла не удалась");
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
          <Link to="/" className="adm-back">
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
            </button>
          ))}
        </nav>
        <div className="adm-sidebar-foot">
          <Link to="/" className="adm-sidebar-link">
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
                <div className="adm-grid-3">
                  <section className="adm-panel adm-card">
                    <div className="adm-panel-head">
                      <div>
                        <h2>Предметы</h2>
                        <p>Дисциплина или курс верхнего уровня</p>
                      </div>
                    </div>
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
                    ) : (
                      <ul className="adm-list">
                        {adminCatalog.map((course) => (
                          <li key={course.id} className="adm-list-item">
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
                            <div className="adm-reorder">
                              <button type="button" aria-label="Выше" onClick={() => void reorderCourses(swapInList(adminCatalog.map((c) => c.id), course.id, -1))}>▲</button>
                              <button type="button" aria-label="Ниже" onClick={() => void reorderCourses(swapInList(adminCatalog.map((c) => c.id), course.id, 1))}>▼</button>
                            </div>
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
                    ) : (
                      <ul className="adm-list">
                        {(selectedCourseObj?.subtopics || []).map((st) => (
                          <li key={st.id} className="adm-list-item">
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
                            <div className="adm-reorder">
                              <button type="button" aria-label="Выше" onClick={() => { const ids = selectedCourseObj?.subtopics?.map((s) => s.id) || []; void reorderSubtopics(selectedCourse, swapInList(ids, st.id, -1)); }}>▲</button>
                              <button type="button" aria-label="Ниже" onClick={() => { const ids = selectedCourseObj?.subtopics?.map((s) => s.id) || []; void reorderSubtopics(selectedCourse, swapInList(ids, st.id, 1)); }}>▼</button>
                            </div>
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
                    ) : (
                      <ul className="adm-lesson-list">
                        {(selectedSubtopicObj?.videos || []).map((v) => (
                          <li key={v.id} className="adm-lesson">
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
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              )}
            </>
          )}

          {tab === "users" && (
            <section className="adm-card" style={{ padding: 20 }}>
              {usersError && <div className="adm-alert warn">{usersError}</div>}
              <input
                type="search"
                className="adm-search"
                placeholder="Поиск по email, нику или ID…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
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
                        <th>Регистрация</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", color: "var(--adm-text-muted)" }}>
                            Ничего не найдено
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => {
                          const tag = subscriptionTag(u.subscriptionType);
                          return (
                            <tr key={u.id}>
                              <td>{u.id}</td>
                              <td>{u.email}</td>
                              <td>{u.nickname}</td>
                              <td>
                                <span className={`adm-tag ${tag.className}`}>{tag.label}</span>
                              </td>
                              <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString("ru-RU") : "—"}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
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
                {newsLoading ? (
                  <div className="adm-loading-block">
                    <span className="adm-spinner" />
                    Загрузка…
                  </div>
                ) : newsList.length === 0 ? (
                  <div className="adm-empty">Новостей пока нет</div>
                ) : (
                  <ul className="adm-list" style={{ maxHeight: "none" }}>
                    {newsList.map((n) => (
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
                  <input
                    type="search"
                    className="adm-search"
                    style={{ maxWidth: "none", marginBottom: 12 }}
                    placeholder="Поиск пользователя…"
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                  />
                  <div className="adm-chat-users">
                    {supportUsersOrdered.length === 0 ? (
                      <div className="adm-empty">Нет пользователей</div>
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
